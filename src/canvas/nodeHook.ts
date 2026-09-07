/* One wrap of the canvas's `addNode` per canvas, shared by every feature
 * that decorates cards: the toolbar and the shapes. Every card goes
 * through `addNode`, on load and on create, and its data (file, text,
 * unknown keys) is set right after in the same loop, so listeners run on
 * the next microtask and see it. */
import { around } from './internals';
import type { Canvas, CanvasNode } from './internals';

export type NodeListener = (node: CanvasNode) => void;

export class NodeAddHook {
  private restore: (() => void) | null = null;
  private readonly listeners = new Set<NodeListener>();
  private disposed = false;

  constructor(private readonly canvas: Canvas) {}

  attach(): void {
    const fire = (node: CanvasNode): void => {
      if (this.disposed) return;
      for (const listener of this.listeners) listener(node);
    };
    this.restore = around(this.canvas, 'addNode', (original) => {
      return function (this: Canvas, node) {
        original.call(this, node);
        queueMicrotask(() => fire(node));
      };
    });
  }

  on(listener: NodeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.restore?.();
    this.restore = null;
  }
}
