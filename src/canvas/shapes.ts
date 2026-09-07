/* Shapes and colours for text cards. When one text card is selected, the
 * canvas's floating toolbar gets more buttons: switch shape, fill colour,
 * text colour, each opening a flyout with every option visible. The
 * outline is the card's own colour, which the canvas's palette button
 * sets and core renders as the border.
 * The choice is written on the node's own data (`icorShape`, `icorStyle`;
 * see shapeModel.ts) through the node's unknown keys and saved by the
 * canvas, so undo, redo, copy and paste carry it. Rendering is an
 * attribute on the card's element plus CSS variables; the stylesheet
 * does the rest. The five clipped shapes get an SVG outline drawn over
 * the card where the clip would hide the border. Every card is applied
 * once when it is added and again after every `setData` (a load, an
 * undo, a paste), through an instance wrap on the node. */
import { Menu, Notice, debounce, setIcon, setTooltip } from 'obsidian';
import type { App } from 'obsidian';
import { Flyout, flyoutOption } from './flyout';
import { around, hasUnknownData, isEdge, isTextNode, nodeColor, onNodeMenu } from './internals';
import type { Canvas, CanvasNode } from './internals';
import type { NodeAddHook } from './nodeHook';
import type { SelectionMenuHook } from './selectionMenu';
import { CLIPPED_SHAPES, OUTLINE_POINTS, PALETTE, SHAPES, SHAPE_LABELS, colorLabel, colorValue, isHexColor, STROKE_STYLES, STROKE_WIDTHS, dashArray, fitSize, fitSizeByArea, legacyStroke, prefersDarkText, readShape, relativeLuminance, withShape, withoutLegacyStroke } from './shapeModel';
import type { StrokeStyle } from './shapeModel';
import type { Shape, ShapeColor, ShapeStyle } from './shapeModel';

export const SHAPE_ATTR = 'data-icor-canvases-shape';
const FILL_VAR = '--icor-canvases-fill';
const TEXT_VAR = '--icor-canvases-text';
const STROKE_WIDTH_VAR = '--icor-canvases-stroke-width';
const STROKE_STYLE_VAR = '--icor-canvases-stroke-style';
const DASH_VAR = '--icor-canvases-dash';
const PALETTE_VAR = (n: string): string => `--canvas-color-${n}`;
const OUTLINE_CLASS = 'icor-canvases-shape-outline';
/* The bounding frame and its four corner handles on a shaped card: the
   rectangle core resizes from, made visible. Core's resize and connector
   hit zones are elements on its interaction layer, sized to the card's
   full rectangle and stacked above every card, so the frame only shows
   where they are and never takes a pointer itself. */
const FRAME_CLASS = 'icor-canvases-frame';
/* The "..." pill inside the inset box when the text does not fit. */
const OVERFLOW_CLASS = 'icor-canvases-overflow';
const OVERFLOWING_CLASS = 'icor-canvases-overflowing';
const MEASURE_MS = 100;
const CORNERS = ['topleft', 'topright', 'bottomright', 'bottomleft'] as const;
const BUTTON_CLASS = 'icor-canvases-shape-button';
/* On the editor iframe's root element: the editor paints no background
   of its own over the shape's fill, and its text takes the card's colour.
   The root, not the body: core's style relay rebuilds the iframe body's
   class list from the main body on every mutation and drops a class it
   did not seed (1.13.7, onIframeLoad runs twice); it never touches the
   html element. */
const EDITOR_BODY_CLASS = 'icor-canvases-in-shape';
const EDITOR_TEXT_VAR = '--icor-canvases-editor-text';
const READONLY = 'This canvas is read-only.';

export interface ShapesHost {
  app: App;
  log(message: string): void;
}

export class NodeShapes {
  private readonly restores = new Map<CanvasNode, () => void>();
  /* Per shaped card: the observers that ask for a measure, and the
     debounced measure itself. Sizes change on a resize (ResizeObserver
     on the content box), content on a render or an edit
     (MutationObserver on the box, and on the editor document while
     editing); a shape change and the first render call it directly.
     Never per frame. */
  /* Cards whose first fit pass is waiting for its re-measure. */
  private readonly pendingFit = new Set<CanvasNode>();
  private readonly watchers = new Map<CanvasNode, { resize: ResizeObserver; mutation: MutationObserver; editor: MutationObserver | null; measure: () => void }>();
  /* One 1 by 1 canvas that turns any CSS colour into its channels, for
     the contrast fallback; made on first use. */
  private probe: CanvasRenderingContext2D | null = null;
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
    if (readShape(node.unknownData).shape !== 'card') {
      menu.addItem((item) =>
        item
          .setSection('canvas')
          .setTitle('Fit shape to text')
          .setIcon('scaling')
          .onClick(() => shapes.fitToText(node)),
      );
    }
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
    this.pendingFit.clear();
    for (const node of [...this.watchers.keys()]) this.unwatchOverflow(node);
    for (const [node, restore] of this.restores) {
      restore();
      this.clear(node);
    }
    this.restores.clear();
  }

  private watch(node: CanvasNode): void {
    if (this.disposed || this.restores.has(node) || !isTextNode(node) || !hasUnknownData(node)) return;
    /* Cards that left the canvas release their wrap. */
    for (const [watched, restore] of this.restores) {
      if (!this.canvas.nodes.has(watched.id)) {
        restore();
        this.restores.delete(watched);
      }
    }
    this.migrate(node);
    const apply = (): void => this.apply(node);
    /* An undo on a 0.2.0 file replays the parsed entry, which still
       carries the old outline key; the migration runs after every
       setData so the outline stays. */
    const migrate = (): void => this.migrate(node);
    const restoreSetData = around(node, 'setData', (original) => {
      return function (this: CanvasNode, data) {
        original.call(this, data);
        migrate();
        apply();
      };
    });
    /* The editor is an iframe with its own document (1.13.7): it is
       marked when editing starts, on the frame after the mount. */
    const markEditor = (): void => this.markEditor(node);
    const restoreEditing =
      typeof node.startEditing === 'function'
        ? around(node, 'startEditing', (original) => {
            return function (this: CanvasNode) {
              original?.call(this);
              markEditor();
            };
          })
        : null;
    this.restores.set(node, () => {
      restoreEditing?.();
      restoreSetData();
    });
    this.apply(node);
  }

  /* The editor's document: a class on its body and the card's text
     colour as a variable, read from the card's container. Retried over a
     few frames while the iframe mounts; nothing per frame after that. */
  private markEditor(node: CanvasNode, attempt = 0): void {
    if (this.disposed) return;
    const iframe = node.nodeEl.querySelector<HTMLIFrameElement>('iframe.embed-iframe');
    const root = iframe?.contentDocument?.documentElement;
    if (!root) {
      if (attempt < 30) node.nodeEl.win.requestAnimationFrame(() => this.markEditor(node, attempt + 1));
      return;
    }
    const style = readShape(node.unknownData);
    const styled = style.shape !== 'card' || style.fill !== '' || style.text !== '';
    root.toggleClass(EDITOR_BODY_CLASS, styled);
    const watcher = this.watchers.get(node);
    if (watcher && root.ownerDocument.body) {
      watcher.editor?.disconnect();
      const editor = new (root.win as typeof window).MutationObserver(() => watcher.measure());
      editor.observe(root.ownerDocument.body, { childList: true, subtree: true, characterData: true });
      watcher.editor = editor;
      watcher.measure();
    }
    if (!styled) return;
    const container = node.nodeEl.querySelector<HTMLElement>('.canvas-node-container');
    const color = container ? node.nodeEl.win.getComputedStyle(container).color : '';
    if (color) root.setCssProps({ [EDITOR_TEXT_VAR]: color });
  }

  /* A 0.2.0 outline colour becomes the card's own colour (when the card
     has none) and leaves the data; the next save writes the result. */
  private migrate(node: CanvasNode): void {
    const stroke = legacyStroke(node.unknownData);
    if (stroke === null) return;
    if (stroke && nodeColor(node) === '' && typeof node.setColor === 'function') node.setColor(stroke);
    node.unknownData = withoutLegacyStroke(node.unknownData);
    this.host.log(`shape: outline colour migrated on ${node.id}`);
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
    this.setVar(el, FILL_VAR, colorValue(style.fill));
    this.setVar(el, TEXT_VAR, colorValue(style.text));
    /* Outline thickness and dash, screen-constant: the box shapes take
       them as a border, the cut shapes as the polygon's stroke. */
    this.setVar(el, STROKE_WIDTH_VAR, shape ? String(style.strokeWidth) : '');
    this.setVar(el, STROKE_STYLE_VAR, shape && style.strokeStyle !== 'solid' ? style.strokeStyle : '');
    this.setVar(el, DASH_VAR, shape ? dashArray(style.strokeWidth, style.strokeStyle) : '');
    /* The colour rules apply only to cards that carry a colour, so every
       other card keeps the canvas's own look. */
    el.toggleClass('icor-canvases-filled', style.fill !== '');
    el.toggleClass('icor-canvases-texted', style.text !== '');
    /* No text colour on a filled card: light or dark text from the
       fill's luminance, decided here once per apply, never per frame. */
    const contrast = style.text === '' && style.fill !== '' && style.fill !== 'transparent' ? this.contrastFor(style.fill) : null;
    el.toggleClass('icor-canvases-contrast-dark', contrast === 'dark');
    el.toggleClass('icor-canvases-contrast-light', contrast === 'light');
    /* A card being edited while its style changes: the editor follows. */
    if (el.hasClass('is-editing')) this.markEditor(node);
    if (shape) this.watchOverflow(node);
    else this.unwatchOverflow(node);
    let frame = el.querySelector<HTMLElement>(`:scope > .${FRAME_CLASS}`);
    if (shape && !frame) {
      frame = el.createDiv({ cls: FRAME_CLASS, attr: { 'aria-hidden': 'true' } });
      for (const corner of CORNERS) frame.createDiv({ cls: 'icor-canvases-frame-handle', attr: { 'data-corner': corner } });
    } else if (!shape && frame) {
      frame.detach();
    }
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

  /* The content box of a card: the inset area core's content element
     fills. */
  private contentBox(node: CanvasNode): HTMLElement | null {
    return node.nodeEl.querySelector<HTMLElement>(':scope > .canvas-node-container > .canvas-node-content');
  }

  private watchOverflow(node: CanvasNode): void {
    if (this.watchers.has(node)) {
      this.watchers.get(node)?.measure();
      return;
    }
    const box = this.contentBox(node);
    if (!box) return;
    const measure = debounce(() => this.measureOverflow(node), MEASURE_MS, true);
    /* From the box's own window, so a pop-out delivers to its own frame. */
    const realm = box.win as typeof window;
    const resize = new realm.ResizeObserver(() => measure());
    resize.observe(box);
    const mutation = new realm.MutationObserver(() => measure());
    mutation.observe(box, { childList: true, subtree: true, characterData: true });
    this.watchers.set(node, { resize, mutation, editor: null, measure });
    measure();
  }

  private unwatchOverflow(node: CanvasNode): void {
    const w = this.watchers.get(node);
    if (!w) return;
    w.resize.disconnect();
    w.mutation.disconnect();
    w.editor?.disconnect();
    this.watchers.delete(node);
    node.nodeEl.removeClass(OVERFLOWING_CLASS);
    node.nodeEl.querySelector(`.${OVERFLOW_CLASS}`)?.detach();
  }

  /* The content's scroll size in canvas units, from the editor document
     while editing and from the content box otherwise. */
  private contentSize(node: CanvasNode): { width: number; height: number; clientWidth: number; clientHeight: number } | null {
    const box = this.contentBox(node);
    if (!box) return null;
    const iframe = box.querySelector<HTMLIFrameElement>('iframe.embed-iframe');
    const doc = node.nodeEl.hasClass('is-editing') ? iframe?.contentDocument : null;
    if (doc?.documentElement && iframe) {
      /* The editor scrolls inside its own scroller, so the document never
         overflows; the content's own height is the measure. */
      const content = doc.querySelector<HTMLElement>('.cm-content') ?? doc.documentElement;
      return { width: content.scrollWidth, height: content.scrollHeight, clientWidth: iframe.clientWidth, clientHeight: iframe.clientHeight };
    }
    /* Reading view: the preview scrolls inside the box too; its sizer is
       the rendered height. */
    const sizer = box.querySelector<HTMLElement>('.markdown-preview-sizer');
    const height = Math.max(box.scrollHeight, sizer?.scrollHeight ?? 0);
    const width = Math.max(box.scrollWidth, sizer?.scrollWidth ?? 0);
    return { width, height, clientWidth: box.clientWidth, clientHeight: box.clientHeight };
  }

  private measureOverflow(node: CanvasNode): void {
    if (this.disposed) return;
    const watcher = this.watchers.get(node);
    if (!watcher) return;
    /* Core destroys the editor iframe on the return to preview; the
       observer on its document goes with it. */
    if (watcher.editor && !node.nodeEl.hasClass('is-editing')) {
      watcher.editor.disconnect();
      watcher.editor = null;
    }
    const size = this.contentSize(node);
    const box = this.contentBox(node);
    if (!size || !box) return;
    const overflowing = size.height > size.clientHeight + 1 || size.width > size.clientWidth + 1;
    if (this.pendingFit.delete(node) && overflowing) {
      this.fitToText(node, 1);
      return;
    }
    const el = node.nodeEl;
    if (el.hasClass(OVERFLOWING_CLASS) === overflowing) return;
    el.toggleClass(OVERFLOWING_CLASS, overflowing);
    let pill = box.querySelector<HTMLElement>(`:scope > .${OVERFLOW_CLASS}`);
    if (overflowing && !pill) {
      pill = box.createDiv({ cls: OVERFLOW_CLASS, text: '…', attr: { 'aria-hidden': 'true' } });
      setTooltip(pill, 'The text does not fit; use Fit shape to text');
    } else if (!overflowing) {
      pill?.detach();
    }
  }

  /* Resizes the card around its centre until the text fits, through
     core's own resize path so undo restores the size. */
  fitToText(node: CanvasNode, pass = 0): void {
    if (this.canvas.readonly) {
      new Notice(READONLY);
      return;
    }
    const style = readShape(node.unknownData);
    if (style.shape === 'card' || typeof node.moveAndResize !== 'function') return;
    const size = this.contentSize(node);
    if (!size) return;
    const grid = this.canvas.options?.snapToGrid && typeof this.canvas.gridSpacing === 'number' ? this.canvas.gridSpacing : 0;
    const input = { shape: style.shape, width: node.width, height: node.height, contentWidth: size.width, contentHeight: size.height, grid };
    const fit = pass === 0 ? fitSizeByArea(input) : fitSize(input);
    if (fit.width === node.width && fit.height === node.height) {
      if (pass === 0) new Notice('The text already fits.');
      return;
    }
    if (pass === 0) this.pendingFit.add(node);
    node.moveAndResize({ x: Math.round(node.x - (fit.width - node.width) / 2), y: Math.round(node.y - (fit.height - node.height) / 2), width: fit.width, height: fit.height });
    this.canvas.requestSave();
    this.host.log(`fit to text: ${node.id} to ${fit.width}x${fit.height}`);
    this.watchers.get(node)?.measure();
  }

  /* The first shaped card in the selection, for the command. */
  selectedShaped(): CanvasNode | null {
    for (const item of this.canvas.selection) {
      if (!isEdge(item) && isTextNode(item) && hasUnknownData(item) && readShape(item.unknownData).shape !== 'card') return item;
    }
    return null;
  }

  /* 'dark' or 'light' text for a fill, or null when the colour cannot be
     read. A palette value resolves through the canvas's own variable on
     the wrapper. */
  private contrastFor(fill: string): 'dark' | 'light' | null {
    const wrapper = this.canvas.wrapperEl;
    const value = PALETTE.includes(fill) ? wrapper.win.getComputedStyle(wrapper).getPropertyValue(PALETTE_VAR(fill)).trim() : fill;
    if (!value) return null;
    const ctx = this.probeContext();
    if (!ctx) return null;
    ctx.fillStyle = '#000000';
    ctx.fillStyle = value;
    if (ctx.fillStyle === '#000000' && !/^#0{6}$|^black$|^rgba?\(0,\s*0,\s*0/i.test(value)) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return prefersDarkText(relativeLuminance(r ?? 0, g ?? 0, b ?? 0)) ? 'dark' : 'light';
  }

  private probeContext(): CanvasRenderingContext2D | null {
    if (this.probe) return this.probe;
    const probe = createEl('canvas');
    probe.width = 1;
    probe.height = 1;
    this.probe = probe.getContext('2d', { willReadFrequently: true });
    return this.probe;
  }

  private setVar(el: HTMLElement, name: string, value: string): void {
    if (el.style.getPropertyValue(name) === value) return;
    if (value) el.setCssProps({ [name]: value });
    else el.style.removeProperty(name);
  }

  private clear(node: CanvasNode): void {
    const el = node.nodeEl;
    el.removeAttribute(SHAPE_ATTR);
    el.removeClass('icor-canvases-filled', 'icor-canvases-texted', 'icor-canvases-contrast-dark', 'icor-canvases-contrast-light');
    el.style.removeProperty(FILL_VAR);
    el.style.removeProperty(TEXT_VAR);
    /* A live editor loses its mark with the plugin. */
    const root = el.querySelector<HTMLIFrameElement>('iframe.embed-iframe')?.contentDocument?.documentElement;
    root?.removeClass(EDITOR_BODY_CLASS);
    root?.style.removeProperty(EDITOR_TEXT_VAR);
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
    const style = readShape(node.unknownData);
    this.menuButton(menuEl, 'shapes', 'Switch shape', (anchor) => this.openShapes(anchor, node));
    if (style.shape !== 'card') {
      /* A shaped card: core's palette button (found by its icon) gives
         way to an Outline flyout that writes the same key, node.color,
         beside a Fill flyout; both show their state as a swatch. */
      /* Found by the icon setIcon puts first in the button; no :has(),
         which an older Android WebView throws on. */
      Array.from(menuEl.querySelectorAll<HTMLElement>('button.clickable-icon'))
        .find((b) => b.firstElementChild?.classList.contains('lucide-palette'))
        ?.addClass('icor-canvases-hidden');
      const outline = this.menuButton(menuEl, null, 'Outline colour', (anchor) => this.openOutline(anchor, node));
      this.swatch(outline, 'icor-canvases-state-ring', nodeColor(node));
      const fill = this.menuButton(menuEl, null, 'Fill colour', (anchor) => this.openColor(anchor, node, 'fill'));
      this.swatch(fill, 'icor-canvases-state-disc', style.fill);
      this.menuButton(menuEl, 'pen-line', 'Outline style', (anchor) => this.openOutlineStyle(anchor, node));
      this.menuButton(menuEl, 'scaling', 'Fit shape to text', () => this.fitToText(node));
    } else {
      this.menuButton(menuEl, 'paint-bucket', 'Fill colour', (anchor) => this.openColor(anchor, node, 'fill'));
    }
    this.menuButton(menuEl, 'type', 'Text colour', (anchor) => this.openColor(anchor, node, 'text'));
  }

  /* The state swatch on a toolbar button: the colour through the canvas's
     own --canvas-color, a palette class for a palette value, the value
     itself for a hex, and a "none" mark for the card's own. */
  private swatch(button: HTMLElement, cls: string, color: string): void {
    const span = button.createSpan({ cls: ['icor-canvases-state-swatch', cls] });
    if (PALETTE.includes(color)) span.addClass(`mod-canvas-color-${color}`);
    else if (isHexColor(color)) span.setCssProps({ '--canvas-color': color });
    else span.addClass(color === 'transparent' ? 'icor-canvases-state-none' : 'icor-canvases-state-default');
  }

  private menuButton(menuEl: HTMLElement, icon: string | null, label: string, onClick: (anchor: HTMLElement) => void): HTMLElement {
    /* The canvas's own toolbar buttons are `button.clickable-icon`. */
    const button = menuEl.createEl('button', { cls: ['clickable-icon', BUTTON_CLASS], attr: { 'aria-label': label } });
    if (icon) setIcon(button, icon);
    setTooltip(button, label, { placement: 'top' });
    button.addEventListener('click', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      /* One popover at a time: the canvas's own colour submenu, if open,
         closes when ours opens, through its own button so core's state
         follows (ours closes on any outside press already). */
      for (const active of menuEl.querySelectorAll<HTMLElement>(`.clickable-icon.is-active:not(.${BUTTON_CLASS})`)) active.click();
      onClick(button);
    });
    return button;
  }

  /* The outline is the card's own colour, core's key; the same write core's
     palette makes (setColor takes a palette value or a hex), so the
     outline stays theme-driven and core-compatible. */
  private openOutline(anchor: HTMLElement, node: CanvasNode): void {
    const current = nodeColor(node);
    const pick = (color: string): void => {
      if (this.canvas.readonly || typeof node.setColor !== 'function') return;
      node.setColor(color);
      this.canvas.requestSave();
      this.apply(node);
      this.selection?.refresh();
    };
    Flyout.open({
      anchor,
      placement: 'below',
      build: (panel, close) => {
        for (const color of ['', ...PALETTE]) {
          const cls = ['canvas-color-picker-item', 'icor-canvases-swatch'];
          if (color === '') cls.push('icor-canvases-swatch-card');
          else cls.push(`mod-canvas-color-${color}`);
          flyoutOption(panel, cls, `Outline: ${colorLabel(color)}`, color === current, () => {
            pick(color);
            close();
          });
        }
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

  /* Thickness and dash, one flyout of two rows of line previews. */
  private openOutlineStyle(anchor: HTMLElement, node: CanvasNode): void {
    const current = readShape(node.unknownData);
    Flyout.open({
      anchor,
      placement: 'below',
      build: (panel, close) => {
        panel.addClass('icor-canvases-flyout-rows');
        const widths = panel.createDiv({ cls: 'icor-canvases-flyout-line' });
        for (const width of STROKE_WIDTHS) {
          const option = flyoutOption(widths, ['icor-canvases-line-option'], `Thickness: ${width}`, width === current.strokeWidth, () => {
            this.set(node, { strokeWidth: width });
            close();
          });
          option.createSvg('svg', { cls: 'icor-canvases-line-preview', attr: { viewBox: '0 0 32 16' } }, (svg) => {
            svg.createSvg('line', { attr: { x1: '3', y1: '8', x2: '29', y2: '8', 'stroke-width': String(width) } });
          });
        }
        const styles = panel.createDiv({ cls: 'icor-canvases-flyout-line' });
        const labels: Record<StrokeStyle, string> = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' };
        for (const strokeStyle of STROKE_STYLES) {
          const option = flyoutOption(styles, ['icor-canvases-line-option'], labels[strokeStyle], strokeStyle === current.strokeStyle, () => {
            this.set(node, { strokeStyle });
            close();
          });
          option.createSvg('svg', { cls: 'icor-canvases-line-preview', attr: { viewBox: '0 0 32 16' } }, (svg) => {
            svg.createSvg('line', { attr: { x1: '3', y1: '8', x2: '29', y2: '8', 'stroke-width': '2', 'stroke-dasharray': dashArray(2, strokeStyle) } });
          });
        }
      },
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

  private openColor(anchor: HTMLElement, node: CanvasNode, which: 'fill' | 'text'): void {
    const current = readShape(node.unknownData)[which];
    const pick = (color: ShapeColor): void => {
      this.set(node, { [which]: color });
      /* The state swatch on the button follows. */
      if (which === 'fill') this.selection?.refresh();
    };
    const label = which === 'fill' ? 'Fill' : 'Text';
    Flyout.open({
      anchor,
      placement: 'below',
      build: (panel, close) => {
        const choices: ShapeColor[] = which === 'fill' ? ['', ...PALETTE, 'transparent'] : ['', ...PALETTE];
        for (const color of choices) {
          const cls = ['canvas-color-picker-item', 'icor-canvases-swatch'];
          if (color === '') cls.push('icor-canvases-swatch-card');
          else if (color === 'transparent') cls.push('icor-canvases-swatch-none');
          else cls.push(`mod-canvas-color-${color}`);
          flyoutOption(panel, cls, `${label}: ${colorLabel(color)}`, color === current, () => {
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
