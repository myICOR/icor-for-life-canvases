/* The ink as data: widths, the colour cycle, the stroke builder that drops
 * points too close to the last one kept, the SVG path a stroke renders as,
 * and the hit test the eraser uses. No DOM, no Obsidian, so the tests load
 * it directly. Coordinates are canvas units throughout. */
import type { InkColor, InkStroke } from './format';
import { INK_COLORS } from './format';

export type InkWidth = 'thin' | 'medium' | 'thick';

export const INK_WIDTHS: readonly InkWidth[] = ['thin', 'medium', 'thick'];

/* Base stroke width per step, in canvas units (pixels at zoom 1). */
export const INK_WIDTH_UNITS: Record<InkWidth, number> = { thin: 2, medium: 4, thick: 8 };

export const INK_COLOR_NAMES: Record<InkColor, string> = {
  '': 'Default',
  '1': 'Red',
  '2': 'Orange',
  '3': 'Yellow',
  '4': 'Green',
  '5': 'Cyan',
  '6': 'Purple',
};

/* Points closer than this to the last kept point are dropped. */
export const MIN_POINT_GAP = 1.5;

export function nextColor(color: InkColor): InkColor {
  const i = INK_COLORS.indexOf(color);
  return INK_COLORS[(i + 1) % INK_COLORS.length] ?? '';
}

export function nextWidth(width: InkWidth): InkWidth {
  const i = INK_WIDTHS.indexOf(width);
  return INK_WIDTHS[(i + 1) % INK_WIDTHS.length] ?? 'medium';
}

/* Pen pressure scales the width lightly: 0.7x at no pressure, 1.3x at full.
   Mouse and trackpad report 0.5 or 0, which lands at 1.0 or is ignored. */
export function pressureScale(average: number): number {
  const p = Math.min(1, Math.max(0, average));
  return Math.round((0.7 + 0.6 * p) * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function newStrokeId(): string {
  let id = '';
  for (let i = 0; i < 16; i++) id += Math.floor(Math.random() * 16).toString(16);
  return id;
}

export class StrokeBuilder {
  readonly points: number[] = [];
  private pressureSum = 0;
  private pressureCount = 0;
  private lastX = 0;
  private lastY = 0;

  /* Returns true when the point was kept. */
  add(x: number, y: number, pressure = 0): boolean {
    const rx = round1(x);
    const ry = round1(y);
    if (this.points.length > 0) {
      const dx = rx - this.lastX;
      const dy = ry - this.lastY;
      if (dx * dx + dy * dy < MIN_POINT_GAP * MIN_POINT_GAP) return false;
    }
    this.points.push(rx, ry);
    this.lastX = rx;
    this.lastY = ry;
    if (pressure > 0) {
      this.pressureSum += pressure;
      this.pressureCount++;
    }
    return true;
  }

  get count(): number {
    return this.points.length / 2;
  }

  /* The finished stroke; `pen` says whether the pressure values came from a
     pen and may scale the width. */
  finish(id: string, color: InkColor, baseWidth: number, pen: boolean): InkStroke {
    let width = baseWidth;
    if (pen && this.pressureCount > 0) width = round1(baseWidth * pressureScale(this.pressureSum / this.pressureCount));
    return { id, color, width, points: [...this.points] };
  }
}

/* A stroke's SVG path: a dot for one point, quadratic curves through the
   midpoints for more, so a freehand line looks drawn rather than jointed. */
export function pathData(points: number[]): string {
  const n = points.length / 2;
  if (n === 0) return '';
  const x0 = points[0] ?? 0;
  const y0 = points[1] ?? 0;
  if (n === 1) return `M${x0} ${y0}l0.01 0`;
  if (n === 2) return `M${x0} ${y0}L${points[2] ?? 0} ${points[3] ?? 0}`;
  let d = `M${x0} ${y0}`;
  for (let i = 1; i < n - 1; i++) {
    const px = points[i * 2] ?? 0;
    const py = points[i * 2 + 1] ?? 0;
    const nx = points[i * 2 + 2] ?? 0;
    const ny = points[i * 2 + 3] ?? 0;
    d += `Q${px} ${py} ${round1((px + nx) / 2)} ${round1((py + ny) / 2)}`;
  }
  d += `L${points[points.length - 2] ?? 0} ${points[points.length - 1] ?? 0}`;
  return d;
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/* True when the point lies within `radius` of any segment of the stroke,
   counting half the stroke's own width on top. */
export function strokeHit(stroke: InkStroke, x: number, y: number, radius: number): boolean {
  const reach = radius + stroke.width / 2;
  const p = stroke.points;
  const n = p.length / 2;
  if (n === 1) return Math.hypot(x - (p[0] ?? 0), y - (p[1] ?? 0)) <= reach;
  for (let i = 0; i < n - 1; i++) {
    if (segmentDistance(x, y, p[i * 2] ?? 0, p[i * 2 + 1] ?? 0, p[i * 2 + 2] ?? 0, p[i * 2 + 3] ?? 0) <= reach) return true;
  }
  return false;
}
