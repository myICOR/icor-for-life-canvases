/* The index's tables as pure data: every canvas the index has read and
 * the map from a note to the canvases it sits on. No Obsidian import, so
 * the tests can drive it: a canvas that arrives after the first rebuild
 * is added, never dropped, because nothing here clears. */
import type { CanvasPlacements, Placement } from './parse';

export class IndexStore {
  private readonly byCanvas = new Map<string, CanvasPlacements>();
  private byNote = new Map<string, Placement[]>();

  get size(): number {
    return this.byCanvas.size;
  }

  has(path: string): boolean {
    return this.byCanvas.has(path);
  }

  paths(): string[] {
    return [...this.byCanvas.keys()];
  }

  /* Sets or replaces one canvas; the others stay. */
  set(path: string, placements: CanvasPlacements): void {
    this.byCanvas.set(path, placements);
    this.recompute();
  }

  /* Sets or replaces many at once, one recompute. */
  setMany(entries: Iterable<[string, CanvasPlacements]>): void {
    for (const [path, placements] of entries) this.byCanvas.set(path, placements);
    this.recompute();
  }

  remove(path: string): boolean {
    const had = this.byCanvas.delete(path);
    if (had) this.recompute();
    return had;
  }

  placementsFor(notePath: string): Placement[] {
    return this.byNote.get(notePath) ?? [];
  }

  /* The distinct canvases a note is on, in vault order. */
  canvasesFor(notePath: string): string[] {
    const seen = new Set<string>();
    for (const p of this.placementsFor(notePath)) seen.add(p.canvasPath);
    return [...seen];
  }

  private recompute(): void {
    const next = new Map<string, Placement[]>();
    const canvases = [...this.byCanvas.keys()].sort((a, b) => a.localeCompare(b));
    for (const canvasPath of canvases) {
      const placements = this.byCanvas.get(canvasPath);
      if (!placements) continue;
      for (const [notePath, list] of placements) {
        const existing = next.get(notePath) ?? [];
        existing.push(...list);
        next.set(notePath, existing);
      }
    }
    this.byNote = next;
  }
}
