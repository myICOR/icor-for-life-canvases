/* One wrap of the selection toolbar's `render` per canvas, shared by every
 * feature that reacts to the selection: the tools' group button and the
 * shape buttons on a text card. The frame loop calls `render` with
 * `rebuild` true on a selection change and false when only the viewport
 * moved, so listeners run on the former only; a viewport pan costs one
 * boolean test. */
import { around, selectionMenu } from './internals';
import type { Canvas, CanvasMenu } from './internals';

export type SelectionListener = (menuEl: HTMLElement) => void;

export class SelectionMenuHook {
  private restore: (() => void) | null = null;
  private readonly listeners = new Set<SelectionListener>();

  constructor(private readonly canvas: Canvas) {}

  /* False when the toolbar does not have the shape expected; the caller
     then leaves the selection-driven features off. */
  attach(): boolean {
    const menu = selectionMenu(this.canvas);
    if (!menu) return false;
    const fire = (): void => {
      for (const listener of this.listeners) listener(menu.menuEl);
    };
    this.restore = around(menu, 'render', (original) => {
      return function (this: CanvasMenu, rebuild?: boolean) {
        original.call(this, rebuild);
        if (rebuild === true) fire();
      };
    });
    return true;
  }

  on(listener: SelectionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /* Asks the toolbar for a rebuild now, so a listener added after the
     selection was made sees it. */
  refresh(): void {
    selectionMenu(this.canvas)?.render(true);
  }

  dispose(): void {
    this.listeners.clear();
    this.restore?.();
    this.restore = null;
  }
}
