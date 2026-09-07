/* The column layout: the canvas's bottom card menu (add card, add note,
 * add media) moves into the controls column under the tool group, and
 * the canvas's zoom items move out of the column into a bar at the
 * bottom right: fit, zoom out, the live percentage, zoom in. Core's own
 * elements are moved, never recreated, so their click and drag-to-place
 * handlers keep working; on dispose everything goes back where it was,
 * in its original order. The percentage follows the target zoom through
 * an instance wrap of `markViewportChanged` (one read per change, no
 * loop) and opens a flyout with the zoom presets and the minimap toggle. */
import { setIcon, setTooltip } from 'obsidian';
import { Flyout, flyoutDivider, flyoutRow } from './flyout';
import { around, cardMenu, controlsColumn } from './internals';
import type { Canvas } from './internals';

export interface LayoutHost {
  minimapShown(): boolean;
  toggleMinimap(): void;
  log(message: string): void;
}

/* The zoom presets in the percentage flyout. */
export const ZOOM_PRESETS: readonly number[] = [50, 100, 200, 400];

/* Core clamps the zoom (log2) to this range in its frame. */
const MIN_ZOOM = -4;
const MAX_ZOOM = 1;

interface MovedItem {
  el: HTMLElement;
  group: HTMLElement;
  next: Element | null;
}

/* The zoom items by the icon core sets on each. */
const ZOOM_ICONS = { in: 'lucide-plus', reset: 'lucide-rotate-cw', fit: 'lucide-maximize', out: 'lucide-minus' } as const;

export function zoomPercent(zoom: number): number {
  return Math.round(Math.pow(2, Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))) * 100);
}

export class ColumnLayout {
  private menuHome: { parent: HTMLElement; next: Element | null } | null = null;
  private moved: MovedItem[] = [];
  private bar: HTMLElement | null = null;
  private percent: HTMLElement | null = null;
  private shown = -1;
  private restoreViewport: (() => void) | null = null;
  private readonly abort = new AbortController();

  constructor(
    private readonly canvas: Canvas,
    private readonly host: LayoutHost,
  ) {}

  attach(): void {
    this.moveCardMenu();
    this.buildZoomBar();
    const update = (): void => this.updatePercent();
    this.restoreViewport = around(this.canvas, 'markViewportChanged', (original) => {
      return function (this: Canvas) {
        original.call(this);
        update();
      };
    });
    this.updatePercent();
  }

  zoomTo(percent: number): void {
    const target = Math.log2(percent / 100);
    this.canvas.zoomBy(target - this.canvas.tZoom);
  }

  dispose(): void {
    this.abort.abort();
    this.restoreViewport?.();
    this.restoreViewport = null;
    for (const item of this.moved.reverse()) item.group.insertBefore(item.el, item.next);
    this.moved = [];
    this.bar?.detach();
    this.bar = null;
    const menu = cardMenu(this.canvas);
    if (menu && this.menuHome) {
      menu.removeClass('icor-canvases-card-menu', 'canvas-control-group', 'mod-raised');
      this.menuHome.parent.insertBefore(menu, this.menuHome.next);
    }
    this.menuHome = null;
  }

  /* The bottom menu becomes a group at the end of the column. The
     borrowed group classes give it the column's look; the element and
     its handlers are core's own. */
  private moveCardMenu(): void {
    const menu = cardMenu(this.canvas);
    const column = controlsColumn(this.canvas);
    if (!menu || !column || !menu.parentElement) {
      this.host.log('layout: no card menu or column; the bottom menu stays');
      return;
    }
    this.menuHome = { parent: menu.parentElement, next: menu.nextElementSibling };
    menu.addClass('icor-canvases-card-menu', 'canvas-control-group', 'mod-raised');
    column.appendChild(menu);
  }

  /* The zoom items leave their group for a horizontal bar at the bottom
     right; the reset item stays in its (now hidden) group, replaced by
     the percentage. */
  private buildZoomBar(): void {
    const column = controlsColumn(this.canvas);
    if (!column) return;
    const find = (icon: string): HTMLElement | null => column.querySelector<HTMLElement>(`.canvas-control-item:has(> svg.${icon})`);
    const fit = find(ZOOM_ICONS.fit);
    const zoomIn = find(ZOOM_ICONS.in);
    const zoomOut = find(ZOOM_ICONS.out);
    const reset = find(ZOOM_ICONS.reset);
    if (!fit || !zoomIn || !zoomOut || !reset || fit.parentElement !== zoomIn.parentElement) {
      this.host.log('layout: the zoom group was not found; the zoom bar is not built');
      return;
    }
    const group = fit.parentElement;
    if (!group) return;
    const bar = this.canvas.wrapperEl.createDiv({ cls: 'icor-canvases-zoom-bar' });
    const row = bar.createDiv({ cls: ['canvas-control-group', 'mod-raised', 'icor-canvases-zoom-group'] });
    const move = (el: HTMLElement): void => {
      this.moved.push({ el, group, next: el.nextElementSibling });
      row.appendChild(el);
    };
    move(fit);
    move(zoomOut);
    const percent = row.createDiv({ cls: ['canvas-control-item', 'icor-canvases-zoom-percent'], attr: { role: 'button', tabindex: '0', 'aria-label': 'Zoom' } });
    setTooltip(percent, 'Zoom: presets, fit, minimap', { placement: 'top' });
    const open = (): void => this.openZoomMenu(percent);
    percent.addEventListener(
      'click',
      (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        open();
      },
      { signal: this.abort.signal },
    );
    percent.addEventListener(
      'keydown',
      (evt) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault();
          open();
        }
      },
      { signal: this.abort.signal },
    );
    this.percent = percent;
    move(zoomIn);
    /* The group keeps the reset item, out of sight; a wrapper class
       hides the emptied group without touching its element. */
    group.addClass('icor-canvases-zoom-source');
    this.moved.push({ el: reset, group, next: reset.nextElementSibling });
    this.bar = bar;
    /* Presses on the bar are not presses on the canvas. */
    for (const type of ['pointerdown', 'dblclick', 'contextmenu'] as const) {
      bar.addEventListener(type, (evt) => evt.stopPropagation(), { signal: this.abort.signal });
    }
  }

  private updatePercent(): void {
    if (!this.percent) return;
    const value = zoomPercent(this.canvas.tZoom);
    if (value === this.shown) return;
    this.shown = value;
    this.percent.setText(`${value}%`);
  }

  private openZoomMenu(anchor: HTMLElement): void {
    const current = zoomPercent(this.canvas.tZoom);
    Flyout.open({
      anchor,
      placement: 'above',
      build: (panel, close) => {
        panel.addClass('icor-canvases-flyout-list');
        flyoutRow(panel, this.host.minimapShown() ? 'Hide minimap' : 'Show minimap', 'M', this.host.minimapShown(), () => {
          this.host.toggleMinimap();
          close();
        });
        flyoutDivider(panel);
        const fitRow = flyoutRow(panel, 'Fit to screen', '⇧1', false, () => {
          this.canvas.zoomToFit();
          close();
        });
        setIcon(fitRow.createSpan({ cls: 'icor-canvases-flyout-row-icon' }), 'maximize');
        fitRow.prepend(fitRow.lastElementChild as HTMLElement);
        for (const preset of ZOOM_PRESETS) {
          flyoutRow(panel, `${preset}%`, '', preset === current, () => {
            this.zoomTo(preset);
            close();
          });
        }
      },
    });
  }
}
