/* Modifier-click on a note card opens the note in the right sidebar. The
 * listeners sit on the view's content element in the capture phase, one
 * level above the canvas wrapper, so they see the press before the
 * canvas's own capture listener does and can stop it; a card that is being
 * edited (focused) is left alone so a modifier-click inside the embedded
 * note keeps working. The press arms, the click opens: a drag between the
 * two is not a click and opens nothing. */
import { Platform } from 'obsidian';
import type { App, TFile } from 'obsidian';
import { nodeFile, nodeFromElement, targetElement } from './internals';
import type { Canvas } from './internals';
import { openInRightSidebar } from '../open';
import type { OpenModifier } from '../settings/model';

export interface OpenHost {
  modifier(): OpenModifier;
  log(message: string): void;
}

export function wantsSidebarOpen(evt: MouseEvent, modifier: OpenModifier, mac = Platform.isMacOS): boolean {
  if (evt.shiftKey) return false;
  if (modifier === 'alt') return evt.altKey && !evt.metaKey && !evt.ctrlKey;
  return mac ? evt.metaKey && !evt.altKey && !evt.ctrlKey : evt.ctrlKey && !evt.altKey && !evt.metaKey;
}

export function wireModifierOpen(app: App, canvas: Canvas, host: OpenHost): () => void {
  const abort = new AbortController();
  const opts = { capture: true, signal: abort.signal };
  const contentEl = canvas.view.contentEl;
  let armed: TFile | null = null;

  contentEl.addEventListener(
    'pointerdown',
    (evt) => {
      armed = null;
      if (evt.button !== 0 || evt.pointerType === 'touch' || !wantsSidebarOpen(evt, host.modifier())) return;
      /* The card's label above it is core's: Mod-click there opens the
         note in a new tab already (1.13.7, onLabelClick). */
      if (targetElement(evt.target)?.closest('.canvas-node-label')) return;
      const node = nodeFromElement(canvas, evt.target);
      const file = nodeFile(node);
      if (!node || !file || node.nodeEl.hasClass('is-focused')) return;
      evt.stopPropagation();
      evt.preventDefault();
      armed = file;
    },
    opts,
  );

  contentEl.addEventListener(
    'click',
    (evt) => {
      const file = armed;
      armed = null;
      if (!file || !wantsSidebarOpen(evt, host.modifier())) return;
      evt.stopPropagation();
      evt.preventDefault();
      host.log(`open in right sidebar: ${file.path}`);
      void openInRightSidebar(app, file);
    },
    opts,
  );

  return () => abort.abort();
}
