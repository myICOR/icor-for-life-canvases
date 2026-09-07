/* The tool group of one canvas: Select, Hand, Pen and Eraser as one
 * exclusive set, then the ink colour and width pickers, undo last stroke,
 * clear all, and a Group button that appears while two or more cards are
 * selected. Select is the canvas as it is (a drag on empty canvas draws a
 * marquee, 1.13.7 handleDragToSelect). Hand puts a surface over the canvas
 * that pans on a mouse or pen drag and lets a finger through to the
 * canvas's own touch handling, which pans already. Pen and Eraser are the
 * ink layer's two modes. Keys V, H, P and E switch tools while the canvas
 * has focus and nothing is being edited; the buttons are the only switch
 * on touch. The state is per canvas view and starts at Select. */
import { Notice, setIcon, setTooltip } from 'obsidian';
import { Flyout } from './flyout';
import { padBox, unionBox } from './geometry';
import type { InkLayer, InkMode } from './ink';
import { isEdge, targetElement } from './internals';
import type { Canvas, CanvasNode } from './internals';
import { openColorPicker, openWidthPicker } from './pickers';
import { WIDTH_LABELS } from './pickers';
import { INK_COLOR_NAMES } from './inkModel';

export type Tool = 'select' | 'hand' | 'pen' | 'eraser';

export const TOOLS: readonly Tool[] = ['select', 'hand', 'pen', 'eraser'];

export const TOOL_KEYS: Readonly<Record<string, Tool>> = { v: 'select', h: 'hand', p: 'pen', e: 'eraser' };

export const TOOL_LABELS: Readonly<Record<Tool, string>> = {
  select: 'Select (V): drag on the canvas to select cards',
  hand: 'Hand (H): drag on the canvas to pan',
  pen: 'Pen (P): draw on the canvas',
  eraser: 'Eraser (E): touch a stroke to remove it',
};

const TOOL_ICONS: Readonly<Record<Tool, string>> = { select: 'mouse-pointer', hand: 'hand', pen: 'pencil', eraser: 'eraser' };

/* Around the selection, in canvas units; the same margin core's own
   "Create group" leaves. */
const GROUP_PADDING = 20;
const NEED_TWO = 'Select two or more cards to group them.';
const READONLY = 'This canvas is read-only.';

export interface ToolHost {
  /* No control group on a phone: the column is already full there and
     the commands carry the same actions to the mobile toolbar. */
  controls: boolean;
  /* Which edge the column sits on; tooltips open away from it. */
  side: () => 'left' | 'right';
  /* The M key. */
  toggleMinimap: () => void;
  log: (message: string) => void;
}

type ItemKey = Tool | 'color' | 'width' | 'group';

export class ToolControls {
  private tool: Tool = 'select';
  private group: HTMLElement | null = null;
  private items: Partial<Record<ItemKey, HTMLElement>> = {};
  private readonly labels = new Map<HTMLElement, string>();
  private hand: { surface: HTMLElement; abort: AbortController } | null = null;
  private readonly abort = new AbortController();

  constructor(
    private readonly canvas: Canvas,
    private readonly ink: InkLayer,
    private readonly host: ToolHost,
  ) {}

  attach(): void {
    this.ink.onModeChange = (mode) => this.reflectInk(mode);
    this.canvas.wrapperEl.addEventListener('keydown', (evt) => this.onKeydown(evt), { capture: true, signal: this.abort.signal });
    if (this.host.controls) this.buildControls();
    this.reflect();
  }

  get active(): Tool {
    return this.tool;
  }

  setTool(tool: Tool): void {
    if (tool === 'pen') this.ink.setMode('draw');
    else if (tool === 'eraser') this.ink.setMode('erase');
    else this.ink.setMode('off');
    /* The ink layer may have refused (a locked canvas): follow it. */
    const mode = this.ink.active;
    if (tool === 'pen' && mode !== 'draw') tool = 'select';
    if (tool === 'eraser' && mode !== 'erase') tool = 'select';
    if (tool === 'hand') this.ensureHand();
    else this.removeHand();
    if (this.tool !== tool) this.host.log(`tool ${tool}`);
    this.tool = tool;
    this.reflect();
  }

  /* A second choice of the same tool goes back to Select. */
  toggle(tool: Tool): void {
    this.setTool(this.tool === tool ? 'select' : tool);
  }

  /* The selection changed: the Group button shows for two or more cards. */
  onSelectionChange(): void {
    this.items.group?.toggle(this.selectedNodes().length >= 2);
  }

  /* Wraps the selected cards in a group the way the canvas's own "Create
     group" does: the union of their boxes with a margin, saved by the
     canvas. */
  createGroup(): void {
    if (this.canvas.readonly) {
      new Notice(READONLY);
      return;
    }
    const nodes = this.selectedNodes();
    if (nodes.length < 2) {
      new Notice(NEED_TWO);
      return;
    }
    const box = unionBox(nodes.map((n) => n.getBBox()));
    if (!box) return;
    const padded = padBox(box, GROUP_PADDING);
    this.canvas.createGroupNode({
      pos: { x: padded.minX, y: padded.minY },
      size: { width: padded.maxX - padded.minX, height: padded.maxY - padded.minY },
    });
    this.host.log(`group created around ${nodes.length} cards`);
  }

  /* After the ink defaults or the column side changed. */
  reflect(): void {
    const placement = this.tooltipSide();
    for (const tool of TOOLS) this.items[tool]?.toggleClass('is-active', this.tool === tool);
    for (const [el, label] of this.labels) setTooltip(el, label, { placement });
    const color = this.items.color;
    if (color) {
      color.className = 'canvas-control-item icor-canvases-ink-item icor-canvases-ink-color';
      if (this.ink.color) color.addClass(`icor-canvases-ink-color-${this.ink.color}`);
      setTooltip(color, `Ink colour: ${INK_COLOR_NAMES[this.ink.color]}`, { placement });
    }
    const width = this.items.width;
    if (width) {
      width.className = `canvas-control-item icor-canvases-ink-item icor-canvases-ink-width icor-canvases-ink-width-${this.ink.width}`;
      setTooltip(width, `Stroke width: ${WIDTH_LABELS[this.ink.width]}`, { placement });
    }
  }

  private tooltipSide(): 'left' | 'right' {
    return this.host.side() === 'left' ? 'right' : 'left';
  }

  dispose(): void {
    this.ink.onModeChange = null;
    this.abort.abort();
    this.removeHand();
    this.group?.detach();
    this.group = null;
    this.items = {};
    this.labels.clear();
  }

  private selectedNodes(): CanvasNode[] {
    const out: CanvasNode[] = [];
    for (const item of this.canvas.selection) {
      if (!isEdge(item)) out.push(item);
    }
    return out;
  }

  /* The ink layer changed mode on its own: Escape, a stylus press while
     Select was active, a locked canvas. The tool follows. */
  private reflectInk(mode: InkMode): void {
    let tool = this.tool;
    if (mode === 'draw') tool = 'pen';
    else if (mode === 'erase') tool = 'eraser';
    else if (tool === 'pen' || tool === 'eraser') tool = 'select';
    if (tool !== 'hand') this.removeHand();
    this.tool = tool;
    this.reflect();
  }

  private onKeydown(evt: KeyboardEvent): void {
    if (evt.repeat || evt.metaKey || evt.ctrlKey || evt.altKey || Flyout.isOpen) return;
    const key = evt.key.toLowerCase();
    const tool = TOOL_KEYS[key];
    if (!tool && key !== 'm') return;
    const target = targetElement(evt.target);
    if (target?.closest('[contenteditable="true"], input, textarea, .cm-editor, .canvas-node.is-editing')) return;
    evt.preventDefault();
    evt.stopPropagation();
    if (tool) this.setTool(tool);
    else this.host.toggleMinimap();
  }

  private ensureHand(): void {
    if (this.hand) return;
    const surface = this.canvas.wrapperEl.createDiv({ cls: 'icor-canvases-hand-surface' });
    const abort = new AbortController();
    const opts = { signal: abort.signal };
    surface.addEventListener('pointerdown', (evt) => this.onHandDown(evt, surface), opts);
    surface.addEventListener('dblclick', (evt) => evt.stopPropagation(), opts);
    this.hand = { surface, abort };
  }

  private removeHand(): void {
    if (!this.hand) return;
    this.hand.abort.abort();
    this.hand.surface.detach();
    this.hand = null;
  }

  /* A mouse or pen drag pans; a finger is left to the canvas, whose own
     touch handling pans a single finger and pinches with two. The start
     point is fixed in canvas units: each move reads where the pointer is
     now and pans by the difference, the way the canvas pans on a middle
     button. */
  private onHandDown(evt: PointerEvent, surface: HTMLElement): void {
    if (evt.pointerType === 'touch' || evt.button !== 0) return;
    evt.preventDefault();
    evt.stopPropagation();
    const canvas = this.canvas;
    const start = canvas.posFromEvt(evt);
    const id = evt.pointerId;
    try {
      surface.setPointerCapture(id);
    } catch {
      /* no active pointer */
    }
    const controller = new AbortController();
    const opts = { signal: controller.signal };
    surface.addClass('is-panning');
    const end = (): void => {
      controller.abort();
      surface.removeClass('is-panning');
    };
    surface.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerId !== id) return;
        const pos = canvas.posFromEvt(e);
        canvas.panBy(start.x - pos.x, start.y - pos.y);
      },
      opts,
    );
    surface.addEventListener('pointerup', (e) => e.pointerId === id && end(), opts);
    surface.addEventListener('pointercancel', (e) => e.pointerId === id && end(), opts);
    this.abort.signal.addEventListener('abort', end, { once: true });
  }

  private buildControls(): void {
    const controlsEl = this.canvas.wrapperEl.querySelector<HTMLElement>('.canvas-controls');
    if (!controlsEl) {
      this.host.log('tools: no .canvas-controls element; the commands still work');
      return;
    }
    /* The canvas's own control classes, on purpose: the theme styles the
       group and its items like the zoom and undo controls above it. */
    this.group = controlsEl.createDiv({ cls: ['canvas-control-group', 'mod-raised', 'icor-canvases-tools'] });
    for (const tool of TOOLS) this.items[tool] = this.item(TOOL_ICONS[tool], TOOL_LABELS[tool], () => this.setTool(tool));
    this.items.group = this.item('create-group', 'Group the selection (section)', () => this.createGroup());
    this.items.group.addClass('icor-canvases-tools-group');
    this.items.group.hide();
    this.items.color = this.item('circle', '', () => this.pickColor());
    this.items.width = this.item('pen-line', '', () => this.pickWidth());
    this.item('undo-2', 'Undo last stroke', () => this.ink.undoLast());
    this.item('trash-2', 'Clear all strokes', () => this.ink.clearAll());
  }

  private item(icon: string, tooltip: string, onClick: () => void): HTMLElement {
    const group = this.group;
    if (!group) throw new Error('controls not built');
    const el = group.createDiv({ cls: ['canvas-control-item', 'icor-canvases-ink-item'], attr: { role: 'button', tabindex: '0' } });
    setIcon(el, icon);
    if (tooltip) {
      this.labels.set(el, tooltip);
      setTooltip(el, tooltip, { placement: this.tooltipSide() });
      el.setAttribute('aria-label', tooltip);
    }
    el.addEventListener(
      'click',
      (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        onClick();
      },
      { signal: this.abort.signal },
    );
    el.addEventListener(
      'keydown',
      (evt) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault();
          evt.stopPropagation();
          onClick();
        }
      },
      { signal: this.abort.signal },
    );
    return el;
  }

  /* The pickers open as flyouts to the left of their button. */
  private pickColor(): void {
    const anchor = this.items.color;
    if (!anchor) return;
    openColorPicker(anchor, 'side', this.ink.color, (color) => {
      this.ink.setColor(color);
      this.reflect();
    });
  }

  private pickWidth(): void {
    const anchor = this.items.width;
    if (!anchor) return;
    openWidthPicker(anchor, 'side', this.ink.width, (width) => {
      this.ink.setWidth(width);
      this.reflect();
    });
  }
}
