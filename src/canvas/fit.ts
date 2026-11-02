/* Zoom to fit that takes the ink in. Core's `zoomToFit` measures the cards
 * only, and the strokes live in `metadata.icorCanvases`, where it never
 * looks. Pure, so the tests drive it: no DOM, no Obsidian, types only from
 * the internals. With no stroke, or a build with no `zoomToBbox`, core fits
 * as it always did. */
import { readInk } from './format';
import type { InkStroke } from './format';
import { padBox, unionBox } from './geometry';
import type { Box } from './geometry';
import type { Canvas } from './internals';

/* Room around the content, in canvas units; the margin navigate.ts leaves. */
export const FIT_MARGIN = 40;

/* The stroke's points, plus half the pen width on every side. */
export function strokeBox(stroke: Pick<InkStroke, 'points' | 'width'>): Box | null {
  const { points, width } = stroke;
  if (points.length < 2) return null;
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i] ?? 0;
    const y = points[i + 1] ?? 0;
    box.minX = Math.min(box.minX, x);
    box.minY = Math.min(box.minY, y);
    box.maxX = Math.max(box.maxX, x);
    box.maxY = Math.max(box.maxY, y);
  }
  return padBox(box, width / 2);
}

export function contentBox(nodes: readonly Box[], strokes: readonly Pick<InkStroke, 'points' | 'width'>[]): Box | null {
  const inked = strokes.map(strokeBox).filter((b): b is Box => b !== null);
  return unionBox([...nodes, ...inked]);
}

/* The box to fit, or null when core's own fit is the right one. */
export function inkFitBox(nodes: readonly Box[], strokes: readonly Pick<InkStroke, 'points' | 'width'>[]): Box | null {
  if (strokes.length === 0) return null;
  const box = contentBox(nodes, strokes);
  return box && padBox(box, FIT_MARGIN);
}

export function fitWithInk(canvas: Pick<Canvas, 'nodes' | 'data' | 'zoomToBbox'>, native: () => void): void {
  const box = typeof canvas.zoomToBbox === 'function'
    ? inkFitBox([...canvas.nodes.values()].map((n) => n.getBBox()), readInk(canvas.data))
    : null;
  if (box) canvas.zoomToBbox(box);
  else native();
}
