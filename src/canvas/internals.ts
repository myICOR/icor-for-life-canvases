/* The one door to Obsidian's private canvas API. Every name here was read
 * in the 1.13.7 bundle (docs/architecture.md lists each with where it was
 * found) and none of them is in obsidian.d.ts, so every use goes through
 * a runtime guard: a feature asks `requireCanvas` for the members it needs
 * and switches itself off, with a Notice and a console line, when one is
 * missing. Nothing outside this file names a private member without a
 * guard having passed first. */
import { TFile } from 'obsidian';
import type { Menu, View } from 'obsidian';
import type { CanvasEdgeData, CanvasFileData, CanvasNodeData } from './format';
import { degrade } from '../log';

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CanvasNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nodeEl: HTMLElement;
  getBBox(): BBox;
  getData(): CanvasNodeData;
}

/* A file node carries `file` (a TFile once resolved, null before) and the
   path it was written with. */
export interface CanvasFileNode extends CanvasNode {
  file: TFile | null;
  filePath: string;
}

export interface CanvasEdge {
  id: string;
  from: { node: CanvasNode; side?: string; end?: string };
  to: { node: CanvasNode; side?: string; end?: string };
  label?: string;
  getBBox(): BBox;
  getData(): CanvasEdgeData;
}

/* The selection holds nodes and edges alike; an edge selected on its own
   shows as focused (1.13.7, edge.select adds is-focused to its paths). */
export type CanvasSelectable = CanvasNode | CanvasEdge;

/* The floating toolbar core draws above the selection (class `n7` in
   1.13.7): `render(rebuild)` runs from the frame loop on every selection
   change with `rebuild` true, and on viewport changes with it false. */
export interface CanvasMenu {
  menuEl: HTMLElement;
  render(rebuild?: boolean): void;
}

export interface Canvas {
  nodes: Map<string, CanvasNode>;
  edges: Map<string, CanvasEdge>;
  selection: Set<CanvasSelectable>;
  /* The object the file was loaded from, replaced on every save. */
  data: CanvasFileData;
  readonly: boolean;
  wrapperEl: HTMLElement;
  canvasEl: HTMLElement;
  view: CanvasView;
  x: number;
  y: number;
  zoom: number;
  tx: number;
  ty: number;
  tZoom: number;
  /* The linear zoom factor; `zoom` is its log2. */
  scale?: number;
  getData(): CanvasFileData;
  setData(data: CanvasFileData): void;
  importData(data: CanvasFileData, clear?: boolean): unknown;
  applyHistory?(data: CanvasFileData): void;
  requestSave(pushHistory?: boolean): void;
  requestFrame(): void;
  posFromEvt(evt: { clientX: number; clientY: number }): { x: number; y: number };
  zoomToBbox(bbox: BBox): void;
  select(item: CanvasSelectable): void;
  selectOnly(item: CanvasSelectable): void;
  zoomToSelection(): void;
  deselectAll(): void;
  addNode(node: CanvasNode): void;
  panBy(dx: number, dy: number): void;
  /* The items of the background context menu (and of the Mod-drag menu),
     built into a public Menu; `size` is set when a box was dragged. */
  showCreationMenu(menu: Menu, pos: { x: number; y: number }, size?: { width: number; height: number }): void;
  createFileNode(options: { pos: { x: number; y: number }; size?: { width: number; height: number }; file: TFile; subpath?: string; save?: boolean; focus?: boolean }): CanvasNode;
  createGroupNode(options: { pos: { x: number; y: number }; size?: { width: number; height: number }; label?: string; save?: boolean; focus?: boolean }): CanvasNode;
  menu?: CanvasMenu;
}

export interface CanvasView extends View {
  canvas: Canvas;
  file: TFile | null;
  contentEl: HTMLElement;
}

type MemberKind = 'function' | 'element' | 'map' | 'set' | 'object' | 'boolean';

/* Cross-window: a canvas in a pop-out window has elements of that
   window's classes, which a plain `instanceof` here would not see.
   Obsidian's `instanceOf` on Node checks by name across windows. */
export function isHtmlElement(value: unknown): value is HTMLElement {
  if (typeof value !== 'object' || value === null) return false;
  const node = value as Partial<Node>;
  return typeof node.instanceOf === 'function' && node.instanceOf(HTMLElement);
}

/* The element an event landed on, whatever window it came from. */
export function targetElement(target: EventTarget | null): Element | null {
  if (typeof target !== 'object' || target === null) return null;
  const node = target as Partial<Node>;
  if (typeof node.instanceOf !== 'function') return null;
  if (node.instanceOf(Element)) return node;
  return node.instanceOf(Node) ? node.parentElement : null;
}

const MEMBERS: Record<string, MemberKind> = {
  nodes: 'map',
  edges: 'map',
  selection: 'set',
  data: 'object',
  readonly: 'boolean',
  wrapperEl: 'element',
  canvasEl: 'element',
  view: 'object',
  getData: 'function',
  setData: 'function',
  importData: 'function',
  applyHistory: 'function',
  requestSave: 'function',
  requestFrame: 'function',
  posFromEvt: 'function',
  zoomToBbox: 'function',
  select: 'function',
  selectOnly: 'function',
  zoomToSelection: 'function',
  deselectAll: 'function',
  addNode: 'function',
  panBy: 'function',
  showCreationMenu: 'function',
  createFileNode: 'function',
  createGroupNode: 'function',
  menu: 'object',
};

export type CanvasMember = keyof typeof MEMBERS;

function hasKind(value: unknown, kind: MemberKind): boolean {
  switch (kind) {
    case 'function':
      return typeof value === 'function';
    case 'element':
      return isHtmlElement(value);
    case 'map':
      return value instanceof Map;
    case 'set':
      return value instanceof Set;
    case 'object':
      return typeof value === 'object' && value !== null;
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return false;
  }
}

/* The members of `members` that this canvas object does not have in the
   shape the plugin expects. */
export function missingMembers(canvas: unknown, members: readonly CanvasMember[]): string[] {
  if (typeof canvas !== 'object' || canvas === null) return [...members];
  const record = canvas as Record<string, unknown>;
  return members.filter((m) => !hasKind(record[m], MEMBERS[m] ?? 'object'));
}

/* True when every member is there; otherwise the feature degrades once and
   the caller stays off. */
export function requireCanvas(canvas: unknown, members: readonly CanvasMember[], feature: string): canvas is Canvas {
  const missing = missingMembers(canvas, members);
  if (missing.length === 0) return true;
  degrade(`${feature}: canvas.${missing.join(', canvas.')}`);
  return false;
}

export const CANVAS_VIEW_TYPE = 'canvas';

/* A canvas view is the view of type 'canvas' that carries a `canvas`
   object with the two elements every feature starts from. */
export function asCanvasView(view: View | null | undefined): CanvasView | null {
  if (!view || view.getViewType() !== CANVAS_VIEW_TYPE) return null;
  const canvas = (view as Partial<CanvasView>).canvas;
  if (missingMembers(canvas, ['nodes', 'wrapperEl', 'canvasEl', 'data']).length > 0) return null;
  return view as CanvasView;
}

export function isEdge(item: CanvasSelectable | null | undefined): item is CanvasEdge {
  if (!item) return false;
  const e = item as Partial<CanvasEdge>;
  return typeof e.from === 'object' && e.from !== null && typeof e.to === 'object' && e.to !== null && typeof e.getBBox === 'function';
}

/* A text card: it carries `text` and nothing that a file or link card
   carries. */
export function isTextNode(node: CanvasNode | null | undefined): boolean {
  if (!node) return false;
  const n = node as Partial<CanvasNode> & { text?: unknown; filePath?: unknown; url?: unknown };
  return typeof n.text === 'string' && typeof n.filePath !== 'string' && typeof n.url !== 'string';
}

export function isGroupNode(node: CanvasNode | null | undefined): boolean {
  if (!node) return false;
  const n = node as Partial<CanvasNode> & { label?: unknown; bgPath?: unknown };
  return typeof n.label === 'string' && 'bgPath' in n;
}

/* The selection toolbar, when it has the shape the plugin wraps. */
export function selectionMenu(canvas: Canvas): CanvasMenu | null {
  const menu = canvas.menu;
  if (!menu || !isHtmlElement(menu.menuEl) || typeof menu.render !== 'function') return null;
  return menu;
}

export function isFileNode(node: CanvasNode | null | undefined): node is CanvasFileNode {
  if (!node) return false;
  const n = node as Partial<CanvasFileNode>;
  return typeof n.filePath === 'string' && 'file' in n;
}

export function nodeFile(node: CanvasNode | null | undefined): TFile | null {
  return isFileNode(node) && node.file instanceof TFile ? node.file : null;
}

/* The node whose element contains `target`, found through the canvas's
   own node map rather than a data attribute the canvas does not set. */
export function nodeFromElement(canvas: Canvas, target: EventTarget | null): CanvasNode | null {
  const nodeEl = targetElement(target)?.closest('.canvas-node');
  if (!nodeEl) return null;
  for (const node of canvas.nodes.values()) {
    if (node.nodeEl === nodeEl) return node;
  }
  return null;
}

/* Wraps a method on one object, own property over the prototype's, and
   returns the undo. The undo restores only while the wrapper is still the
   one installed, so another plugin's later patch of the same method is not
   torn out from under it. */
export function around<T extends object, K extends keyof T & string>(target: T, name: K, wrap: (original: T[K]) => T[K]): () => void {
  const record = target as unknown as Record<string, unknown>;
  const original = record[name];
  const own = Object.prototype.hasOwnProperty.call(record, name);
  const wrapped = wrap(original as T[K]);
  record[name] = wrapped;
  return () => {
    if (record[name] !== wrapped) return;
    if (own) record[name] = original;
    else delete record[name];
  };
}

/* Not used, on purpose: the bundle also triggers `canvas:node-menu`,
   `canvas:edge-menu` and `canvas:selection-menu`, none of them in
   obsidian.d.ts. A note card's menu fires the public `file-menu` event with
   source 'canvas-menu' as well, which is what src/main.ts listens to. */
