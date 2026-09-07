/* Opening a note somewhere else than where it was clicked, through the
 * public workspace API only. */
import { Keymap, Notice } from 'obsidian';
import type { App, PaneType, TFile } from 'obsidian';

export async function openInRightSidebar(app: App, file: TFile): Promise<void> {
  const leaf = app.workspace.getRightLeaf(false);
  if (!leaf) {
    new Notice('The right sidebar is not available in this window.');
    return;
  }
  await leaf.openFile(file);
  await app.workspace.revealLeaf(leaf);
}

export async function openInNewTab(app: App, file: TFile): Promise<void> {
  await app.workspace.getLeaf('tab').openFile(file);
}

/* Opens the way Obsidian's own links do: a plain click in the current
   tab, Mod-click in a new tab, Mod-Alt-click in a split, Mod-Alt-Shift
   in a new window. */
export async function openLikeLink(app: App, file: TFile, evt?: MouseEvent | KeyboardEvent): Promise<void> {
  const target: PaneType | boolean = Keymap.isModEvent(evt);
  await app.workspace.getLeaf(target).openFile(file);
}
