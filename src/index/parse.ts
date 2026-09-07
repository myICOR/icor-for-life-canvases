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

/* The groups whose box contains the node's, innermost (smallest) first.
   Touching edges count as inside, as the canvas's own containment does. */
export function containingGroups(node: CanvasNodeData, groups: readonly { node: CanvasNodeData; box: Box }[]): GroupRef[] {
  const box = boxOfNode(node);
  if (!box) return [];
  return groups
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
  const groups: { node: CanvasNodeData; box: Box }[] = [];
  for (const n of nodes) {
    if (n.type !== 'group') continue;
    const box = boxOfNode(n);
    if (box) groups.push({ node: n, box });
  }
  for (const node of nodes) {
    if (node.type !== 'file' || typeof node.file !== 'string' || node.file.length === 0) continue;
    const connections: Connection[] = [];
    for (const edge of edges) {
      if (edge.fromNode === edge.toNode) continue;
      let otherId: string;
      if (edge.fromNode === node.id) otherId = edge.toNode;
      else if (edge.toNode === node.id) otherId = edge.fromNode;
      else continue;
      const otherData = byId.get(otherId);
      if (!otherData) continue;
      const other = otherNode(otherData);
      if (!other) continue;
      const connection: Connection = { direction: direction(edge, node.id), other, edgeId: edge.id };
      if (typeof edge.label === 'string' && edge.label.length > 0) connection.label = edge.label;
      connections.push(connection);
    }
    const list = out.get(node.file) ?? [];
    list.push({ canvasPath, nodeId: node.id, connections, groups: containingGroups(node, groups) });
    out.set(node.file, list);
  }
  return out;
}

export function parseCanvasFile(canvasPath: string, text: string): CanvasPlacements | null {
  const data = parseCanvasJson(text);
  return data ? placementsOf(canvasPath, data) : null;
}
