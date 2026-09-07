/* The block under a note's body: the same rows as the sidebar view, placed
 * right after Obsidian's own "Backlinks in document" element
 * (`.embedded-backlinks`) when the view has one, and otherwise at the end
 * of the mode's footer container, the same place core appends that
 * element. The block follows a mode switch by watching the view's
 * `data-mode` attribute, which the view sets on every switch. Nothing is
 * rendered for a note on no canvas. */
import { MarkdownView, debounce, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type { CanvasIndex, Unsubscribe } from '../index/CanvasIndex';
import { renderPlacements } from './rows';

export interface FooterHost {
  app: App;
  index: CanvasIndex;
  enabled(): boolean;
  log(message: string): void;
}

const BACKLINKS_SELECTOR = '.embedded-backlinks';

interface FooterBinding {
  view: MarkdownView;
  el: HTMLElement;
  observer: MutationObserver;
}

/* One collapse state for the session, shared by every note. */
let collapsed = false;

export class Footers {
  private readonly bindings = new Map<MarkdownView, FooterBinding>();
  private unsubscribe: Unsubscribe | null = null;
  /* A preview has no footer section until it renders (a hidden tab has
     none), so the Markdown post-processor calls this on every render and
     the sweep binds the view once its footer exists. */
  readonly scheduleSweep = debounce(() => this.sweep(false), 50, true);

  constructor(private readonly host: FooterHost) {}

  start(): void {
    this.unsubscribe = this.host.index.subscribe(() => this.renderAll());
    this.sweep();
  }

  /* Binds every Markdown view not yet bound; re-renders the rest, or
     with `rerender` false (the post-processor's sweep, which fires on
     every rendered section) only places them. */
  sweep(rerender = true): void {
    if (!this.host.enabled()) {
      this.disposeAll(false);
      return;
    }
    for (const leaf of this.host.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      const bound = this.bindings.get(view);
      if (!bound) this.render(this.bind(view));
      else if (rerender) this.render(bound);
      else this.place(bound);
    }
  }

  renderAll(): void {
    for (const binding of this.bindings.values()) this.render(binding);
  }

  disposeAll(stop = true): void {
    for (const view of [...this.bindings.keys()]) this.unbind(view);
    if (stop) {
      this.unsubscribe?.();
      this.unsubscribe = null;
    }
  }

  /* Where the block goes: right after core's backlinks element when it is
     in the DOM, otherwise as the last child of the mode's sizer. Reading
     view keeps its backlinks element in a footer section that is attached
     only while "Backlinks in document" is on (1.13.7; an empty section is
     never attached), so the block sits at the end of
     `.markdown-preview-sizer` and is moved back to the end whenever the
     renderer attaches a section after it. Editing view appends the
     backlinks element to `.cm-sizer`, so that is the sizer there. */
  private anchorFor(view: MarkdownView): { anchor: Element; after: boolean } | null {
    const backlinks = view.containerEl.querySelector(BACKLINKS_SELECTOR);
    if (backlinks) return { anchor: backlinks, after: true };
    const container = view.containerEl.querySelector(view.getMode() === 'preview' ? '.markdown-preview-sizer' : '.cm-sizer');
    return container ? { anchor: container, after: false } : null;
  }

  /* The binding exists from the first sweep on; the block is placed as
     soon as there is somewhere to put it. Reading view renders its
     sections as they scroll into view and attaches its footer section
     only when the end of the note is rendered, so the observer watches
     the preview sizer's children as well as the mode attribute, and
     places the block the moment the footer section appears. */
  private bind(view: MarkdownView): FooterBinding {
    const el = createDiv({ cls: 'icor-canvases-footer' });
    const binding: FooterBinding = { view, el, observer: new MutationObserver(() => this.place(binding)) };
    binding.observer.observe(view.containerEl, { attributes: true, attributeFilter: ['data-mode'] });
    const sizer = view.containerEl.querySelector('.markdown-preview-sizer');
    if (sizer) binding.observer.observe(sizer, { childList: true });
    this.bindings.set(view, binding);
    view.register(() => this.unbind(view));
    this.place(binding);
    return binding;
  }

  private unbind(view: MarkdownView): void {
    const binding = this.bindings.get(view);
    if (!binding) return;
    this.bindings.delete(view);
    binding.observer.disconnect();
    binding.el.detach();
  }

  private place(binding: FooterBinding): void {
    const target = this.anchorFor(binding.view);
    if (!target) return;
    const { anchor, after } = target;
    if (after) {
      if (anchor.nextElementSibling !== binding.el) anchor.after(binding.el);
    } else if (anchor.lastElementChild !== binding.el) {
      anchor.appendChild(binding.el);
    }
  }

  private render(binding: FooterBinding): void {
    const { el, view } = binding;
    el.empty();
    const file = view.file;
    const placements = file ? this.host.index.placementsFor(file.path) : [];
    if (placements.length === 0) {
      el.hide();
      return;
    }
    el.show();
    el.toggleClass('is-collapsed', collapsed);
    const heading = el.createDiv({ cls: 'icor-canvases-footer-heading', attr: { role: 'button', tabindex: '0', 'aria-expanded': String(!collapsed) } });
    setIcon(heading.createSpan({ cls: 'icor-canvases-footer-chevron' }), 'chevron-down');
    heading.createSpan({ cls: 'icor-canvases-footer-title', text: 'Canvases' });
    heading.createSpan({ cls: 'icor-canvases-footer-count', text: String(placements.length) });
    const toggle = (): void => {
      collapsed = !collapsed;
      this.renderAll();
    };
    heading.addEventListener('click', toggle);
    heading.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        toggle();
      }
    });
    if (!collapsed) renderPlacements(this.host.app, el.createDiv({ cls: 'icor-canvases-list' }), placements);
    this.place(binding);
  }
}
