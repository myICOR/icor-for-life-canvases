/* The .canvas file format as this plugin reads and writes it: JSON Canvas
 * (nodes, edges) plus one top-level `metadata` object. Obsidian 1.13.7
 * keeps unknown top-level keys across a load and a save: the canvas's
 * `getData()` spreads the object it loaded and replaces `nodes` and `edges`
 * only, and the view serialises that object. So the ink lives in the file
 * as `metadata.icorCanvases` with no sidecar. This module has no Obsidian
 * import so the tests can load it. */
import { METADATA_KEY, METADATA_VERSION } from '../constants';

export interface CanvasNodeData {
  id: string;
  type?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  file?: string;
  subpath?: string;
  text?: string;
  url?: string;
  label?: string;
}

export interface CanvasEdgeData {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: string;
  toSide?: string;
  /* 'none' or 'arrow'. Absent means 'none' at the start and 'arrow' at the
     end, so a plain edge points from `fromNode` to `toNode`. */
  fromEnd?: string;
  toEnd?: string;
  color?: string;
  label?: string;
}

export interface CanvasFileData {
  nodes?: CanvasNodeData[];
  edges?: CanvasEdgeData[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/* '' is the default ink colour (the text colour); '1' to '6' are the
   canvas palette, rendered through the same --canvas-color-N variables the
   canvas uses for its nodes and edges. */
export type InkColor = '' | '1' | '2' | '3' | '4' | '5' | '6';

export const INK_COLORS: readonly InkColor[] = ['', '1', '2', '3', '4', '5', '6'];

export interface InkStroke {
  id: string;
  color: InkColor;
  /* In canvas units, so it zooms with the content. */
  width: number;
  /* Flat x, y pairs in canvas coordinates. */
  points: number[];
}

export interface InkMetadata {
  version: number;
  strokes: InkStroke[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isColor(v: unknown): v is InkColor {
  return typeof v === 'string' && (INK_COLORS as readonly string[]).includes(v);
}

function readStroke(v: unknown): InkStroke | null {
  if (!isRecord(v)) return null;
  const { id, color, width, points } = v;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return null;
  if (!Array.isArray(points) || points.length < 2 || points.length % 2 !== 0) return null;
  if (!points.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return { id, color: isColor(color) ? color : '', width, points: points as number[] };
}

/* The strokes in a loaded canvas object, or none. Anything malformed is
   dropped stroke by stroke, never the whole set. */
export function readInk(data: unknown): InkStroke[] {
  if (!isRecord(data)) return [];
  const metadata = data.metadata;
  if (!isRecord(metadata)) return [];
  const ink = metadata[METADATA_KEY];
  if (!isRecord(ink)) return [];
  if (typeof ink.version !== 'number' || ink.version > METADATA_VERSION) return [];
  const strokes = ink.strokes;
  if (!Array.isArray(strokes)) return [];
  const out: InkStroke[] = [];
  for (const s of strokes) {
    const stroke = readStroke(s);
    if (stroke) out.push(stroke);
  }
  return out;
}

/* A new top-level object carrying these strokes. Never mutates `data`: the
   canvas's undo history holds the previous object and must not see the new
   strokes (see the persistence section in docs/architecture.md). An empty
   set removes the key, and an empty `metadata` with it. */
export function withInk(data: CanvasFileData, strokes: InkStroke[]): CanvasFileData {
  const metadata: Record<string, unknown> = { ...(isRecord(data.metadata) ? data.metadata : {}) };
  if (strokes.length === 0) {
    delete metadata[METADATA_KEY];
  } else {
    const ink: InkMetadata = { version: METADATA_VERSION, strokes };
    metadata[METADATA_KEY] = ink;
  }
  const out: CanvasFileData = { ...data };
  if (Object.keys(metadata).length === 0) delete out.metadata;
  else out.metadata = metadata;
  return out;
}
