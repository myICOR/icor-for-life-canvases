/* The toolbar every note card gets: two buttons top left (open in a new
 * tab, open in the right sidebar), shown on hover and while the card is
 * selected, and, when the note is on more than one canvas, a pill top
 * right that lists the others. One root element per card, injected once
 * into the card's own element and never twice; the card's element survives
 * the canvas detaching it off screen, so the toolbar survives with it.
 * Cards that arrive later come through the shared `addNode` hook; the
 * index feeds the pill and re-renders it on every change. */
import { Keymap, Menu, Notice, setIcon, setTooltip } from 'obsidian';
import type { App } from 'obsidian';
import { isFileNode, nodeFile } from './internals';
import type { Canvas, CanvasNode } from './internals';
import { openCanvasAtNode } from './navigate';
import type { NodeAddHook } from './nodeHook';
import type { CanvasIndex, Unsubscribe } from '../index/CanvasIndex';
import { basename } from '../index/parse';
import { openInNewTab, openInRightSidebar } from '../open';

export interface ToolbarHost {
  app: App;
  index: CanvasIndex;
  enabled(): boolean;
  log(message: string): void;
}

const ROOT_CLASS = 'icor-canvases-node';
const NO_FILE = 'This card points to a note that does not exist.';

export class NodeToolbars {
  private unhook: (() => void) | null = null;
  private unsubscribe: Unsubscribe | null = null;
  private readonly abort = new AbortController();
  private readonly roots = new Map<CanvasNode, HTMLElement>();
  private disposed = false;

  constructor(
    private readonly canvas: Canvas,
    private readonly nodes: NodeAddHook,
    private readonly host: ToolbarHost,
  ) {}

  attach(): void {
    this.unhook = this.nodes.on((node) => this.decorate(node));
    this.unsubscribe = this.host.index.subscribe(() => this.refreshAll());
    this.refreshAll();
  }

  refreshAll(): void {
    for (const node of this.canvas.nodes.values()) this.decorate(node);
    for (const node of [...this.roots.keys()]) {
      if (!this.canvas.nodes.has(node.id)) this.strip(node);
    }
  }

  decorate(node: CanvasNode): void {
    /* A card added in the tick that disposed the toolbars decorates on
       the next microtask; nothing must be left behind then. */
    if (this.disposed) return;
    if (!this.host.enabled() || !isFileNode(node)) {
      this.strip(node);
      return;
    }
    let root = this.roots.get(node);
    if (!root || root.parentElement !== node.nodeEl) {
      root?.detach();
      root = this.build(node);
      this.roots.set(node, root);
    }
    this.updatePill(node, root);
  }

  dispose(): void {
    this.disposed = true;
    this.abort.abort();
    this.unsubscribe?.();
    this.unhook?.();
    for (const node of [...this.roots.keys()]) this.strip(node);
  }

  private strip(node: CanvasNode): void {
    const root = this.roots.get(node);
    if (!root) return;
    root.detach();
    this.roots.delete(node);
  }

  private notePath(node: CanvasNode): string {
    return nodeFile(node)?.path ?? (isFileNode(node) ? node.filePath : '');
  }

  private build(node: CanvasNode): HTMLElement {
    const root = node.nodeEl.createDiv({ cls: ROOT_CLASS });
    const opts = { signal: this.abort.signal };
    /* A press or click on the toolbar is not a press on the card. */
    for (const type of ['pointerdown', 'click', 'dblclick', 'contextmenu'] as const) {
      root.addEventListener(type, (evt) => evt.stopPropagation(), opts);
    }
    const toolbar = root.createDiv({ cls: 'icor-canvases-node-toolbar' });
    this.button(toolbar, 'maximize-2', 'Open in new tab', () => {
      const file = nodeFile(node);
      if (file) void openInNewTab(this.host.app, file);
      else new Notice(NO_FILE);
    });
    this.button(toolbar, 'panel-right', 'Open in right sidebar', () => {
      const file = nodeFile(node);
      if (file) void openInRightSidebar(this.host.app, file);
      else new Notice(NO_FILE);
    });
    const pill = root.createDiv({ cls: 'icor-canvases-node-pill' });
    pill.createSpan({ cls: 'icor-canvases-node-pill-text' });
    setIcon(pill.createSpan({ cls: 'icor-canvases-node-pill-icon' }), 'chevron-down');
    pill.addEventListener('click', (evt) => this.showCanvasMenu(node, evt), opts);
    return root;
  }

  private button(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
    const el = parent.createDiv({ cls: 'icor-canvases-node-button', attr: { role: 'button', tabindex: '0', 'aria-label': label } });
    setIcon(el, icon);
    setTooltip(el, label);
    el.addEventListener('click', onClick, { signal: this.abort.signal });
    el.addEventListener(
      'keydown',
      (evt) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault();
          onClick();
        }
      },
      { signal: this.abort.signal },
    );
  }

  private updatePill(node: CanvasNode, root: HTMLElement): void {
    const pill = root.querySelector<HTMLElement>('.icor-canvases-node-pill');
    const text = root.querySelector<HTMLElement>('.icor-canvases-node-pill-text');
    if (!pill || !text) return;
    const count = this.host.index.canvasesFor(this.notePath(node)).length;
    pill.toggle(count > 1);
    if (count > 1) {
      text.setText(`Appears in ${count} canvases`);
      setTooltip(pill, 'The other canvases this note is on');
    }
  }

  private showCanvasMenu(node: CanvasNode, evt: MouseEvent): void {
    const { app, index } = this.host;
    const notePath = this.notePath(node);
    const current = this.canvas.view.file?.path;
    const menu = new Menu();
    for (const canvasPath of index.canvasesFor(notePath)) {
      const placement = index.placementsFor(notePath).find((p) => p.canvasPath === canvasPath);
      if (!placement) continue;
      menu.addItem((item) =>
        item
          .setTitle(basename(canvasPath))
          .setIcon('map')
          .setChecked(canvasPath === current)
          .onClick((clickEvt) => {
            if (canvasPath === current) {
              this.canvas.selectOnly(node);
              this.canvas.zoomToSelection();
              return;
            }
            const newTab = Keymap.isModEvent(clickEvt) !== false;
            this.host.log(`go to ${canvasPath} node ${placement.nodeId}`);
            void openCanvasAtNode(app, canvasPath, placement.nodeId, newTab);
          }),
      );
    }
    menu.showAtMouseEvent(evt);
  }
}
