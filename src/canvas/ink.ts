/* The ink layer of one canvas: an SVG overlay inside the canvas's own
 * transformed element, so strokes pan and zoom with the cards; a control
 * group in the canvas's controls column, styled by the theme like the
 * canvas's own; a draw surface that exists only while a pen mode is on,
 * so normal canvas interaction is untouched otherwise; and the strokes
 * themselves, which live in `canvas.data.metadata.icorCanvases` and are
 * saved by the canvas's own save path (see src/canvas/format.ts). Every
 * stroke change replaces `canvas.data` with a new object and calls
 * `requestSave`, which is also what puts the change into the canvas's undo
 * history; undo and redo, and a reload of the file, all land in `setData`
 * or `applyHistory`, both patched to re-render the overlay. */
import { Notice, setIcon, setTooltip } from 'obsidian';
import type { InkColor, InkStroke } from './format';
import { readInk, withInk } from './format';
import { INK_COLOR_NAMES, INK_WIDTH_UNITS, StrokeBuilder, newStrokeId, nextColor, nextWidth, pathData, strokeHit } from './inkModel';
import type { InkWidth } from './inkModel';
import { around, targetElement } from './internals';
import type { Canvas, CanvasMember } from './internals';

export type InkMode = 'off' | 'draw' | 'erase';

export interface InkOptions {
  color: InkColor;
  width: InkWidth;
  /* Whether a stylus draws while drawing mode is off. Read per press. */
  penDraws: () => boolean;
  /* No control group on a phone: the column is already full there and
     the commands carry the same actions to the mobile toolbar. */
  controls: boolean;
  log: (message: string) => void;
}

/* The eraser end of a stylus reports as button 5 in `buttons`. */
const PEN_ERASER_BUTTON = 32;

/* What the layer reads or calls on the canvas. */
export const INK_MEMBERS: readonly CanvasMember[] = ['canvasEl', 'wrapperEl', 'view', 'data', 'readonly', 'requestSave', 'setData', 'posFromEvt'];

const CLEAR_WINDOW_MS = 5000;
/* Eraser reach on screen, converted to canvas units at the current zoom. */
const ERASE_RADIUS_PX = 8;
const READONLY = 'This canvas is read-only. Unlock it to draw.';
const NO_STROKES = 'There are no strokes on this canvas.';

interface Drawing {
  id: string;
  builder: StrokeBuilder;
  path: SVGPathElement;
  pointerId: number;
  pen: boolean;
}

export class InkLayer {
  private mode: InkMode = 'off';
  /* A stylus press while the mode was off: the mode goes back off when
     the stroke ends. */
  private transient = false;
  private color: InkColor;
  private width: InkWidth;
  private readonly penDraws: () => boolean;
  private readonly controls: boolean;
  private readonly log: (message: string) => void;
  private readonly overlay: SVGSVGElement;
  private readonly abort = new AbortController();
  private surface: HTMLElement | null = null;
  private surfaceAbort: AbortController | null = null;
  private drawing: Drawing | null = null;
  private erasing: number | null = null;
  private clearArmedAt = 0;
  private items: Partial<Record<'pencil' | 'eraser' | 'color' | 'width', HTMLElement>> = {};
  private group: HTMLElement | null = null;
  private readonly restores: (() => void)[] = [];

  constructor(private readonly canvas: Canvas, options: InkOptions) {
    this.color = options.color;
    this.width = options.width;
    this.penDraws = options.penDraws;
    this.controls = options.controls;
    this.log = options.log;
    this.overlay = createSvg('svg', { cls: 'icor-canvases-ink' });
  }

  attach(): void {
    const canvas = this.canvas;
    const render = (): void => this.render();
    this.restores.push(
      around(canvas, 'setData', (original) => {
        return function (this: Canvas, data) {
          original.call(this, data);
          render();
        };
      }),
    );
    if (typeof canvas.applyHistory === 'function') {
      this.restores.push(
        around(canvas, 'applyHistory', (original) => {
          return function (this: Canvas, data) {
            original?.call(this, data);
            render();
          };
        }),
      );
    }
    canvas.wrapperEl.addEventListener('keydown', (evt) => this.onKeydown(evt), { capture: true, signal: this.abort.signal });
    /* A stylus press with the mode off: the canvas ignores pen input for
       drag and pan (1.13.7), so the press is free to start a stroke. It is
       caught one level above the wrapper, before the canvas's own capture
       listener, and the stroke runs on the surface through pointer
       capture. */
    canvas.view.contentEl.addEventListener('pointerdown', (evt) => this.onPenPress(evt), { capture: true, signal: this.abort.signal });
    if (this.controls) this.buildControls();
    this.render();
  }

  private onPenPress(evt: PointerEvent): void {
    if (this.mode !== 'off' || evt.pointerType !== 'pen' || !this.penDraws() || this.canvas.readonly) return;
    const target = targetElement(evt.target);
    if (!target || target.closest('.canvas-controls, .canvas-menu, .icor-canvases-node')) return;
    this.transient = true;
    this.setMode((evt.buttons & PEN_ERASER_BUTTON) !== 0 ? 'erase' : 'draw');
    this.onPointerDown(evt);
  }

  get active(): InkMode {
    return this.mode;
  }

  /* Draws every stroke in the canvas's data afresh. Cheap at the sizes a
     hand draws; called after every change and every load. */
  render(): void {
    const { canvasEl } = this.canvas;
    if (this.overlay.parentElement !== canvasEl) canvasEl.appendChild(this.overlay);
    this.overlay.empty();
    for (const stroke of readInk(this.canvas.data)) this.overlay.appendChild(this.pathFor(stroke.id, stroke.color, stroke.width, stroke.points));
    /* A stroke in progress while the file changed underneath stays
       visible; it commits on top of the fresh data at pointerup. */
    if (this.drawing) this.overlay.appendChild(this.drawing.path);
  }

  toggleDraw(): void {
    this.setMode(this.mode === 'draw' ? 'off' : 'draw');
  }

  toggleErase(): void {
    this.setMode(this.mode === 'erase' ? 'off' : 'erase');
  }

  setMode(mode: InkMode): void {
    if (mode !== 'off' && this.canvas.readonly) {
      new Notice(READONLY);
      mode = 'off';
    }
    if (this.mode === mode) return;
    this.finishStroke();
    this.mode = mode;
    if (mode === 'off') this.removeSurface();
    else this.ensureSurface().toggleClass('is-erasing', mode === 'erase');
    this.overlay.toggleClass('is-active', mode !== 'off');
    this.items.pencil?.toggleClass('is-active', mode === 'draw');
    this.items.eraser?.toggleClass('is-active', mode === 'erase');
    if (mode !== 'off') this.canvas.wrapperEl.focus();
    this.log(`ink mode ${mode}`);
  }

  undoLast(): void {
    const strokes = readInk(this.canvas.data);
    if (strokes.length === 0) {
      new Notice(NO_STROKES);
      return;
    }
    this.commit(strokes.slice(0, -1));
  }

  /* Two clicks within five seconds, the first of which only warns: the
     confirm pattern without a browser dialog. */
  clearAll(): void {
    if (readInk(this.canvas.data).length === 0) {
      new Notice(NO_STROKES);
      return;
    }
    if (Date.now() - this.clearArmedAt < CLEAR_WINDOW_MS) {
      this.clearArmedAt = 0;
      this.commit([]);
      new Notice('All strokes removed.');
      return;
    }
    this.clearArmedAt = Date.now();
    new Notice('Click the clear button again within five seconds to remove every stroke on this canvas.');
  }

  cycleColor(): void {
    this.setColor(nextColor(this.color));
  }

  cycleWidth(): void {
    this.setWidth(nextWidth(this.width));
  }

  /* New defaults from the settings, applied to this canvas at once. */
  applyDefaults(color: InkColor, width: InkWidth): void {
    this.setColor(color);
    this.setWidth(width);
  }

  dispose(): void {
    this.setMode('off');
    this.abort.abort();
    for (const restore of this.restores.splice(0)) restore();
    this.group?.detach();
    this.overlay.detach();
  }

  private setColor(color: InkColor): void {
    this.color = color;
    const el = this.items.color;
    if (!el) return;
    el.className = 'canvas-control-item icor-canvases-ink-item icor-canvases-ink-color';
    if (color) el.addClass(`icor-canvases-ink-color-${color}`);
    setTooltip(el, `Ink colour: ${INK_COLOR_NAMES[color]}`, { placement: 'left' });
  }

  private setWidth(width: InkWidth): void {
    this.width = width;
    const el = this.items.width;
    if (!el) return;
    el.className = `canvas-control-item icor-canvases-ink-item icor-canvases-ink-width icor-canvases-ink-width-${width}`;
    setTooltip(el, `Stroke width: ${width}`, { placement: 'left' });
  }

  private buildControls(): void {
    const controlsEl = this.canvas.wrapperEl.querySelector<HTMLElement>('.canvas-controls');
    if (!controlsEl) {
      this.log('ink controls: no .canvas-controls element; the commands still work');
      return;
    }
    /* The canvas's own control classes, on purpose: the theme styles the
       group and its items like the zoom and undo controls above it. */
    this.group = controlsEl.createDiv({ cls: ['canvas-control-group', 'mod-raised', 'icor-canvases-ink-controls'] });
    this.items.pencil = this.item('pencil', 'Draw on the canvas', () => this.toggleDraw());
    this.items.eraser = this.item('eraser', 'Erase strokes', () => this.toggleErase());
    this.items.color = this.item('circle', '', () => this.cycleColor());
    this.items.width = this.item('pen-line', '', () => this.cycleWidth());
    this.item('undo-2', 'Undo last stroke', () => this.undoLast());
    this.item('trash-2', 'Clear all strokes', () => this.clearAll());
    this.setColor(this.color);
    this.setWidth(this.width);
  }

  private item(icon: string, tooltip: string, onClick: () => void): HTMLElement {
    const group = this.group;
    if (!group) throw new Error('controls not built');
    const el = group.createDiv({ cls: ['canvas-control-item', 'icor-canvases-ink-item'] });
    setIcon(el, icon);
    if (tooltip) setTooltip(el, tooltip, { placement: 'left' });
    el.addEventListener(
      'click',
      (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        onClick();
      },
      { signal: this.abort.signal },
    );
    return el;
  }

  private pathFor(id: string, color: InkColor, width: number, points: number[]): SVGPathElement {
    const cls = ['icor-canvases-ink-stroke'];
    if (color) cls.push(`icor-canvases-ink-color-${color}`);
    return createSvg('path', { cls, attr: { d: pathData(points), 'stroke-width': String(width), 'data-icor-stroke': id } });
  }

  private ensureSurface(): HTMLElement {
    if (this.surface) return this.surface;
    const surface = this.canvas.wrapperEl.createDiv({ cls: 'icor-canvases-ink-surface' });
    const controller = new AbortController();
    const opts = { signal: controller.signal };
    surface.addEventListener('pointerdown', (evt) => this.onPointerDown(evt), opts);
    surface.addEventListener('pointermove', (evt) => this.onPointerMove(evt), opts);
    surface.addEventListener('pointerup', (evt) => this.onPointerUp(evt), opts);
    surface.addEventListener('pointercancel', (evt) => this.onPointerUp(evt), opts);
    /* A double click on the wrapper would open a new card; not while
       drawing. */
    surface.addEventListener('dblclick', (evt) => evt.stopPropagation(), opts);
    surface.addEventListener('contextmenu', (evt) => evt.stopPropagation(), opts);
    this.surface = surface;
    this.surfaceAbort = controller;
    return surface;
  }

  private removeSurface(): void {
    this.surfaceAbort?.abort();
    this.surfaceAbort = null;
    this.surface?.detach();
    this.surface = null;
  }

  private onKeydown(evt: KeyboardEvent): void {
    if (this.mode === 'off' || evt.key !== 'Escape') return;
    evt.preventDefault();
    evt.stopPropagation();
    this.setMode('off');
  }

  private eraseRadius(): number {
    const scale = typeof this.canvas.scale === 'number' && this.canvas.scale > 0 ? this.canvas.scale : 1;
    return ERASE_RADIUS_PX / scale;
  }

  private eraseAt(x: number, y: number): void {
    const radius = this.eraseRadius();
    const strokes = readInk(this.canvas.data);
    const kept = strokes.filter((s) => !strokeHit(s, x, y, radius));
    if (kept.length !== strokes.length) this.commit(kept);
  }

  private onPointerDown(evt: PointerEvent): void {
    if (evt.pointerType === 'mouse' && evt.button !== 0) return;
    evt.preventDefault();
    evt.stopPropagation();
    const surface = this.surface;
    if (!surface) return;
    const pos = this.canvas.posFromEvt(evt);
    /* A pointer that is already gone (or a synthetic event) has nothing
       to capture; the stroke still runs on the surface's own events. */
    try {
      surface.setPointerCapture(evt.pointerId);
    } catch {
      /* no active pointer */
    }
    if (this.mode === 'erase' || (evt.pointerType === 'pen' && (evt.buttons & PEN_ERASER_BUTTON) !== 0)) {
      this.erasing = evt.pointerId;
      this.eraseAt(pos.x, pos.y);
      return;
    }
    const builder = new StrokeBuilder();
    builder.add(pos.x, pos.y, evt.pressure);
    const id = newStrokeId();
    const path = this.pathFor(id, this.color, INK_WIDTH_UNITS[this.width], builder.points);
    this.overlay.appendChild(path);
    this.drawing = { id, builder, path, pointerId: evt.pointerId, pen: evt.pointerType === 'pen' };
  }

  private onPointerMove(evt: PointerEvent): void {
    if (this.erasing === evt.pointerId) {
      const pos = this.canvas.posFromEvt(evt);
      this.eraseAt(pos.x, pos.y);
      return;
    }
    const drawing = this.drawing;
    if (!drawing || drawing.pointerId !== evt.pointerId) return;
    evt.preventDefault();
    const events = typeof evt.getCoalescedEvents === 'function' ? evt.getCoalescedEvents() : [];
    let kept = false;
    for (const e of events.length > 0 ? events : [evt]) {
      const pos = this.canvas.posFromEvt(e);
      if (drawing.builder.add(pos.x, pos.y, e.pressure)) kept = true;
    }
    if (kept) drawing.path.setAttribute('d', pathData(drawing.builder.points));
  }

  private onPointerUp(evt: PointerEvent): void {
    if (this.erasing === evt.pointerId) this.erasing = null;
    else if (this.drawing?.pointerId === evt.pointerId) this.finishStroke();
    else return;
    if (this.transient) {
      this.transient = false;
      this.setMode('off');
    }
  }

  private finishStroke(): void {
    const drawing = this.drawing;
    if (!drawing) return;
    this.drawing = null;
    drawing.path.detach();
    if (drawing.builder.count === 0) return;
    const stroke = drawing.builder.finish(drawing.id, this.color, INK_WIDTH_UNITS[this.width], drawing.pen);
    this.commit([...readInk(this.canvas.data), stroke]);
  }

  /* The one write path. A new top-level object, never a mutation: the
     canvas's history holds the old one. */
  private commit(strokes: InkStroke[]): void {
    /* Undo last stroke, clear all and the command reach here without
       passing a mode switch, so the lock is checked here as well. */
    if (this.canvas.readonly) {
      new Notice(READONLY);
      return;
    }
    const next = withInk(this.canvas.data, strokes);
    if (next === this.canvas.data) {
      new Notice('This canvas carries ink from a newer version of the plugin. Update the plugin to draw on it.');
      return;
    }
    this.canvas.data = next;
    this.canvas.requestSave();
    this.render();
    this.log(`ink saved: ${strokes.length} stroke(s)`);
  }
}
