/* Canvases inside canvases. "New canvas here" in the canvas's background
 * context menu creates a .canvas file next to the parent, named after it,
 * and places a card pointing at it where the menu was opened; the card
 * renders as the canvas's own canvas-in-canvas embed. Inside a canvas
 * that sits on other canvases, a breadcrumb chip at the top left of the
 * wrapper (untransformed) names each parent; a click opens the parent at
 * this canvas's card. The parents come from the index, which places a
 * canvas file the way it places a note. The menu wrap is on the canvas
 * instance: `onContextMenu` looks `showCreationMenu` up at call time
 * (1.13.7), so the wrap sees every background menu and the Mod-drag
 * menu. */
import { Keymap, Modal, Notice, Setting, setIcon, setTooltip } from 'obsidian';
import type { App, Menu, TFile } from 'obsidian';
import { around } from './internals';
import type { Canvas } from './internals';
import { openCanvasAtNode } from './navigate';
import type { CanvasIndex, Unsubscribe } from '../index/CanvasIndex';
import { basename } from '../index/parse';

export interface NestedHost {
  app: App;
  index: CanvasIndex;
  log(message: string): void;
}

interface Pos {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

const READONLY = 'This canvas is read-only.';
const NO_FILE = 'Save this canvas first, then add a canvas inside it.';

/* A name for the new canvas, with the parent's name pre-filled. */
class NameModal extends Modal {
  private value: string;

  constructor(
    app: App,
    initial: string,
    private readonly onSubmit: (name: string) => void,
  ) {
    super(app);
    this.value = initial;
  }

  override onOpen(): void {
    this.setTitle('New canvas');
    let submitted = false;
    const submit = (): void => {
      const name = this.value.trim();
      if (!name || submitted) return;
      submitted = true;
      this.close();
      this.onSubmit(name);
    };
    new Setting(this.contentEl).setName('Name').addText((text) => {
      text.setValue(this.value).onChange((v) => {
        this.value = v;
      });
      text.inputEl.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter') {
          evt.preventDefault();
          submit();
        }
      });
      text.inputEl.select();
    });
    new Setting(this.contentEl).addButton((button) => button.setButtonText('Create').setCta().onClick(submit));
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}

/* The first free "<parent> - n" in the parent's folder. */
export function childName(parentBasename: string, taken: (name: string) => boolean): string {
  for (let n = 1; n < 10000; n++) {
    const name = `${parentBasename} - ${n}`;
    if (!taken(name)) return name;
  }
  return `${parentBasename} - ${Date.now()}`;
}

export class NestedCanvases {
  private restore: (() => void) | null = null;
  private unsubscribe: Unsubscribe | null = null;
  private readonly chip: HTMLElement;
  private readonly abort = new AbortController();
  /* Null until the first render, so an empty first set still hides the chip. */
  private renderedKey: string | null = null;

  constructor(
    private readonly canvas: Canvas,
    private readonly host: NestedHost,
  ) {
    this.chip = createDiv({ cls: 'icor-canvases-breadcrumb' });
  }

  attach(): void {
    const canvas = this.canvas;
    const addItems = (menu: Menu, pos: Pos, size?: Size): void => this.addItems(menu, pos, size);
    this.restore = around(canvas, 'showCreationMenu', (original) => {
      return function (this: Canvas, menu: Menu, pos: Pos, size?: Size) {
        original.call(this, menu, pos, size);
        addItems(menu, pos, size);
      };
    });
    /* A press on the chip is not a press on the canvas. */
    for (const type of ['pointerdown', 'click', 'dblclick', 'contextmenu'] as const) {
      this.chip.addEventListener(type, (evt) => evt.stopPropagation(), { signal: this.abort.signal });
    }
    this.unsubscribe = this.host.index.subscribe(() => this.render());
    this.render();
  }

  /* The parents of the canvas this view shows now. DOM changes only when
     the set of parents changed. */
  render(): void {
    const { canvas, chip, host } = this;
    if (chip.parentElement !== canvas.wrapperEl) canvas.wrapperEl.appendChild(chip);
    const file = canvas.view.file;
    const placements = file ? host.index.placementsFor(file.path) : [];
    const key = placements.map((p) => `${p.canvasPath}#${p.nodeId}`).join('|');
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    chip.empty();
    chip.toggle(placements.length > 0);
    for (const placement of placements) {
      const item = chip.createDiv({ cls: 'icor-canvases-breadcrumb-item', attr: { role: 'button', tabindex: '0' } });
      setIcon(item.createSpan({ cls: 'icor-canvases-breadcrumb-icon' }), 'corner-left-up');
      item.createSpan({ cls: 'icor-canvases-breadcrumb-text', text: `in ${basename(placement.canvasPath)}` });
      setTooltip(item, 'Open the parent canvas at this canvas’s card. Mod-click for a new tab.');
      const go = (evt: MouseEvent | KeyboardEvent): void => {
        void openCanvasAtNode(host.app, placement.canvasPath, placement.nodeId, Keymap.isModEvent(evt) !== false);
      };
      item.addEventListener('click', go, { signal: this.abort.signal });
      item.addEventListener(
        'keydown',
        (evt) => {
          if (evt.key === 'Enter' || evt.key === ' ') {
            evt.preventDefault();
            go(evt);
          }
        },
        { signal: this.abort.signal },
      );
    }
  }

  dispose(): void {
    this.abort.abort();
    this.unsubscribe?.();
    this.restore?.();
    this.restore = null;
    this.chip.detach();
  }

  private addItems(menu: Menu, pos: Pos, size?: Size): void {
    menu.addItem((item) =>
      item
        .setSection('create')
        .setTitle('New canvas here')
        .setIcon('layout-dashboard')
        .onClick(() => this.newCanvasHere(pos, size)),
    );
  }

  private newCanvasHere(pos: Pos, size?: Size): void {
    const { canvas, host } = this;
    if (canvas.readonly) {
      new Notice(READONLY);
      return;
    }
    const parent = canvas.view.file;
    if (!parent) {
      new Notice(NO_FILE);
      return;
    }
    const folder = parent.parent?.path ?? '';
    const prefix = folder && folder !== '/' ? `${folder}/` : '';
    const pathFor = (name: string): string => `${prefix}${name}.canvas`;
    const taken = (name: string): boolean => host.app.vault.getAbstractFileByPath(pathFor(name)) !== null;
    new NameModal(host.app, childName(parent.basename, taken), (name) => {
      void this.create(pathFor(name), pos, size);
    }).open();
  }

  private async create(path: string, pos: Pos, size?: Size): Promise<void> {
    const { canvas, host } = this;
    if (host.app.vault.getAbstractFileByPath(path)) {
      new Notice(`A file named ${basename(path)} is already there.`);
      return;
    }
    let file: TFile;
    try {
      /* An empty file, as the canvas's own "Create new canvas" writes. */
      file = await host.app.vault.create(path, '');
    } catch (error) {
      new Notice(`Could not create the canvas: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    canvas.createFileNode({ pos, size, file, save: true, focus: true });
    host.log(`nested canvas created: ${path}`);
  }
}
