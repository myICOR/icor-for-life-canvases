/* One .canvas file read into placements: for every note on it, where the
 * note sits and what its node is connected to. Pure: a path and the file
 * text in, a map out. The direction of a connection is read the way the
 * canvas draws it: `fromEnd` defaults to 'none' and `toEnd` to 'arrow', so
 * a plain edge points from `fromNode` to `toNode`. */
import type { CanvasEdgeData, CanvasFileData, CanvasNodeData } from '../canvas/format';
import { boxArea, boxOf, containsBox } from '../canvas/geometry';
import type { Box } from '../canvas/geometry';

export type Direction = 'out' | 'in' | 'both' | 'none';

export type OtherKind = 'file' | 'text' | 'link' | 'group';

export interface OtherNode {
  kind: OtherKind;
  nodeId: string;
  file?: string;
  text?: string;
  url?: string;
  label?: string;
}

export interface Connection {
  direction: Direction;
  other: OtherNode;
  label?: string;
  edgeId: string;
}

/* A group whose box wholly contains the card's box. */
export interface GroupRef {
  nodeId: string;
  /* Empty when the group has no label. */
  label: string;
}

export interface Placement {
  canvasPath: string;
  nodeId: string;
  connections: Connection[];
  /* Innermost first: the smallest containing group leads. */
  groups: GroupRef[];
}

/* Note path (as written in the canvas) to its placements on this canvas. */
export type CanvasPlacements = Map<string, Placement[]>;

const KINDS: readonly OtherKind[] = ['file', 'text', 'link', 'group'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNode(v: unknown): v is CanvasNodeData {
  return isRecord(v) && typeof v.id === 'string' && typeof v.type === 'string';
}

function isEdge(v: unknown): v is CanvasEdgeData {
  return isRecord(v) && typeof v.id === 'string' && typeof v.fromNode === 'string' && typeof v.toNode === 'string';
}

function arrowAt(end: unknown, fallback: boolean): boolean {
  if (end === 'arrow') return true;
  if (end === 'none') return false;
  return fallback;
}

/* The direction of an edge as seen from `nodeId`, which is one of its two
   ends. */
export function direction(edge: CanvasEdgeData, nodeId: string): Direction {
  const arrowFrom = arrowAt(edge.fromEnd, false);
  const arrowTo = arrowAt(edge.toEnd, true);
  const away = edge.fromNode === nodeId ? arrowTo : arrowFrom;
  const toward = edge.fromNode === nodeId ? arrowFrom : arrowTo;
  if (away && toward) return 'both';
  if (away) return 'out';
  if (toward) return 'in';
  return 'none';
}

export function otherNode(node: CanvasNodeData): OtherNode | null {
  const kind = node.type;
  if (!kind || !(KINDS as readonly string[]).includes(kind)) return null;
  const other: OtherNode = { kind: kind as OtherKind, nodeId: node.id };
  if (typeof node.file === 'string') other.file = node.file;
  if (typeof node.text === 'string') other.text = node.text;
  if (typeof node.url === 'string') other.url = node.url;
  if (typeof node.label === 'string') other.label = node.label;
  return other;
}

/* The first line of a text node with the markdown markers that would only
   be noise in a one-line title stripped, cut to `max` characters. */
export function firstLine(text: string, max = 60): string {
  const line = text
    .split('\n')
    .map((l) => l.replace(/^\s*(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+|>\s+)/, '').replace(/[*_`~]/g, '').trim())
    .find((l) => l.length > 0) ?? '';
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1).trimEnd()}…`;
}

export function basename(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/* The row title for the other end of a connection. */
export function otherTitle(other: OtherNode): string {
  switch (other.kind) {
    case 'file':
      return other.file ? basename(other.file) : 'File';
    case 'text':
      return other.text ? firstLine(other.text) || 'Text' : 'Text';
    case 'link':
      return other.url ?? 'Link';
    case 'group':
      return other.label ?? 'Group';
    default:
      return '';
  }
}

export function parseCanvasJson(text: string): CanvasFileData | null {
  try {
    const data: unknown = JSON.parse(text);
    return isRecord(data) ? data : null;
  } catch {
    return null;
  }
}

function boxOfNode(node: CanvasNodeData): Box | null {
  const { x, y, width, height } = node;
  if (![x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return boxOf(x, y, width, height);
}

export const UNNAMED_GROUP = 'unnamed group';

interface GroupBox {
  node: CanvasNodeData;
  box: Box;
}

/* Groups bucketed on a coarse grid so a card tests only the groups whose
   box covers its cell; a group spanning more cells than the cap goes
   into a list every card tests. Linear in cards for a real canvas. */
const CELL = 1000;
const CELL_CAP = 256;

export class GroupGrid {
  private readonly cells = new Map<string, GroupBox[]>();
  private readonly wide: GroupBox[] = [];

  constructor(groups: readonly GroupBox[]) {
    for (const g of groups) {
      const x0 = Math.floor(g.box.minX / CELL);
      const x1 = Math.floor(g.box.maxX / CELL);
      const y0 = Math.floor(g.box.minY / CELL);
      const y1 = Math.floor(g.box.maxY / CELL);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > CELL_CAP) {
        this.wide.push(g);
        continue;
      }
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const key = `${x},${y}`;
          const list = this.cells.get(key) ?? [];
          list.push(g);
          this.cells.set(key, list);
        }
      }
    }
  }

  /* The candidates for a box: the groups over the cell of its top-left
     corner (a containing group covers that cell too) and the wide ones. */
  candidates(box: Box): GroupBox[] {
    const local = this.cells.get(`${Math.floor(box.minX / CELL)},${Math.floor(box.minY / CELL)}`);
    if (!local) return this.wide;
    return this.wide.length ? [...local, ...this.wide] : local;
  }
}

/* The groups whose box contains the node's, innermost (smallest) first.
   Touching edges count as inside, as the canvas's own containment does. */
export function containingGroups(node: CanvasNodeData, groups: readonly GroupBox[] | GroupGrid): GroupRef[] {
  const box = boxOfNode(node);
  if (!box) return [];
  const candidates = groups instanceof GroupGrid ? groups.candidates(box) : groups;
  return candidates
    .filter((g) => g.node.id !== node.id && containsBox(g.box, box))
    .sort((a, b) => boxArea(a.box) - boxArea(b.box))
    .map((g) => ({ nodeId: g.node.id, label: typeof g.node.label === 'string' ? g.node.label.trim() : '' }));
}

/* Every file node on the canvas, with its connections and the groups
   around it, keyed by the file path the node names. A file that appears
   twice yields two placements. An edge from a node to itself is not a
   connection. A card that points at another canvas is a placement of
   that canvas, which is how a nested canvas finds its parents. */
export function placementsOf(canvasPath: string, data: CanvasFileData): CanvasPlacements {
  const out: CanvasPlacements = new Map();
  const nodes = Array.isArray(data.nodes) ? data.nodes.filter(isNode) : [];
  const edges = Array.isArray(data.edges) ? data.edges.filter(isEdge) : [];
  const byId = new Map<string, CanvasNodeData>();
  for (const n of nodes) byId.set(n.id, n);
  const groups: GroupBox[] = [];
  for (const n of nodes) {
    if (n.type !== 'group') continue;
    const box = boxOfNode(n);
    if (box) groups.push({ node: n, box });
  }
  const grid = new GroupGrid(groups);
  /* Edges indexed by node once, so the parse is linear in cards plus
     edges (Vex: the per-card scan of every edge froze the UI on a
     20k-card, 50k-edge file). */
  const edgesByNode = new Map<string, CanvasEdgeData[]>();
  for (const edge of edges) {
    if (edge.fromNode === edge.toNode) continue;
    for (const id of [edge.fromNode, edge.toNode]) {
      const list = edgesByNode.get(id) ?? [];
      list.push(edge);
      edgesByNode.set(id, list);
    }
  }
  for (const node of nodes) {
    if (node.type !== 'file' || typeof node.file !== 'string' || node.file.length === 0) continue;
    const connections: Connection[] = [];
    for (const edge of edgesByNode.get(node.id) ?? []) {
      const otherId = edge.fromNode === node.id ? edge.toNode : edge.fromNode;
      const otherData = byId.get(otherId);
      if (!otherData) continue;
      const other = otherNode(otherData);
      if (!other) continue;
      const connection: Connection = { direction: direction(edge, node.id), other, edgeId: edge.id };
      if (typeof edge.label === 'string' && edge.label.length > 0) connection.label = edge.label;
      connections.push(connection);
    }
    const list = out.get(node.file) ?? [];
    list.push({ canvasPath, nodeId: node.id, connections, groups: containingGroups(node, grid) });
    out.set(node.file, list);
  }
  return out;
}

export function parseCanvasFile(canvasPath: string, text: string): CanvasPlacements | null {
  const data = parseCanvasJson(text);
  return data ? placementsOf(canvasPath, data) : null;
}
