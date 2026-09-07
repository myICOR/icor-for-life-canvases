/* Boxes in canvas units. Pure: no DOM, no Obsidian, so the index parser,
 * the tools and the tests share it. A box is `{minX, minY, maxX, maxY}`,
 * the shape the canvas's own `getBBox()` returns. */
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boxOf(x: number, y: number, width: number, height: number): Box {
  return { minX: x, minY: y, maxX: x + width, maxY: y + height };
}

export function unionBox(boxes: readonly Box[]): Box | null {
  let out: Box | null = null;
  for (const b of boxes) {
    out = out
      ? { minX: Math.min(out.minX, b.minX), minY: Math.min(out.minY, b.minY), maxX: Math.max(out.maxX, b.maxX), maxY: Math.max(out.maxY, b.maxY) }
      : { ...b };
  }
  return out;
}

export function padBox(box: Box, by: number): Box {
  return { minX: box.minX - by, minY: box.minY - by, maxX: box.maxX + by, maxY: box.maxY + by };
}

/* True when `inner` lies wholly inside `outer` (touching edges count). */
export function containsBox(outer: Box, inner: Box): boolean {
  return inner.minX >= outer.minX && inner.minY >= outer.minY && inner.maxX <= outer.maxX && inner.maxY <= outer.maxY;
}

export function boxArea(box: Box): number {
  return Math.max(0, box.maxX - box.minX) * Math.max(0, box.maxY - box.minY);
}
