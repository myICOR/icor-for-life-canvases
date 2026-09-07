/* Every .canvas file the metadata cache names, parsed, and the map from a
 * note to the canvases it sits on. The cache lists a canvas as a link
 * source once it holds a file card or a link (1.13.7 indexes canvas files
 * through the core Canvas plugin), which is exactly the set with anything
 * to index; the vault is never enumerated. Core indexes one canvas per
 * idle callback at startup and reports each through the cache's `resolve`
 * event, so the index reads a canvas when it resolves, reads the whole
 * known set at layout-ready and once more when the cache reports
 * `resolved`, and never clears what it has: a canvas core had not reached
 * yet is added when it arrives, not dropped by a sweep. The vault's own
 * events for canvas files keep it fresh (debounced). Views subscribe and
 * re-render on every change. */
import { TFile, debounce } from 'obsidian';
import type { App } from 'obsidian';
import type { CanvasPlacements, Placement } from './parse';
import { parseCanvasFile } from './parse';
import { IndexStore } from './store';

export const CANVAS_EXTENSION = 'canvas';

export type Unsubscribe = () => void;

export class CanvasIndex {
  private readonly store = new IndexStore();
  private readonly listeners = new Set<() => void>();
  private readonly pending = new Set<string>();
  private readonly flush = debounce(() => void this.flushPending(), 300, true);
  private built = false;

  constructor(private readonly app: App, private readonly log: (message: string) => void) {}

  get ready(): boolean {
    return this.built;
  }

  isCanvasFile(file: unknown): file is TFile {
    return file instanceof TFile && file.extension === CANVAS_EXTENSION;
  }

  /* The canvas files the metadata cache names as link sources. */
  private knownCanvases(): TFile[] {
    const out: TFile[] = [];
    for (const path of Object.keys(this.app.metadataCache.resolvedLinks)) {
      if (!path.endsWith(`.${CANVAS_EXTENSION}`)) continue;
      const file = this.app.vault.getFileByPath(path);
      if (this.isCanvasFile(file)) out.push(file);
    }
    return out;
  }

  /* Reads every canvas file the cache names now and merges the result;
     nothing already indexed is dropped (a sweep that cleared lost every
     canvas core had not reached yet). Safe to call again. */
  async rebuild(): Promise<void> {
    const files = this.knownCanvases();
    const next = new Map<string, CanvasPlacements>();
    for (const file of files) {
      const placements = await this.read(file);
      if (placements) next.set(file.path, placements);
    }
    this.store.setMany(next);
    /* A sweep can only add or correct; the one thing it drops is a path
       that is no longer a canvas file. */
    for (const path of this.store.paths()) {
      if (!this.isCanvasFile(this.app.vault.getFileByPath(path))) this.store.remove(path);
    }
    this.built = true;
    this.notify();
    this.log(`index swept: ${files.length} canvases named by the cache, ${this.store.size} indexed`);
  }

  /* A canvas file changed or appeared; read it again soon. */
  touch(path: string): void {
    this.pending.add(path);
    this.flush();
  }

  remove(path: string): void {
    this.pending.delete(path);
    if (this.store.remove(path)) this.notify();
  }

  rename(oldPath: string, file: TFile): void {
    this.pending.delete(oldPath);
    if (this.store.remove(oldPath)) this.notify();
    this.touch(file.path);
  }

  placementsFor(notePath: string): Placement[] {
    return this.store.placementsFor(notePath);
  }

  /* The distinct canvases a note is on, in vault order. */
  canvasesFor(notePath: string): string[] {
    return this.store.canvasesFor(notePath);
  }

  /* At unload: a pending flush must not read a file and call listeners
     after the plugin is gone. */
  dispose(): void {
    this.flush.cancel();
    this.pending.clear();
    this.listeners.clear();
  }

  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async read(file: TFile): Promise<CanvasPlacements | null> {
    try {
      return parseCanvasFile(file.path, await this.app.vault.cachedRead(file));
    } catch {
      return null;
    }
  }

  private async flushPending(): Promise<void> {
    const paths = [...this.pending];
    this.pending.clear();
    const next = new Map<string, CanvasPlacements>();
    let removed = false;
    for (const path of paths) {
      const file = this.app.vault.getFileByPath(path);
      const placements = this.isCanvasFile(file) ? await this.read(file) : null;
      if (placements) next.set(path, placements);
      else removed = this.store.remove(path) || removed;
    }
    if (next.size > 0) this.store.setMany(next);
    if (next.size > 0 || removed) {
      this.notify();
      this.log(`index updated: ${paths.length} canvas file(s)`);
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
