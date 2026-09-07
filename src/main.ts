/* ICOR for Life - Canvases. Four things for Obsidian's canvas: an ink
 * layer per canvas, saved in the .canvas file; modifier-click on a note
 * card to open it in the right sidebar; a toolbar on every note card with
 * a pill for notes that sit on more than one canvas; and an index of every
 * canvas in the vault that shows, under each note and in a sidebar view,
 * which canvases the note is on and what its card is connected to there.
 * The canvas API Obsidian does not publish is reached through one guarded
 * adapter (src/canvas/internals.ts). */
import { Notice, Plugin, TFile } from 'obsidian';
import { CanvasRegistry } from './canvas/registry';
import { VIEW_TYPE } from './constants';
import { CanvasIndex } from './index/CanvasIndex';
import { debugLog } from './log';
import { openInNewTab, openInRightSidebar } from './open';
import { DEFAULT_SETTINGS, normaliseSettings } from './settings/model';
import type { CanvasesSettings } from './settings/model';
import { CanvasesSettingsTab } from './settings/SettingsTab';
import { CanvasesView, VIEW_ICON, VIEW_TITLE } from './views/CanvasesView';
import { Footers } from './views/footer';

const NO_SIDEBAR = 'The right sidebar is not available in this window.';

export default class CanvasesPlugin extends Plugin {
  override settings: CanvasesSettings = { ...DEFAULT_SETTINGS };
  private index!: CanvasIndex;
  private registry!: CanvasRegistry;
  private footers!: Footers;

  override async onload(): Promise<void> {
    this.settings = normaliseSettings(await this.loadData());
    const log = (message: string): void => this.log(message);
    const settings = (): CanvasesSettings => this.settings;
    this.index = new CanvasIndex(this.app, log);
    this.registry = new CanvasRegistry({ app: this.app, index: this.index, settings, log });
    this.footers = new Footers({ app: this.app, index: this.index, enabled: () => this.settings.footer, log });

    this.registerView(VIEW_TYPE, (leaf) => new CanvasesView(leaf, this.index));
    this.addRibbonIcon(VIEW_ICON, `Open ${VIEW_TITLE.toLowerCase()} panel`, () => {
      void this.openPanel();
    });
    this.addSettingTab(new CanvasesSettingsTab(this.app, this));
    this.registerCommands();
    this.registerIndexEvents();
    this.registerNodeMenu();

    const sweep = (): void => {
      this.registry.sweep();
      this.footers.sweep();
    };
    this.registerEvent(this.app.workspace.on('layout-change', sweep));
    this.registerEvent(this.app.workspace.on('active-leaf-change', sweep));
    this.registerEvent(this.app.workspace.on('file-open', () => this.footers.sweep()));
    this.registerMarkdownPostProcessor(() => {
      this.footers.scheduleSweep();
    });
    this.app.workspace.onLayoutReady(() => {
      void this.index.rebuild();
      this.footers.start();
      sweep();
    });
  }

  override onunload(): void {
    this.registry.disposeAll();
    this.footers.disposeAll();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /* After a settings change: every open canvas and note follows. */
  applySettings(): void {
    this.registry.applySettings();
    this.footers.sweep();
  }

  log(message: string): void {
    debugLog(this.settings.debug, message);
  }

  private registerCommands(): void {
    this.addCommand({
      id: 'toggle-drawing-mode',
      name: 'Toggle drawing mode',
      icon: 'pencil',
      checkCallback: (checking) => {
        const binding = this.registry.active();
        if (!binding?.ink) return false;
        if (!checking) binding.ink.toggleDraw();
        return true;
      },
    });
    this.addCommand({
      id: 'undo-last-stroke',
      name: 'Undo last stroke',
      icon: 'undo-2',
      checkCallback: (checking) => {
        const binding = this.registry.active();
        if (!binding?.ink) return false;
        if (!checking) binding.ink.undoLast();
        return true;
      },
    });
    this.addCommand({
      id: 'open-canvases-panel',
      name: 'Open canvases panel',
      icon: VIEW_ICON,
      callback: () => void this.openPanel(),
    });
  }

  private registerIndexEvents(): void {
    const { vault, metadataCache } = this.app;
    this.registerEvent(
      vault.on('modify', (file) => {
        if (this.index.isCanvasFile(file)) this.index.touch(file.path);
      }),
    );
    this.registerEvent(
      vault.on('create', (file) => {
        if (this.index.isCanvasFile(file)) this.index.touch(file.path);
      }),
    );
    this.registerEvent(
      vault.on('delete', (file) => {
        if (file instanceof TFile && file.extension === 'canvas') this.index.remove(file.path);
      }),
    );
    this.registerEvent(
      vault.on('rename', (file, oldPath) => {
        if (this.index.isCanvasFile(file)) this.index.rename(oldPath, file);
        else if (oldPath.endsWith('.canvas')) this.index.remove(oldPath);
      }),
    );
    /* The first resolve after startup means every file is indexed; the
       canvases are read again then, in case the vault was still loading
       when the layout was ready. */
    const once = metadataCache.on('resolved', () => {
      metadataCache.offref(once);
      void this.index.rebuild();
    });
    this.registerEvent(once);
  }

  /* The context menu of a note card fires the public `file-menu` event
     with the source 'canvas-menu' (1.13.7), so the two items need no
     private event. */
  private registerNodeMenu(): void {
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file, source) => {
        if (source !== 'canvas-menu' || !(file instanceof TFile)) return;
        menu.addItem((item) =>
          item
            .setSection('open')
            .setTitle('Open in right sidebar')
            .setIcon('panel-right')
            .onClick(() => void openInRightSidebar(this.app, file)),
        );
        menu.addItem((item) =>
          item
            .setSection('open')
            .setTitle('Open in new tab')
            .setIcon('maximize-2')
            .onClick(() => void openInNewTab(this.app, file)),
        );
      }),
    );
  }

  private async openPanel(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (existing) {
      await workspace.revealLeaf(existing);
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice(NO_SIDEBAR);
      return;
    }
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await workspace.revealLeaf(leaf);
  }
}
