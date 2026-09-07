/* The rows both surfaces share: one block per canvas the note is on, the
 * canvas name on top (click opens the canvas at the card; Mod-click in a
 * new tab), and one row per connection under it: a direction glyph, the
 * other card's title, the edge label in a muted span. A click on a
 * connection row opens the canvas at that connection: the edge selected
 * and both of its cards in view. Mod-click keeps the other end's own
 * meaning: a note opens in a new tab, any other card opens the canvas at
 * that card in a new tab. */
import { Keymap, Notice, setIcon, setTooltip } from 'obsidian';
import type { App } from 'obsidian';
import { openCanvasAtEdge, openCanvasAtNode } from '../canvas/navigate';
import type { Connection, Direction, Placement } from '../index/parse';
import { basename, otherTitle } from '../index/parse';
import { openLikeLink } from '../open';

export const DIRECTION_ICONS: Record<Direction, string> = {
  out: 'arrow-right',
  in: 'arrow-left',
  both: 'arrow-left-right',
  none: 'minus',
};

export const DIRECTION_LABELS: Record<Direction, string> = {
  out: 'Points to',
  in: 'Pointed at by',
  both: 'Both ways',
  none: 'Connected, no arrow',
};

export const OTHER_ICONS: Record<Connection['other']['kind'], string> = {
  file: 'file-text',
  text: 'sticky-note',
  link: 'globe',
  group: 'square-dashed',
};

function actionable(el: HTMLElement, onActivate: (evt: MouseEvent | KeyboardEvent) => void): void {
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.addEventListener('click', (evt) => onActivate(evt));
  el.addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault();
      onActivate(evt);
    }
  });
}

function openConnection(app: App, placement: Placement, connection: Connection, evt: MouseEvent | KeyboardEvent): void {
  const { other } = connection;
  if (Keymap.isModEvent(evt) === false) {
    void openCanvasAtEdge(app, placement.canvasPath, placement.nodeId, connection.edgeId, false);
    return;
  }
  if (other.kind === 'file' && other.file) {
    const file = app.vault.getFileByPath(other.file);
    if (!file) {
      new Notice(`Note not found: ${other.file}`);
      return;
    }
    void openLikeLink(app, file, evt);
    return;
  }
  void openCanvasAtNode(app, placement.canvasPath, other.nodeId, true);
}

export function renderPlacements(app: App, container: HTMLElement, placements: Placement[]): void {
  for (const placement of placements) {
    const block = container.createDiv({ cls: 'icor-canvases-canvas' });
    const title = block.createDiv({ cls: 'icor-canvases-canvas-title' });
    setIcon(title.createSpan({ cls: 'icor-canvases-canvas-icon' }), 'map');
    title.createSpan({ cls: 'icor-canvases-canvas-name', text: basename(placement.canvasPath) });
    setTooltip(title, 'Open the canvas at this card');
    actionable(title, (evt) => void openCanvasAtNode(app, placement.canvasPath, placement.nodeId, Keymap.isModEvent(evt) !== false));
    const rows = block.createDiv({ cls: 'icor-canvases-rows' });
    if (placement.connections.length === 0) {
      rows.createDiv({ cls: ['icor-canvases-row', 'is-empty'], text: 'No connections' });
      continue;
    }
    for (const connection of placement.connections) {
      const row = rows.createDiv({ cls: 'icor-canvases-row' });
      const direction = row.createSpan({ cls: ['icor-canvases-row-direction', `is-${connection.direction}`] });
      setIcon(direction, DIRECTION_ICONS[connection.direction]);
      setTooltip(direction, DIRECTION_LABELS[connection.direction]);
      const kind = row.createSpan({ cls: 'icor-canvases-row-kind' });
      setIcon(kind, OTHER_ICONS[connection.other.kind]);
      row.createSpan({ cls: 'icor-canvases-row-title', text: otherTitle(connection.other) });
      if (connection.label) row.createSpan({ cls: 'icor-canvases-row-label', text: connection.label });
      setTooltip(row, connection.other.kind === 'file' ? 'Show this connection on the canvas. Mod-click opens the note in a new tab.' : 'Show this connection on the canvas');
      actionable(row, (evt) => openConnection(app, placement, connection, evt));
    }
  }
}
