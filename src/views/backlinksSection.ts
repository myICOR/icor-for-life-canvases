/* The "Canvases" section inside Obsidian's own Backlinks pane: the same
 * rows as the note footer, under "Linked mentions" and "Unlinked
 * mentions", with a header built the way the pane builds its own two
 * (`tree-item-self` with a flair count; 1.13.7 `backlink-pane`). The pane
 * follows the active note, or the note it is pinned to, through the
 * view's `file`; the view's `update` is wrapped on the instance so the
 * section re-renders exactly when the pane does, and the index re-renders
 * it when a canvas changes. One section per pane, removed with the pane or
 * with the plugin. */
import { FileView, setIcon, setTooltip } from 'obsidian';
import type { App, TFile, View } from 'obsidian';
import { around } from '../canvas/internals';
import type { CanvasIndex, Unsubscribe } from '../index/CanvasIndex';
import { renderPlacements } from './rows';

export const BACKLINK_VIEW_TYPE = 'backlink';
const PANE_SELECTOR = '.backlink-pane';

export interface BacklinksHost {
  app: App;
  index: CanvasIndex;
  log(message: string): void;
}

interface SectionBinding {
  view: View;
  header: HTMLElement;
  count: HTMLElement;
  body: HTMLElement;
  filePath: string | null;
  restore: (() => void) | null;
}

/* The pane's `update` runs on every file change; wrapping it on the
   instance is the exact hook, and it is optional. */
interface Updatable {
  update?: () => void;
}

/* One collapse state for the session, like the footer's. */
let collapsed = false;

export class BacklinksSections {
  private readonly bindings = new Map<View, SectionBinding>();
  private unsubscribe: Unsubscribe | null = null;

  constructor(private readonly host: BacklinksHost) {}

  start(): void {
    this.unsubscribe = this.host.index.subscribe(() => this.renderAll());
    this.sweep();
  }

  /* Binds every Backlinks pane not yet bound; re-renders a bound one when
     its file changed since the last render. */
  sweep(): void {
    for (const leaf of this.host.app.workspace.getLeavesOfType(BACKLINK_VIEW_TYPE)) {
      const view = leaf.view;
      const bound = this.bindings.get(view);
      if (!bound) this.bind(view);
      else if (bound.filePath !== (this.fileOf(view)?.path ?? null)) this.render(bound);
    }
  }

  renderAll(): void {
    for (const binding of this.bindings.values()) this.render(binding);
  }

  disposeAll(): void {
    for (const view of [...this.bindings.keys()]) this.unbind(view);
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /* The pane is a FileView subclass in 1.13.7 and keeps the note it shows
     in `file`; should that change, the active file is the next best. */
  private fileOf(view: View): TFile | null {
    return view instanceof FileView ? view.file : this.host.app.workspace.getActiveFile();
  }

  private bind(view: View): void {
    const pane = view.containerEl.querySelector<HTMLElement>(PANE_SELECTOR);
    if (!pane) {
      this.host.log('backlinks: no .backlink-pane in the view; the section is not added');
      return;
    }
    const header = pane.createDiv({ cls: ['tree-item-self', 'is-clickable', 'icor-canvases-backlinks-header'], attr: { role: 'button', tabindex: '0' } });
    setIcon(header.createSpan({ cls: ['tree-item-icon', 'collapse-icon'] }), 'right-triangle');
    header.createDiv({ cls: 'tree-item-inner', text: 'Canvases' });
    const count = header.createDiv({ cls: 'tree-item-flair-outer' }).createSpan({ cls: 'tree-item-flair' });
    const body = pane.createDiv({ cls: ['search-result-container', 'icor-canvases-backlinks-body'] });
    const binding: SectionBinding = { view, header, count, body, filePath: null, restore: null };
    const toggle = (): void => {
      collapsed = !collapsed;
      this.renderAll();
    };
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        toggle();
      }
    });
    const updatable = view as Updatable;
    if (typeof updatable.update === 'function') {
      const render = (): void => this.render(binding);
      binding.restore = around(updatable, 'update', (original) => {
        return function (this: Updatable) {
          original?.call(this);
          render();
        };
      });
    }
    this.bindings.set(view, binding);
    view.register(() => this.unbind(view));
    this.render(binding);
    this.host.log('backlinks: section added');
  }

  private unbind(view: View): void {
    const binding = this.bindings.get(view);
    if (!binding) return;
    this.bindings.delete(view);
    binding.restore?.();
    binding.header.detach();
    binding.body.detach();
  }

  private render(binding: SectionBinding): void {
    const { header, count, body, view } = binding;
    const file = this.fileOf(view);
    binding.filePath = file?.path ?? null;
    const placements = file ? this.host.index.placementsFor(file.path) : [];
    count.setText(String(placements.length));
    header.toggleClass('is-collapsed', collapsed);
    header.find('.collapse-icon')?.toggleClass('is-collapsed', collapsed);
    header.setAttribute('aria-expanded', String(!collapsed));
    setTooltip(header, collapsed ? 'Click to expand' : 'Click to collapse');
    body.empty();
    body.toggle(!collapsed);
    if (collapsed) return;
    if (placements.length === 0) {
      body.createDiv({ cls: ['search-empty-state', 'icor-canvases-empty'], text: file ? 'Not on any canvas.' : 'No note is open.' });
      return;
    }
    renderPlacements(this.host.app, body.createDiv({ cls: 'icor-canvases-list' }), placements);
  }
}
