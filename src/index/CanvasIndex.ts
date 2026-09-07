/* Every .canvas file the metadata cache names, parsed, and the map from a
 * note to the canvases it sits on. The cache lists a canvas as a link
 * source once it holds a file card or a link (1.13.7 indexes canvas files
 * through the core Canvas plugin), which is exactly the set with anything
 * to index; the vault is never enumerated. Built once the layout is ready,
 * kept fresh from the vault's own events for canvas files (debounced), and
 * rebuilt once when the metadata cache reports the vault resolved (the
 * cache may still be empty at layout-ready). Views subscribe and re-render
 * on every change. */
import { TFile, debounce } from 'obsidian';
import type { App } from 'obsidian';
import type { CanvasPlacements, Placement } from './parse';
import { parseCanvasFile } from './parse';

export const CANVAS_EXTENSION = 'canvas';

export type Unsubscribe = () => void;

export class CanvasIndex {
  private readonly byCanvas = new Map<string, CanvasPlacements>();
  private byNote = new Map<string, Placement[]>();
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

  /* Reads every canvas file the cache names. Safe to call again; the
     result replaces the old map in one step. */
  async rebuild(): Promise<void> {
    const files = this.knownCanvases();
    const next = new Map<string, CanvasPlacements>();
    for (const file of files) {
      const placements = await this.read(file);
      if (placements) next.set(file.path, placements);
    }
    this.byCanvas.clear();
    for (const [path, placements] of next) this.byCanvas.set(path, placements);
    this.built = true;
    this.recompute();
    this.log(`index rebuilt: ${files.length} canvases, ${this.byNote.size} notes placed`);
  }

  /* A canvas file changed or appeared; read it again soon. */
  touch(path: string): void {
    this.pending.add(path);
    this.flush();
  }

  remove(path: string): void {
    this.pending.delete(path);
    if (this.byCanvas.delete(path)) this.recompute();
  }

  rename(oldPath: string, file: TFile): void {
    this.pending.delete(oldPath);
    this.byCanvas.delete(oldPath);
    this.touch(file.path);
    this.recompute();
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
    let changed = false;
    for (const path of paths) {
      const file = this.app.vault.getFileByPath(path);
      if (!this.isCanvasFile(file)) {
        changed = this.byCanvas.delete(path) || changed;
        continue;
      }
      const placements = await this.read(file);
      if (placements) this.byCanvas.set(path, placements);
      else this.byCanvas.delete(path);
      changed = true;
    }
    if (changed) {
      this.recompute();
      this.log(`index updated: ${paths.length} canvas file(s)`);
    }
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
    for (const listener of this.listeners) listener();
  }
}
