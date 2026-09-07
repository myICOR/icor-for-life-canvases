/* ICOR for Life - Canvases. For Obsidian's canvas: an ink layer per
 * canvas, saved in the .canvas file; modifier-click on a note card to open
 * it in the right sidebar; a toolbar on every note card with a pill for
 * notes that sit on more than one canvas; and an index of every canvas in
 * the vault that shows, under each note and inside the Backlinks pane,
 * which canvases the note is on and what its card is connected to there.
 * The canvas API Obsidian does not publish is reached through one guarded
 * adapter (src/canvas/internals.ts). */
import { FileView, Notice, Plugin, TFile } from 'obsidian';
import { CanvasRegistry } from './canvas/registry';
import { registerNodeMenu } from './canvas/shapes';
import type { Tool } from './canvas/tools';
import { VIEW_TYPE } from './constants';
import { CanvasIndex } from './index/CanvasIndex';
import { debugLog } from './log';
import { openInNewTab, openInRightSidebar } from './open';
import { DEFAULT_SETTINGS, normaliseSettings } from './settings/model';
import type { CanvasesSettings } from './settings/model';
import { CanvasesSettingsTab } from './settings/SettingsTab';
import { BACKLINK_VIEW_TYPE, BacklinksSections } from './views/backlinksSection';
import { Footers } from './views/footer';

const NO_SIDEBAR = 'The right sidebar is not available in this window.';

export default class CanvasesPlugin extends Plugin {
  override settings: CanvasesSettings = { ...DEFAULT_SETTINGS };
  private index!: CanvasIndex;
  private registry!: CanvasRegistry;
  private footers!: Footers;
  private backlinks!: BacklinksSections;

  override async onload(): Promise<void> {
    this.settings = normaliseSettings(await this.loadData());
    const log = (message: string): void => this.log(message);
    const settings = (): CanvasesSettings => this.settings;
    this.index = new CanvasIndex(this.app, log);
    this.registry = new CanvasRegistry({ app: this.app, index: this.index, settings, toggleMinimap: () => void this.toggleMinimap(), log });
    this.footers = new Footers({ app: this.app, index: this.index, enabled: () => this.settings.footer, log });
    this.backlinks = new BacklinksSections({ app: this.app, index: this.index, log });

    this.addSettingTab(new CanvasesSettingsTab(this.app, this));
    this.registerCommands();
    this.registerIndexEvents();
    this.registerNodeMenu();
    /* The private node-menu event, for the Shape item on a text card. */
    this.registerEvent(registerNodeMenu(this.app, (node) => this.registry.shapesFor(node)));

    const sweep = (): void => {
      this.registry.sweep();
      this.registry.refreshStatusBar();
      this.footers.sweep();
      this.backlinks.sweep();
    };
    this.registerEvent(this.app.workspace.on('layout-change', sweep));
    this.registerEvent(
      this.app.workspace.on('css-change', () => {
        this.registry.refreshTheme();
        this.registry.refreshStatusBar();
      }),
    );
    this.registerEvent(this.app.workspace.on('resize', () => this.registry.refreshStatusBar()));
    this.registerEvent(this.app.workspace.on('active-leaf-change', sweep));
    this.registerEvent(
      this.app.workspace.on('file-open', () => {
        this.footers.sweep();
        this.backlinks.sweep();
        this.registry.refreshFiles();
      }),
    );
    this.registerMarkdownPostProcessor(() => {
      this.footers.scheduleSweep();
    });
    this.app.workspace.onLayoutReady(() => {
      /* 0.1.0 had its own "Canvases" sidebar view; 0.2.0 folds it into the
         Backlinks pane. A leaf of the retired type left in the workspace
         would otherwise show as a view that no longer exists. */
      this.app.workspace.detachLeavesOfType(VIEW_TYPE);
      void this.index.rebuild();
      this.footers.start();
      this.backlinks.start();
      sweep();
    });
  }

  override onunload(): void {
    this.registry.disposeAll();
    this.footers.disposeAll();
    this.backlinks.disposeAll();
    this.index.dispose();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /* The minimap setting, flipped from the zoom flyout, the M key or the
     command; every open canvas follows. */
  async toggleMinimap(): Promise<void> {
    this.settings = { ...this.settings, minimap: !this.settings.minimap };
    await this.saveSettings();
    this.applySettings();
  }

  /* After a settings change: every open canvas and note follows. */
  applySettings(): void {
    this.registry.applySettings();
    this.footers.sweep();
    this.backlinks.renderAll();
  }

  log(message: string): void {
    debugLog(this.settings.debug, message);
  }

  private registerCommands(): void {
    /* The 0.1.0 id is kept: the pen tool is what drawing mode became. */
    this.addCommand({
      id: 'toggle-drawing-mode',
      name: 'Pen tool',
      icon: 'pencil',
      checkCallback: (checking) => {
        const binding = this.registry.active();
        if (!binding?.ink) return false;
        if (!checking) {
          if (binding.tools) binding.tools.toggle('pen');
          else binding.ink.toggleDraw();
        }
        return true;
      },
    });
    const setTool = (checking: boolean, tool: Tool): boolean => {
      const binding = this.registry.active();
      if (!binding?.tools) return false;
      if (!checking) binding.tools.setTool(tool);
      return true;
    };
    this.addCommand({
      id: 'select-tool',
      name: 'Select tool',
      icon: 'mouse-pointer',
      checkCallback: (checking) => setTool(checking, 'select'),
    });
    this.addCommand({
      id: 'hand-tool',
      name: 'Hand tool',
      icon: 'hand',
      checkCallback: (checking) => setTool(checking, 'hand'),
    });
    this.addCommand({
      id: 'eraser-tool',
      name: 'Eraser tool',
      icon: 'eraser',
      checkCallback: (checking) => setTool(checking, 'eraser'),
    });
    this.addCommand({
      id: 'zoom-to-fit',
      name: 'Zoom to fit',
      icon: 'maximize',
      checkCallback: (checking) => {
        const binding = this.registry.active();
        if (!binding?.layout) return false;
        if (!checking) binding.canvas.zoomToFit();
        return true;
      },
    });
    this.addCommand({
      id: 'zoom-to-100',
      name: 'Zoom to 100%',
      icon: 'scan',
      checkCallback: (checking) => {
        const binding = this.registry.active();
        if (!binding?.layout) return false;
        if (!checking) binding.layout.zoomTo(100);
        return true;
      },
    });
    this.addCommand({
      id: 'toggle-minimap',
      name: 'Toggle minimap',
      icon: 'map',
      callback: () => void this.toggleMinimap(),
    });
    this.addCommand({
      id: 'fit-shape-to-text',
      name: 'Fit shape to text',
      icon: 'scaling',
      checkCallback: (checking) => {
        const binding = this.registry.active();
        const node = binding?.shapes?.selectedShaped() ?? null;
        if (!binding?.shapes || !node) return false;
        if (!checking) binding.shapes.fitToText(node);
        return true;
      },
    });
    this.addCommand({
      id: 'group-selection',
      name: 'Group the selection',
      icon: 'create-group',
      checkCallback: (checking) => {
        const binding = this.registry.active();
        if (!binding?.tools) return false;
        if (!checking) binding.tools.createGroup();
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
    /* The 0.1.0 id is kept so a hotkey bound to it survives; the panel
       is the Backlinks pane now. */
    this.addCommand({
      id: 'open-canvases-panel',
      name: 'Show canvases for this note',
      icon: 'links-coming-in',
      callback: () => void this.showBacklinks(),
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
    /* Core indexes one canvas per idle callback at startup and reports
       each through `resolve`; the index reads it then, so no canvas waits
       for a sweep. `resolved` fires each time the resolver drains; the
       first one runs a final, non-clearing sweep. */
    this.registerEvent(
      metadataCache.on('resolve', (file) => {
        if (this.index.isCanvasFile(file)) this.index.touch(file.path);
      }),
    );
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

  /* Reveals the core Backlinks pane, where the Canvases section lives. */
  private async showBacklinks(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(BACKLINK_VIEW_TYPE)[0];
    if (existing) {
      await workspace.revealLeaf(existing);
      this.backlinks.sweep();
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice(NO_SIDEBAR);
      return;
    }
    await leaf.setViewState({ type: BACKLINK_VIEW_TYPE, active: true });
    /* With the core Backlinks plugin off the type is unknown and the leaf
       shows a placeholder; the pane is a FileView when it is real. */
    if (!(leaf.view instanceof FileView)) {
      leaf.detach();
      new Notice('Turn on the core backlinks plugin to see the canvases section.');
      return;
    }
    await workspace.revealLeaf(leaf);
    this.backlinks.sweep();
  }
}
