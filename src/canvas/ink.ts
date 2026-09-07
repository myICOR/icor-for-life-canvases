/* The ink layer of one canvas: an SVG overlay inside the canvas's own
 * transformed element, so strokes pan and zoom with the cards; a draw
 * surface that exists only while a pen mode is on, so normal canvas
 * interaction is untouched otherwise; and the strokes themselves, which live in `canvas.data.metadata.icorCanvases` and are
 * saved by the canvas's own save path (see src/canvas/format.ts). Every
 * stroke change replaces `canvas.data` with a new object and calls
 * `requestSave`, which is also what puts the change into the canvas's undo
 * history; undo and redo, and a reload of the file, all land in `setData`
 * or `applyHistory`, both patched to re-render the overlay. */
import { Notice } from 'obsidian';
import type { InkColor, InkStroke } from './format';
import { readInk, withInk } from './format';
import { INK_WIDTH_UNITS, StrokeBuilder, newStrokeId, pathData, strokeHit } from './inkModel';
import type { InkWidth } from './inkModel';
import { around, targetElement } from './internals';
import type { Canvas, CanvasMember } from './internals';

export type InkMode = 'off' | 'draw' | 'erase';

export interface InkOptions {
  color: InkColor;
  width: InkWidth;
  /* Whether a stylus draws while drawing mode is off. Read per press. */
  penDraws: () => boolean;
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
  private _color: InkColor;
  private _width: InkWidth;
  private readonly penDraws: () => boolean;
  private readonly log: (message: string) => void;
  /* The tool group follows the mode when it changes here: Escape, a
     stylus press, a locked canvas. */
  onModeChange: ((mode: InkMode) => void) | null = null;
  private readonly overlay: SVGSVGElement;
  private readonly abort = new AbortController();
  private surface: HTMLElement | null = null;
  private surfaceAbort: AbortController | null = null;
  private drawing: Drawing | null = null;
  private erasing: number | null = null;
  private clearArmedAt = 0;
  private readonly restores: (() => void)[] = [];

  constructor(private readonly canvas: Canvas, options: InkOptions) {
    this._color = options.color;
    this._width = options.width;
    this.penDraws = options.penDraws;
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
    this.render();
  }

  get color(): InkColor {
    return this._color;
  }

  get width(): InkWidth {
    return this._width;
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
    if (mode !== 'off') this.canvas.wrapperEl.focus();
    this.log(`ink mode ${mode}`);
    this.onModeChange?.(mode);
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

  /* New defaults from the settings, applied to this canvas at once. */
  applyDefaults(color: InkColor, width: InkWidth): void {
    this.setColor(color);
    this.setWidth(width);
  }

  setColor(color: InkColor): void {
    this._color = color;
  }

  setWidth(width: InkWidth): void {
    this._width = width;
  }

  dispose(): void {
    this.onModeChange = null;
    this.setMode('off');
    this.abort.abort();
    for (const restore of this.restores.splice(0)) restore();
    this.overlay.detach();
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
    const path = this.pathFor(id, this._color, INK_WIDTH_UNITS[this._width], builder.points);
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
    const stroke = drawing.builder.finish(drawing.id, this._color, INK_WIDTH_UNITS[this._width], drawing.pen);
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
