/* The sidebar view: the canvases the active note is on and what its card
 * is connected to on each, following the active file. Empty states are
 * one line. */
import { ItemView } from 'obsidian';
import type { TFile, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE } from '../constants';
import type { CanvasIndex, Unsubscribe } from '../index/CanvasIndex';
import { renderPlacements } from './rows';

export const VIEW_ICON = 'layout-dashboard';
export const VIEW_TITLE = 'Canvases';

export class CanvasesView extends ItemView {
  override navigation = false;
  private file: TFile | null = null;
  private unsubscribe: Unsubscribe | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly index: CanvasIndex) {
    super(leaf);
  }

  override getViewType(): string {
    return VIEW_TYPE;
  }

  override getDisplayText(): string {
    return VIEW_TITLE;
  }

  override getIcon(): string {
    return VIEW_ICON;
  }

  override async onOpen(): Promise<void> {
    this.contentEl.addClass('icor-canvases-view');
    this.file = this.app.workspace.getActiveFile();
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file) this.file = file;
        this.render();
      }),
    );
    this.unsubscribe = this.index.subscribe(() => this.render());
    this.render();
    return Promise.resolve();
  }

  override async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    return Promise.resolve();
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    const file = this.file;
    if (!file) {
      container.createDiv({ cls: 'icor-canvases-empty', text: 'No note is open.' });
      return;
    }
    container.createDiv({ cls: 'icor-canvases-note', text: file.basename });
    const placements = this.index.placementsFor(file.path);
    if (placements.length === 0) {
      container.createDiv({ cls: 'icor-canvases-empty', text: this.index.ready ? 'Not on any canvas' : 'Reading canvases' });
      return;
    }
    renderPlacements(this.app, container.createDiv({ cls: 'icor-canvases-list' }), placements);
  }
}
