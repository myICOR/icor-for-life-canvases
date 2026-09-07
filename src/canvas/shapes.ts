/* Shapes and colours for text cards. When one text card is selected, the
 * canvas's floating toolbar gets three more buttons: switch shape, outline
 * colour, fill colour, each opening a flyout with every option visible.
 * The choice is written on the node's own data (`icorShape`, `icorStyle`;
 * see shapeModel.ts) through the node's unknown keys and saved by the
 * canvas, so undo, redo, copy and paste carry it. Rendering is an
 * attribute on the card's element plus CSS variables; the stylesheet
 * does the rest. The five clipped shapes get an SVG outline drawn over
 * the card where the clip would hide the border. Every card is applied
 * once when it is added and again after every `setData` (a load, an
 * undo, a paste), through an instance wrap on the node. */
import { Menu, Notice, setIcon, setTooltip } from 'obsidian';
import type { App } from 'obsidian';
import { Flyout, flyoutOption } from './flyout';
import { around, hasUnknownData, isEdge, isTextNode, onNodeMenu } from './internals';
import type { Canvas, CanvasNode } from './internals';
import type { NodeAddHook } from './nodeHook';
import type { SelectionMenuHook } from './selectionMenu';
import { CLIPPED_SHAPES, OUTLINE_POINTS, PALETTE, SHAPES, SHAPE_LABELS, colorLabel, colorValue, isHexColor, readShape, withShape } from './shapeModel';
import type { Shape, ShapeColor, ShapeStyle } from './shapeModel';

export const SHAPE_ATTR = 'data-icor-canvases-shape';
const STROKE_VAR = '--icor-canvases-stroke';
const FILL_VAR = '--icor-canvases-fill';
const OUTLINE_CLASS = 'icor-canvases-shape-outline';
const BUTTON_CLASS = 'icor-canvases-shape-button';
const READONLY = 'This canvas is read-only.';

export interface ShapesHost {
  app: App;
  log(message: string): void;
}

export class NodeShapes {
  private readonly restores = new Map<CanvasNode, () => void>();
  private unhook: (() => void) | null = null;
  private unlisten: (() => void) | null = null;
  private disposed = false;

  constructor(
    private readonly canvas: Canvas,
    private readonly nodes: NodeAddHook,
    private readonly selection: SelectionMenuHook | null,
    private readonly host: ShapesHost,
  ) {}

  attach(): void {
    this.unhook = this.nodes.on((node) => this.watch(node));
    for (const node of this.canvas.nodes.values()) this.watch(node);
    this.unlisten = this.selection?.on((menuEl) => this.decorateMenu(menuEl)) ?? null;
  }

  /* The card's context menu, for the keyboard: a Shape item that opens a
     menu of the shapes with the current one ticked. Registered by the
     plugin once; routed here for the canvas that owns the node. */
  static addMenuItems(menu: Menu, node: CanvasNode, shapes: NodeShapes): void {
    if (!isTextNode(node) || !hasUnknownData(node)) return;
    menu.addItem((item) =>
      item
        .setSection('canvas')
        .setTitle('Shape')
        .setIcon('shapes')
        .onClick((evt) => {
          const current = readShape(node.unknownData).shape;
          const sub = new Menu();
          for (const shape of SHAPES) {
            sub.addItem((i) =>
              i
                .setTitle(SHAPE_LABELS[shape])
                .setChecked(shape === current)
                .onClick(() => shapes.set(node, { shape })),
            );
          }
          if (evt instanceof MouseEvent) sub.showAtMouseEvent(evt);
          else sub.showAtPosition({ x: node.nodeEl.getBoundingClientRect().left, y: node.nodeEl.getBoundingClientRect().top });
        }),
    );
  }

  owns(node: CanvasNode): boolean {
    return this.canvas.nodes.get(node.id) === node;
  }

  /* The one write path: a new unknown-data object, the card re-applied,
     the canvas saved (which also puts the change into its history). */
  set(node: CanvasNode, patch: Partial<ShapeStyle>): void {
    if (this.canvas.readonly) {
      new Notice(READONLY);
      return;
    }
    if (!hasUnknownData(node)) return;
    node.unknownData = withShape(node.unknownData, patch);
    this.apply(node);
    this.canvas.requestSave();
    this.host.log(`shape set on ${node.id}: ${JSON.stringify(patch)}`);
  }

  dispose(): void {
    this.disposed = true;
    this.unhook?.();
    this.unlisten?.();
    for (const [node, restore] of this.restores) {
      restore();
      this.clear(node);
    }
    this.restores.clear();
  }

  private watch(node: CanvasNode): void {
    if (this.disposed || this.restores.has(node) || !isTextNode(node) || !hasUnknownData(node)) return;
    const apply = (): void => this.apply(node);
    this.restores.set(
      node,
      around(node, 'setData', (original) => {
        return function (this: CanvasNode, data) {
          original.call(this, data);
          apply();
        };
      }),
    );
    this.apply(node);
  }

  /* DOM writes only where the value differs from what is on the element. */
  private apply(node: CanvasNode): void {
    if (this.disposed) return;
    const el = node.nodeEl;
    const style = readShape(node.unknownData);
    const shape = style.shape === 'card' ? null : style.shape;
    if (el.getAttribute(SHAPE_ATTR) !== shape) {
      if (shape) el.setAttribute(SHAPE_ATTR, shape);
      else el.removeAttribute(SHAPE_ATTR);
    }
    this.setVar(el, STROKE_VAR, colorValue(style.stroke));
    this.setVar(el, FILL_VAR, colorValue(style.fill));
    /* The colour rules apply only to cards that carry a colour, so every
       other card keeps the canvas's own border and selection look. */
    el.toggleClass('icor-canvases-stroked', style.stroke !== '');
    el.toggleClass('icor-canvases-filled', style.fill !== '');
    const clipped = shape !== null && (CLIPPED_SHAPES as readonly string[]).includes(shape);
    let outline = el.querySelector<SVGSVGElement>(`:scope > .${OUTLINE_CLASS}`);
    if (clipped) {
      if (!outline) {
        outline = el.createSvg('svg', { cls: OUTLINE_CLASS, attr: { viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' } });
        outline.createSvg('polygon');
      }
      const polygon = outline.querySelector('polygon');
      const points = OUTLINE_POINTS[shape] ?? '';
      if (polygon && polygon.getAttribute('points') !== points) polygon.setAttribute('points', points);
    } else {
      outline?.detach();
    }
  }

  private setVar(el: HTMLElement, name: string, value: string): void {
    if (el.style.getPropertyValue(name) === value) return;
    if (value) el.setCssProps({ [name]: value });
    else el.style.removeProperty(name);
  }

  private clear(node: CanvasNode): void {
    const el = node.nodeEl;
    el.removeAttribute(SHAPE_ATTR);
    el.removeClass('icor-canvases-stroked', 'icor-canvases-filled');
    el.style.removeProperty(STROKE_VAR);
    el.style.removeProperty(FILL_VAR);
    el.querySelector(`:scope > .${OUTLINE_CLASS}`)?.detach();
  }

  /* The selection toolbar was rebuilt: with exactly one text card
     selected, three buttons join it. Idempotent: a rebuild empties the
     toolbar first, and a button already there is left alone. */
  private decorateMenu(menuEl: HTMLElement): void {
    if (this.disposed || this.canvas.readonly) return;
    const selected = [...this.canvas.selection];
    if (selected.length !== 1) return;
    const node = selected[0];
    if (!node || isEdge(node) || !isTextNode(node) || !hasUnknownData(node)) return;
    if (menuEl.querySelector(`.${BUTTON_CLASS}`)) return;
    this.menuButton(menuEl, 'shapes', 'Switch shape', (anchor) => this.openShapes(anchor, node));
    this.menuButton(menuEl, 'square', 'Outline colour', (anchor) => this.openColor(anchor, node, 'stroke'));
    this.menuButton(menuEl, 'paint-bucket', 'Fill colour', (anchor) => this.openColor(anchor, node, 'fill'));
  }

  private menuButton(menuEl: HTMLElement, icon: string, label: string, onClick: (anchor: HTMLElement) => void): void {
    /* The canvas's own toolbar buttons are `button.clickable-icon`. */
    const button = menuEl.createEl('button', { cls: ['clickable-icon', BUTTON_CLASS], attr: { 'aria-label': label } });
    setIcon(button, icon);
    setTooltip(button, label, { placement: 'top' });
    button.addEventListener('click', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      onClick(button);
    });
  }

  private openShapes(anchor: HTMLElement, node: CanvasNode): void {
    const current = readShape(node.unknownData).shape;
    Flyout.open({
      anchor,
      placement: 'below',
      columns: 5,
      build: (panel, close) => {
        for (const shape of SHAPES) {
          const option = flyoutOption(panel, ['icor-canvases-shape-option'], SHAPE_LABELS[shape], shape === current, () => {
            this.set(node, { shape });
            close();
          });
          this.preview(option, shape);
        }
      },
    });
  }

  /* A small card in the shape itself, cut and outlined like the real one. */
  private preview(option: HTMLElement, shape: Shape): void {
    const preview = option.createDiv({ cls: 'icor-canvases-shape-preview' });
    if (shape !== 'card') preview.setAttribute(SHAPE_ATTR, shape);
    preview.createDiv({ cls: 'icor-canvases-shape-preview-box' });
    if ((CLIPPED_SHAPES as readonly string[]).includes(shape)) {
      preview.createSvg('svg', { cls: OUTLINE_CLASS, attr: { viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' } }, (svg) => {
        svg.createSvg('polygon', { attr: { points: OUTLINE_POINTS[shape] ?? '' } });
      });
    }
  }

  private openColor(anchor: HTMLElement, node: CanvasNode, which: 'stroke' | 'fill'): void {
    const current = readShape(node.unknownData)[which];
    const pick = (color: ShapeColor): void => this.set(node, { [which]: color });
    Flyout.open({
      anchor,
      placement: 'below',
      build: (panel, close) => {
        const choices: ShapeColor[] = ['', ...PALETTE, 'transparent'];
        for (const color of choices) {
          const cls = ['canvas-color-picker-item', 'icor-canvases-swatch'];
          if (color === '') cls.push('icor-canvases-swatch-card');
          else if (color === 'transparent') cls.push('icor-canvases-swatch-none');
          else cls.push(`mod-canvas-color-${color}`);
          flyoutOption(panel, cls, `${which === 'stroke' ? 'Outline' : 'Fill'}: ${colorLabel(color)}`, color === current, () => {
            pick(color);
            close();
          });
        }
        /* A custom colour, the way the canvas's own picker offers one. */
        const custom = panel.createDiv({ cls: ['canvas-color-picker-item', 'canvas-color-picker-custom', 'icor-canvases-swatch', 'icor-canvases-swatch-custom'] });
        const input = custom.createEl('input', { type: 'color', attr: { 'aria-label': 'Custom colour' } });
        if (isHexColor(current)) {
          input.value = current;
          custom.addClass('is-active');
          custom.setCssProps({ '--canvas-color': current });
        }
        setTooltip(custom, 'Custom colour', { placement: 'top' });
        input.addEventListener('input', () => {
          custom.setCssProps({ '--canvas-color': input.value });
          pick(input.value);
        });
        input.addEventListener('change', () => {
          pick(input.value);
          close();
        });
      },
    });
  }
}

/* The plugin registers the private node-menu event once and routes it to
   the shapes of the canvas that owns the node. */
export function registerNodeMenu(app: App, shapesFor: (node: CanvasNode) => NodeShapes | null): ReturnType<typeof onNodeMenu> {
  return onNodeMenu(app, (menu, node) => {
    const shapes = shapesFor(node);
    if (shapes) NodeShapes.addMenuItems(menu, node, shapes);
  });
}
