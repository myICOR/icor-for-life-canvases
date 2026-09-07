/* Opening a canvas at one of its nodes, or at one of its edges: open the
 * file, wait for the canvas to have the node, then select and zoom. The
 * wait is a frame loop with a budget, not a timer, because the canvas
 * builds its nodes in `setData` right after the file loads and fits the
 * viewport on its next resize; the second pass a few frames later wins
 * over that fit. */
import { Notice } from 'obsidian';
import type { App, WorkspaceLeaf } from 'obsidian';
import { padBox, unionBox } from './geometry';
import { asCanvasView, isEdge, requireCanvas } from './internals';
import type { Canvas, CanvasNode } from './internals';

const FRAME_BUDGET = 180;
const SETTLE_FRAMES = 6;
/* Around an edge and its two cards, in canvas units. */
const EDGE_MARGIN = 40;

function nextFrame(win: Window): Promise<void> {
  return new Promise((resolve) => win.requestAnimationFrame(() => resolve()));
}

function focusNode(canvas: Canvas, node: CanvasNode): void {
  canvas.selectOnly(node);
  canvas.zoomToSelection();
}

/* Selects the edge (it shows as focused) and fits both of its cards. Falls
   back to the card when the edge is gone. */
function focusEdge(canvas: Canvas, node: CanvasNode, edgeId: string): void {
  const edge = canvas.edges.get(edgeId);
  if (!isEdge(edge)) {
    focusNode(canvas, node);
    return;
  }
  const box = unionBox([edge.from.node.getBBox(), edge.to.node.getBBox()]);
  canvas.selectOnly(edge);
  if (box) canvas.zoomToBbox(padBox(box, EDGE_MARGIN));
  else canvas.zoomToSelection();
}

/* The leaf already showing this canvas in the main area, if any. */
function leafShowing(app: App, canvasPath: string): WorkspaceLeaf | null {
  let found: WorkspaceLeaf | null = null;
  for (const leaf of app.workspace.getLeavesOfType('canvas')) {
    const view = asCanvasView(leaf.view);
    if (view?.file?.path === canvasPath && leaf.getRoot() === app.workspace.rootSplit) {
      found = leaf;
      break;
    }
  }
  return found;
}

async function openCanvasAnd(app: App, canvasPath: string, nodeId: string, newTab: boolean, focus: (canvas: Canvas, node: CanvasNode) => void): Promise<boolean> {
  const file = app.vault.getFileByPath(canvasPath);
  if (!file) {
    new Notice(`Canvas not found: ${canvasPath}`);
    return false;
  }
  let leaf = newTab ? null : leafShowing(app, canvasPath);
  if (leaf) {
    await app.workspace.revealLeaf(leaf);
    app.workspace.setActiveLeaf(leaf, { focus: true });
  } else {
    leaf = app.workspace.getLeaf(newTab ? 'tab' : false);
    /* The canvas view's ephemeral state accepts a search-style match on a
       node id and selects and pans to it on open (1.13.7,
       setEphemeralState); the pass below adds the zoom. `content` and
       `matches` are read there and must exist. */
    await leaf.openFile(file, { eState: { match: { nodeId, content: '', matches: [] } } });
  }
  const win = leaf.view.containerEl.win;
  for (let frame = 0; frame < FRAME_BUDGET; frame++) {
    const view = asCanvasView(leaf.view);
    const canvas = view?.canvas;
    const node = canvas?.nodes.get(nodeId);
    if (canvas && node) {
      if (!requireCanvas(canvas, ['edges', 'selectOnly', 'zoomToSelection', 'zoomToBbox'], 'Zoom to a card')) return false;
      focus(canvas, node);
      for (let i = 0; i < SETTLE_FRAMES; i++) await nextFrame(win);
      if (canvas.nodes.get(nodeId) === node) focus(canvas, node);
      return true;
    }
    await nextFrame(win);
  }
  new Notice('The card is no longer on this canvas.');
  return false;
}

export function openCanvasAtNode(app: App, canvasPath: string, nodeId: string, newTab: boolean): Promise<boolean> {
  return openCanvasAnd(app, canvasPath, nodeId, newTab, focusNode);
}

/* `nodeId` is the card at this note's end of the edge: the ephemeral state
   lands there first, then the edge and both cards come into view. */
export function openCanvasAtEdge(app: App, canvasPath: string, nodeId: string, edgeId: string, newTab: boolean): Promise<boolean> {
  return openCanvasAnd(app, canvasPath, nodeId, newTab, (canvas, node) => focusEdge(canvas, node, edgeId));
}
