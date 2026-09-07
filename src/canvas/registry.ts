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
import type { Canvas, CanvasView } from './internals';
import { NodeToolbars } from './nodeToolbar';
import { wireModifierOpen } from './openInSidebar';
import { SelectionMenuHook } from './selectionMenu';
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
  selection: SelectionMenuHook | null;
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

  applySettings(): void {
    const s = this.host.settings();
    for (const binding of this.bindings.values()) {
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
    const binding: CanvasBinding = { view, canvas, ink: null, tools: null, toolbars: null, selection: null, disposers: [] };
    const s = host.settings();
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
        const tools = new ToolControls(canvas, binding.ink, { controls: !Platform.isPhone, log: (m) => host.log(m) });
        tools.attach();
        binding.tools = tools;
        binding.selection?.on(() => tools.onSelectionChange());
      }
    }
    if (requireCanvas(canvas, ['nodes', 'addNode', 'view', 'selectOnly', 'zoomToSelection'], 'Card toolbar')) {
      binding.toolbars = new NodeToolbars(canvas, { app, index, enabled: () => host.settings().toolbar, log: (m) => host.log(m) });
      binding.toolbars.attach();
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
    binding.tools?.dispose();
    binding.ink?.dispose();
    binding.toolbars?.dispose();
    binding.selection?.dispose();
    for (const dispose of binding.disposers) dispose();
    this.host.log(`canvas released: ${binding.view.file?.path ?? '(no file)'}`);
  }
}
