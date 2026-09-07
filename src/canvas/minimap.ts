/* The minimap: a small panel at the bottom right of the canvas, above the
 * zoom bar, drawn on two stacked <canvas> elements. The node layer draws
 * every card as a rounded rectangle in its colour (groups as outlines,
 * edges left out) with the whole content fitted; it redraws only when
 * cards change (add, remove, move, colour, a load, an undo), with a
 * trailing debounce so a drag costs one redraw. The viewport layer draws
 * the current view as a rectangle and redraws only when the canvas
 * itself schedules a frame (an instance wrap of `requestFrame`, which
 * core calls once per animated frame and never while idle), one
 * requestAnimationFrame at a time. A press or drag on the map moves the
 * view so that point is the centre; a wheel turn zooms the canvas. The
 * panel does not exist in the DOM while the map is off. */
import { debounce } from 'obsidian';
import { around, isGroupNode, nodeColor } from './internals';
import type { BBox, Canvas, CanvasNode } from './internals';
import type { NodeAddHook } from './nodeHook';
import { padBox, unionBox } from './geometry';

export interface MinimapHost {
  log(message: string): void;
}

/* Around the content, as a fraction of the larger side. */
const CONTENT_PADDING = 0.06;
/* One wheel notch, in log2 zoom. */
const WHEEL_STEP = 0.2;
const NODE_DEBOUNCE_MS = 100;
const PALETTE_VARS = ['--canvas-color-1', '--canvas-color-2', '--canvas-color-3', '--canvas-color-4', '--canvas-color-5', '--canvas-color-6'];

interface Fit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export class Minimap {
  private readonly panel: HTMLElement;
  private readonly nodeLayer: HTMLCanvasElement;
  private readonly viewLayer: HTMLCanvasElement;
  private readonly abort = new AbortController();
  private readonly restores: (() => void)[] = [];
  private unhook: (() => void) | null = null;
  private fit: Fit | null = null;
  private frame = 0;
  private readonly redrawNodes = debounce(() => this.drawNodes(), NODE_DEBOUNCE_MS, true);

  constructor(
    private readonly canvas: Canvas,
    private readonly nodes: NodeAddHook,
    private readonly host: MinimapHost,
  ) {
    this.panel = createDiv({ cls: 'icor-canvases-minimap', attr: { 'aria-label': 'Minimap' } });
    this.nodeLayer = this.panel.createEl('canvas', { cls: 'icor-canvases-minimap-nodes' });
    this.viewLayer = this.panel.createEl('canvas', { cls: 'icor-canvases-minimap-view' });
  }

  attach(): void {
    const canvas = this.canvas;
    canvas.wrapperEl.appendChild(this.panel);
    const nodesChanged = (): void => {
      this.redrawNodes();
    };
    const viewportChanged = (): void => this.scheduleView();
    this.unhook = this.nodes.on(nodesChanged);
    for (const name of ['removeNode', 'markMoved', 'markDirty', 'setData', 'applyHistory'] as const) {
      if (typeof canvas[name] !== 'function') continue;
      this.restores.push(
        around(canvas, name, (original) => {
          return function (this: Canvas, ...args: unknown[]) {
            (original as (...a: unknown[]) => unknown).apply(this, args);
            nodesChanged();
          };
        }),
      );
    }
    this.restores.push(
      around(canvas, 'requestFrame', (original) => {
        return function (this: Canvas) {
          original.call(this);
          viewportChanged();
        };
      }),
    );
    const signal = this.abort.signal;
    this.panel.addEventListener('pointerdown', (evt) => this.onPress(evt), { signal });
    this.panel.addEventListener('wheel', (evt) => this.onWheel(evt), { signal, passive: false });
    for (const type of ['click', 'dblclick', 'contextmenu'] as const) {
      this.panel.addEventListener(type, (evt) => evt.stopPropagation(), { signal });
    }
    this.drawNodes();
    this.host.log('minimap on');
  }

  dispose(): void {
    this.abort.abort();
    this.redrawNodes.cancel();
    if (this.frame) this.panel.win.cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.unhook?.();
    for (const restore of this.restores.splice(0).reverse()) restore();
    this.panel.detach();
    this.host.log('minimap off');
  }

  /* The content box of every card, or null on an empty canvas. */
  private contentBox(): BBox | null {
    const boxes: BBox[] = [];
    for (const node of this.canvas.nodes.values()) boxes.push(node.getBBox());
    const box = unionBox(boxes);
    return box ? padBox(box, Math.max(box.maxX - box.minX, box.maxY - box.minY) * CONTENT_PADDING) : null;
  }

  /* Sizes both layers to the panel at the device pixel ratio; cheap, and
     only done from the two draw paths. */
  private size(layer: HTMLCanvasElement): { w: number; h: number; ratio: number } {
    const ratio = this.panel.win.devicePixelRatio || 1;
    const w = this.panel.clientWidth;
    const h = this.panel.clientHeight;
    const pw = Math.round(w * ratio);
    const ph = Math.round(h * ratio);
    if (layer.width !== pw || layer.height !== ph) {
      layer.width = pw;
      layer.height = ph;
    }
    return { w, h, ratio };
  }

  private drawNodes(): void {
    if (this.abort.signal.aborted) return;
    const { w, h, ratio } = this.size(this.nodeLayer);
    const ctx = this.nodeLayer.getContext('2d');
    if (!ctx || w === 0 || h === 0) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const box = this.contentBox();
    if (!box) {
      this.fit = null;
      this.drawView();
      return;
    }
    const scale = Math.min(w / (box.maxX - box.minX), h / (box.maxY - box.minY));
    const fit: Fit = {
      scale,
      offsetX: (w - (box.maxX - box.minX) * scale) / 2 - box.minX * scale,
      offsetY: (h - (box.maxY - box.minY) * scale) / 2 - box.minY * scale,
    };
    this.fit = fit;
    const styles = this.panel.win.getComputedStyle(this.canvas.wrapperEl);
    const palette = PALETTE_VARS.map((v) => styles.getPropertyValue(v).trim());
    const muted = styles.getPropertyValue('--text-faint').trim() || 'gray';
    const radius = Math.max(1, 3 * Math.min(1, scale * 40));
    const groups: CanvasNode[] = [];
    for (const node of this.canvas.nodes.values()) {
      if (isGroupNode(node)) {
        groups.push(node);
        continue;
      }
      ctx.fillStyle = this.colorOf(nodeColor(node), palette, muted);
      this.roundRect(ctx, node, fit, radius);
      ctx.fill();
    }
    ctx.lineWidth = 1;
    for (const node of groups) {
      ctx.strokeStyle = this.colorOf(nodeColor(node), palette, muted);
      this.roundRect(ctx, node, fit, radius);
      ctx.stroke();
    }
    this.drawView();
  }

  private colorOf(color: string, palette: string[], muted: string): string {
    if (color === '') return muted;
    const index = Number(color);
    if (Number.isInteger(index) && index >= 1 && index <= 6) return palette[index - 1] || muted;
    return color;
  }

  private roundRect(ctx: CanvasRenderingContext2D, node: CanvasNode, fit: Fit, radius: number): void {
    const x = node.x * fit.scale + fit.offsetX;
    const y = node.y * fit.scale + fit.offsetY;
    const w = Math.max(1, node.width * fit.scale);
    const h = Math.max(1, node.height * fit.scale);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(radius, w / 2, h / 2));
  }

  private scheduleView(): void {
    if (this.frame || this.abort.signal.aborted) return;
    this.frame = this.panel.win.requestAnimationFrame(() => {
      this.frame = 0;
      this.drawView();
    });
  }

  private drawView(): void {
    if (this.abort.signal.aborted) return;
    const { w, h, ratio } = this.size(this.viewLayer);
    const ctx = this.viewLayer.getContext('2d');
    if (!ctx || w === 0 || h === 0) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const fit = this.fit;
    if (!fit) return;
    const view = this.canvas.getViewportBBox();
    const styles = this.panel.win.getComputedStyle(this.canvas.wrapperEl);
    ctx.strokeStyle = styles.getPropertyValue('--color-accent').trim() || 'currentColor';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      view.minX * fit.scale + fit.offsetX,
      view.minY * fit.scale + fit.offsetY,
      (view.maxX - view.minX) * fit.scale,
      (view.maxY - view.minY) * fit.scale,
    );
  }

  /* Map coordinates back to canvas units. */
  private toCanvas(evt: PointerEvent): { x: number; y: number } | null {
    const fit = this.fit;
    if (!fit) return null;
    const rect = this.panel.getBoundingClientRect();
    return { x: (evt.clientX - rect.left - fit.offsetX) / fit.scale, y: (evt.clientY - rect.top - fit.offsetY) / fit.scale };
  }

  private onPress(evt: PointerEvent): void {
    if (evt.button !== 0 && evt.pointerType === 'mouse') return;
    evt.preventDefault();
    evt.stopPropagation();
    const pan = (e: PointerEvent): void => {
      const pos = this.toCanvas(e);
      if (pos) this.canvas.panTo(pos.x, pos.y);
    };
    pan(evt);
    const id = evt.pointerId;
    try {
      this.panel.setPointerCapture(id);
    } catch {
      /* no active pointer */
    }
    const controller = new AbortController();
    const opts = { signal: controller.signal };
    this.panel.addEventListener('pointermove', (e) => e.pointerId === id && pan(e), opts);
    const end = (): void => controller.abort();
    this.panel.addEventListener('pointerup', end, opts);
    this.panel.addEventListener('pointercancel', end, opts);
    this.abort.signal.addEventListener('abort', end, { once: true });
  }

  private onWheel(evt: WheelEvent): void {
    evt.preventDefault();
    evt.stopPropagation();
    if (evt.deltaY === 0) return;
    this.canvas.zoomBy(evt.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP);
  }
}
