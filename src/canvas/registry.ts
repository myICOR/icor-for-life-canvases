/* Every open canvas, wired once. A sweep runs at layout-ready and on every
 * layout or active-leaf change and binds the canvas views it has not seen;
 * a binding lives as long as its view (the view's own `register` tears it
 * down) or until the plugin unloads. Each feature is bound only when the
 * private members it needs are present (src/canvas/internals.ts), so a
 * missing one costs that feature and nothing else. */
import { Platform } from 'obsidian';
import type { App } from 'obsidian';
import { InkLayer, INK_MEMBERS } from './ink';
import { asCanvasView, requireCanvas } from './internals';
import type { Canvas, CanvasNode, CanvasView } from './internals';
import { NestedCanvases } from './nested';
import { NodeAddHook } from './nodeHook';
import { NodeToolbars } from './nodeToolbar';
import { wireModifierOpen } from './openInSidebar';
import { SelectionMenuHook } from './selectionMenu';
import { NodeShapes } from './shapes';
import { ToolControls } from './tools';
import type { CanvasIndex } from '../index/CanvasIndex';
import type { CanvasesSettings } from '../settings/model';
import { penColorOf } from '../settings/model';

export interface RegistryHost {
  app: App;
  index: CanvasIndex;
  settings(): CanvasesSettings;
  log(message: string): void;
}

export interface CanvasBinding {
  view: CanvasView;
  canvas: Canvas;
  ink: InkLayer | null;
  tools: ToolControls | null;
  toolbars: NodeToolbars | null;
  nested: NestedCanvases | null;
  shapes: NodeShapes | null;
  selection: SelectionMenuHook | null;
  nodeHook: NodeAddHook | null;
  disposers: (() => void)[];
}

export class CanvasRegistry {
  private readonly bindings = new Map<Canvas, CanvasBinding>();

  constructor(private readonly host: RegistryHost) {}

  sweep(): void {
    for (const leaf of this.host.app.workspace.getLeavesOfType('canvas')) {
      const view = asCanvasView(leaf.view);
      if (view && !this.bindings.has(view.canvas)) this.bind(view);
    }
  }

  /* The binding of the canvas in the most recently focused leaf. */
  active(): CanvasBinding | null {
    const view = asCanvasView(this.host.app.workspace.getMostRecentLeaf()?.view);
    return view ? (this.bindings.get(view.canvas) ?? null) : null;
  }

  /* The shapes of the canvas that owns this card, for the node menu. */
  shapesFor(node: CanvasNode): NodeShapes | null {
    for (const binding of this.bindings.values()) {
      if (binding.shapes?.owns(node)) return binding.shapes;
    }
    return null;
  }

  /* A canvas view loaded another file: the breadcrumb follows. */
  refreshFiles(): void {
    for (const binding of this.bindings.values()) binding.nested?.render();
  }

  applySettings(): void {
    const s = this.host.settings();
    for (const binding of this.bindings.values()) {
      binding.canvas.wrapperEl.toggleClass('icor-canvases-controls-left', s.controlsSide === 'left');
      binding.ink?.applyDefaults(penColorOf(s.penColor), s.penWidth);
      binding.tools?.reflect();
      binding.toolbars?.refreshAll();
    }
  }

  disposeAll(): void {
    for (const canvas of [...this.bindings.keys()]) this.unbind(canvas);
  }

  private bind(view: CanvasView): void {
    const host = this.host;
    const { app, index } = host;
    const canvas = view.canvas;
    const binding: CanvasBinding = { view, canvas, ink: null, tools: null, toolbars: null, nested: null, shapes: null, selection: null, nodeHook: null, disposers: [] };
    const s = host.settings();
    /* The plugin's own class on the wrapper scopes its stylesheet rules
       that reach a core element under it (the group label). */
    canvas.wrapperEl.addClass('icor-canvases-wrapper');
    canvas.wrapperEl.toggleClass('icor-canvases-controls-left', s.controlsSide === 'left');
    binding.disposers.push(() => canvas.wrapperEl.removeClass('icor-canvases-wrapper', 'icor-canvases-controls-left'));
    /* One wrap of the selection toolbar's render, shared. */
    const selection = new SelectionMenuHook(canvas);
    if (requireCanvas(canvas, ['menu'], 'Selection toolbar') && selection.attach()) binding.selection = selection;
    if (requireCanvas(canvas, INK_MEMBERS, 'Ink')) {
      binding.ink = new InkLayer(canvas, {
        color: penColorOf(s.penColor),
        width: s.penWidth,
        penDraws: () => host.settings().penDraws,
        log: (m) => host.log(m),
      });
      binding.ink.attach();
      if (requireCanvas(canvas, ['wrapperEl', 'posFromEvt', 'panBy', 'selection', 'readonly', 'createGroupNode'], 'Tools')) {
        const tools = new ToolControls(canvas, binding.ink, { controls: !Platform.isPhone, side: () => host.settings().controlsSide, log: (m) => host.log(m) });
        tools.attach();
        binding.tools = tools;
        binding.selection?.on(() => tools.onSelectionChange());
      }
    }
    /* One wrap of addNode, shared by the toolbar and the shapes. */
    if (requireCanvas(canvas, ['nodes', 'addNode'], 'Cards')) {
      binding.nodeHook = new NodeAddHook(canvas);
      binding.nodeHook.attach();
    }
    if (binding.nodeHook && requireCanvas(canvas, ['view', 'selectOnly', 'zoomToSelection'], 'Card toolbar')) {
      binding.toolbars = new NodeToolbars(canvas, binding.nodeHook, { app, index, enabled: () => host.settings().toolbar, log: (m) => host.log(m) });
      binding.toolbars.attach();
    }
    if (binding.nodeHook && requireCanvas(canvas, ['selection', 'readonly', 'requestSave'], 'Card shapes')) {
      binding.shapes = new NodeShapes(canvas, binding.nodeHook, binding.selection, { app, log: (m) => host.log(m) });
      binding.shapes.attach();
    }
    if (requireCanvas(canvas, ['view', 'readonly', 'wrapperEl', 'showCreationMenu', 'createFileNode'], 'Nested canvases')) {
      binding.nested = new NestedCanvases(canvas, { app, index, log: (m) => host.log(m) });
      binding.nested.attach();
    }
    if (requireCanvas(canvas, ['nodes', 'view'], 'Open in the right sidebar')) {
      binding.disposers.push(wireModifierOpen(app, canvas, { modifier: () => host.settings().modifier, log: (m) => host.log(m) }));
    }
    this.bindings.set(canvas, binding);
    view.register(() => this.unbind(canvas));
    host.log(`canvas wired: ${view.file?.path ?? '(no file)'}`);
  }

  private unbind(canvas: Canvas): void {
    const binding = this.bindings.get(canvas);
    if (!binding) return;
    this.bindings.delete(canvas);
    /* Reverse of the bind order, so each wrap is the installed one when
       its undo runs. */
    binding.shapes?.dispose();
    binding.toolbars?.dispose();
    binding.nodeHook?.dispose();
    binding.nested?.dispose();
    binding.tools?.dispose();
    binding.ink?.dispose();
    binding.selection?.dispose();
    for (const dispose of binding.disposers) dispose();
    this.host.log(`canvas released: ${binding.view.file?.path ?? '(no file)'}`);
  }
}
