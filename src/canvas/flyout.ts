/* A small popover anchored to a button: every option visible at once,
 * the way the canvas's own colour submenu opens under its palette button
 * (1.13.7, `canvas-submenu`). One flyout is open at a time; a press
 * outside it, Escape, or choosing an option closes it. The panel carries
 * the canvas's submenu class so the theme styles it like core's, and a
 * placement class of its own: below the anchor inside the floating
 * selection menu, or to the left of the anchor inside the controls column
 * on the right edge. Options are buttons for the keyboard: the first one
 * takes focus on open, Enter and Space activate. */
import { setTooltip } from 'obsidian';

export type FlyoutPlacement = 'below' | 'left';

export interface FlyoutOptions {
  /* The button the flyout hangs on; gets `is-active` while open. */
  anchor: HTMLElement;
  /* Where the panel is appended: a positioned ancestor of the anchor. */
  host: HTMLElement;
  placement: FlyoutPlacement;
  /* Wider panels lay their options out on a grid of this many columns. */
  columns?: number;
  build(panel: HTMLElement, close: () => void): void;
}

let current: Flyout | null = null;

export class Flyout {
  readonly el: HTMLElement;
  private readonly abort = new AbortController();

  static open(options: FlyoutOptions): Flyout {
    /* A second press on the same anchor closes. */
    if (current?.anchor === options.anchor) {
      current.close();
      return current;
    }
    current?.close();
    const flyout = new Flyout(options);
    current = flyout;
    return flyout;
  }

  static closeAll(): void {
    current?.close();
  }

  static get isOpen(): boolean {
    return current !== null;
  }

  private constructor(private readonly options: FlyoutOptions) {
    const { anchor, host, placement, columns } = options;
    const el = host.createDiv({ cls: ['canvas-submenu', 'icor-canvases-flyout', `icor-canvases-flyout-${placement}`], attr: { role: 'group' } });
    if (columns) {
      el.addClass('icor-canvases-flyout-grid');
      el.setCssProps({ '--icor-canvases-flyout-columns': String(columns) });
    }
    /* Beside the anchor, not the host's top: measured once, on open. */
    if (placement === 'left') el.setCssProps({ '--icor-canvases-flyout-top': `${anchor.offsetTop}px` });
    this.el = el;
    anchor.addClass('is-active');
    const close = (): void => this.close();
    options.build(el, close);
    const signal = this.abort.signal;
    /* Presses stay inside: the canvas must not see one as a press on the
       wrapper (a rubber band, a pan) or the controls (another button). */
    for (const type of ['pointerdown', 'click', 'dblclick', 'contextmenu'] as const) {
      el.addEventListener(type, (evt) => evt.stopPropagation(), { signal });
    }
    const doc = anchor.doc;
    doc.addEventListener(
      'pointerdown',
      (evt) => {
        const target = evt.target;
        if (target instanceof Node && (el.contains(target) || anchor.contains(target))) return;
        this.close();
      },
      { capture: true, signal },
    );
    doc.addEventListener(
      'keydown',
      (evt) => {
        if (evt.key !== 'Escape') return;
        evt.preventDefault();
        evt.stopPropagation();
        this.close();
        anchor.focus();
      },
      { capture: true, signal },
    );
    el.querySelector<HTMLElement>('[tabindex="0"], button')?.focus();
  }

  get anchor(): HTMLElement {
    return this.options.anchor;
  }

  close(): void {
    if (current === this) current = null;
    this.abort.abort();
    this.options.anchor.removeClass('is-active');
    this.el.detach();
  }
}

/* One option in a flyout: a keyboard-reachable button with a tooltip. */
export function flyoutOption(panel: HTMLElement, cls: string[], label: string, active: boolean, onChoose: () => void): HTMLElement {
  const el = panel.createDiv({ cls, attr: { role: 'button', tabindex: '0', 'aria-label': label, 'aria-pressed': String(active) } });
  if (active) el.addClass('is-active');
  setTooltip(el, label, { placement: 'top' });
  el.addEventListener('click', (evt) => {
    evt.preventDefault();
    onChoose();
  });
  el.addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault();
      onChoose();
    }
  });
  return el;
}
