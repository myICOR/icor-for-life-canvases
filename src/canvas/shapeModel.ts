/* A text card's shape and colours as data. They live on the node's own
 * data as `icorShape: string` and `icorStyle: { fill?, text? }`, which
 * the canvas keeps in the node's unknown keys across a load and a save
 * (1.13.7: node.setData keeps every key it does not know in
 * `unknownData`, node.getData spreads them back). Pure: no DOM, no
 * Obsidian. */

export type Shape = 'card' | 'rectangle' | 'rounded' | 'ellipse' | 'circle' | 'diamond' | 'triangle' | 'parallelogram' | 'bubble' | 'star';

export const SHAPES: readonly Shape[] = ['card', 'rectangle', 'rounded', 'ellipse', 'circle', 'diamond', 'triangle', 'parallelogram', 'bubble', 'star'];

export const SHAPE_LABELS: Readonly<Record<Shape, string>> = {
  card: 'Card (default)',
  rectangle: 'Rectangle',
  rounded: 'Rounded rectangle',
  ellipse: 'Ellipse',
  circle: 'Circle',
  diamond: 'Diamond',
  triangle: 'Triangle',
  parallelogram: 'Parallelogram',
  bubble: 'Speech bubble',
  star: 'Star',
};

/* Every shape but the plain card, the rectangle and the rounded
   rectangle is drawn as SVG geometry in a 0 to 100 box that stretches to
   the card (preserveAspectRatio none), with fill and a non-scaling
   stroke; no clip-path anywhere (Obsidian's scanner flags it). The two
   box shapes are a CSS box. */
export const SVG_SHAPES: readonly Shape[] = ['ellipse', 'circle', 'diamond', 'triangle', 'parallelogram', 'bubble', 'star'];

export type ShapeGeometry = { kind: 'ellipse' } | { kind: 'polygon'; points: string } | { kind: 'path'; d: string };

export const GEOMETRY: Readonly<Record<string, ShapeGeometry>> = {
  ellipse: { kind: 'ellipse' },
  circle: { kind: 'ellipse' },
  diamond: { kind: 'polygon', points: '50,0 100,50 50,100 0,50' },
  triangle: { kind: 'polygon', points: '50,0 100,100 0,100' },
  parallelogram: { kind: 'polygon', points: '20,0 100,0 80,100 0,100' },
  bubble: { kind: 'path', d: 'M0 0H100V75H35L20 100L22 75H0Z' },
  star: { kind: 'polygon', points: '50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35' },
};

export const SHAPE_KEY = 'icorShape';
export const STYLE_KEY = 'icorStyle';
/* Written into icorStyle; a card whose style carries a higher version
   was styled by a newer build and is read as default and never
   rewritten, the way the ink is versioned. */
export const SHAPE_VERSION = 1;

/* A colour for the fill or the text: '' (the card's own), '1' to '6'
   (the canvas palette), 'transparent' (fill only), or a hex colour. The
   outline is the card's own colour, set with the canvas's palette
   button; 0.2.0 wrote an `icorStyle.stroke`, which 0.3.0 migrates into
   the card's colour and drops. */
export type ShapeColor = string;

export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

export const STROKE_STYLES: readonly StrokeStyle[] = ['solid', 'dashed', 'dotted'];

/* Screen pixels; the layer scales by the zoom multiplier. */
export const STROKE_WIDTHS: readonly number[] = [1, 2, 3, 4, 6];

export const DEFAULT_STROKE_WIDTH = 2;

export interface ShapeStyle {
  shape: Shape;
  fill: ShapeColor;
  text: ShapeColor;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
}

export const DEFAULT_STYLE: ShapeStyle = { shape: 'card', fill: '', text: '', strokeWidth: DEFAULT_STROKE_WIDTH, strokeStyle: 'solid' };

export function isStrokeStyle(v: unknown): v is StrokeStyle {
  return typeof v === 'string' && (STROKE_STYLES as readonly string[]).includes(v);
}

export function isStrokeWidth(v: unknown): v is number {
  return typeof v === 'number' && STROKE_WIDTHS.includes(v);
}

/* The SVG dash for a width and a pattern as two numbers, in the outline's
   own pixels before the zoom factor the stylesheet applies: dashes three
   widths long with a gap of two, dots as zero-length dashes under a round
   cap, and 0 0 for solid (an all-zero dash array renders solid). */
export function dashPair(width: number, style: StrokeStyle): [number, number] {
  if (style === 'dashed') return [width * 3, width * 2];
  if (style === 'dotted') return [0, width * 2];
  return [0, 0];
}

/* The same pair as one dash-array string, for a preview line. */
export function dashArray(width: number, style: StrokeStyle): string {
  const [a, b] = dashPair(width, style);
  return a === 0 && b === 0 ? 'none' : `${a} ${b}`;
}

export const PALETTE: readonly string[] = ['1', '2', '3', '4', '5', '6'];

export function isShape(v: unknown): v is Shape {
  return typeof v === 'string' && (SHAPES as readonly string[]).includes(v);
}

export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
}

export function isShapeColor(v: unknown): v is ShapeColor {
  return v === '' || v === 'transparent' || (typeof v === 'string' && PALETTE.includes(v)) || isHexColor(v);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/* True when the card's style was written by a newer build. */
export function isNewerShape(data: unknown): boolean {
  if (!isRecord(data)) return false;
  const style = data[STYLE_KEY];
  return isRecord(style) && typeof style.version === 'number' && style.version > SHAPE_VERSION;
}

/* The style on a node's data; anything unknown reads as the default. */
export function readShape(data: unknown): ShapeStyle {
  if (!isRecord(data) || isNewerShape(data)) return { ...DEFAULT_STYLE };
  const shape = isShape(data[SHAPE_KEY]) ? data[SHAPE_KEY] : 'card';
  const style = data[STYLE_KEY];
  const fill = isRecord(style) && isShapeColor(style.fill) ? style.fill : '';
  const text = isRecord(style) && isShapeColor(style.text) && style.text !== 'transparent' ? style.text : '';
  const strokeWidth = isRecord(style) && isStrokeWidth(style.strokeWidth) ? style.strokeWidth : DEFAULT_STROKE_WIDTH;
  const strokeStyle = isRecord(style) && isStrokeStyle(style.strokeStyle) ? style.strokeStyle : 'solid';
  return { shape, fill, text, strokeWidth, strokeStyle };
}

/* The 0.2.0 outline colour, if the data still carries one: a palette
   value or a hex colour that can become the card's own colour. */
export function legacyStroke(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const style = data[STYLE_KEY];
  if (!isRecord(style) || !('stroke' in style)) return null;
  const stroke = style.stroke;
  return typeof stroke === 'string' && (PALETTE.includes(stroke) || isHexColor(stroke)) ? stroke : '';
}

/* A new data object with the patch applied and nothing else touched: a
   key the patch does not name keeps whatever value it has, including a
   shape or a style member this build does not know, so an older build
   changing a colour never wipes a newer build's shape. Default values
   remove their keys so an untouched card carries nothing. A card styled
   by a newer build comes back unchanged. Never mutates `data`. */
export function withShape(data: Record<string, unknown>, patch: Partial<ShapeStyle>): Record<string, unknown> {
  if (isNewerShape(data)) return data;
  const out: Record<string, unknown> = { ...data };
  if ('shape' in patch) {
    if (!patch.shape || patch.shape === 'card') delete out[SHAPE_KEY];
    else out[SHAPE_KEY] = patch.shape;
  }
  const touchesStyle = 'fill' in patch || 'text' in patch || 'strokeWidth' in patch || 'strokeStyle' in patch;
  if (touchesStyle) {
    const style: Record<string, unknown> = isRecord(data[STYLE_KEY]) ? { ...data[STYLE_KEY] } : {};
    if ('fill' in patch) {
      if (patch.fill) style.fill = patch.fill;
      else delete style.fill;
    }
    if ('text' in patch) {
      if (patch.text) style.text = patch.text;
      else delete style.text;
    }
    if ('strokeWidth' in patch) {
      if (patch.strokeWidth && patch.strokeWidth !== DEFAULT_STROKE_WIDTH) style.strokeWidth = patch.strokeWidth;
      else delete style.strokeWidth;
    }
    if ('strokeStyle' in patch) {
      if (patch.strokeStyle && patch.strokeStyle !== 'solid') style.strokeStyle = patch.strokeStyle;
      else delete style.strokeStyle;
    }
    delete style.version;
    if (Object.keys(style).length === 0) delete out[STYLE_KEY];
    else out[STYLE_KEY] = { version: SHAPE_VERSION, ...style };
  }
  return out;
}

/* The 0.2.0 outline key, removed; the rest of the style is kept. */
export function withoutLegacyStroke(data: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(data[STYLE_KEY]) || !('stroke' in data[STYLE_KEY])) return data;
  const style: Record<string, unknown> = { ...data[STYLE_KEY] };
  delete style.stroke;
  const out: Record<string, unknown> = { ...data };
  if (Object.keys(style).length === 0) delete out[STYLE_KEY];
  else out[STYLE_KEY] = style;
  return out;
}

/* The CSS value for a colour: a palette entry maps to the canvas's own
   variable so a theme that recolours the palette recolours the card. */
export function colorValue(color: ShapeColor): string {
  if (color === '') return '';
  if (color === 'transparent') return 'transparent';
  if (PALETTE.includes(color)) return `var(--canvas-color-${color})`;
  return color;
}

export function colorLabel(color: ShapeColor): string {
  const names: Record<string, string> = { '': 'Default', '1': 'Red', '2': 'Orange', '3': 'Yellow', '4': 'Green', '5': 'Cyan', '6': 'Purple', transparent: 'None' };
  return names[color] ?? color;
}

/* WCAG relative luminance of an sRGB colour, 0 to 1. */
export function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/* Dark text on a light fill, light text on a dark one. */
export const CONTRAST_THRESHOLD = 0.5;

export function prefersDarkText(luminance: number): boolean {
  return luminance > CONTRAST_THRESHOLD;
}

/* The inset of the content box inside each shape, as fractions of the
   card's height (top, bottom) and width (left, right); the stylesheet's
   padding table point for point. A circle is drawn on the largest
   square that fits the card and its content box is that square's
   inscribed square, so it is handled apart. */
export interface Inset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const INSETS: Readonly<Record<Shape, Inset>> = {
  card: { top: 0, right: 0, bottom: 0, left: 0 },
  rectangle: { top: 0, right: 0, bottom: 0, left: 0 },
  rounded: { top: 0, right: 0, bottom: 0, left: 0 },
  ellipse: { top: 0.15, right: 0.15, bottom: 0.15, left: 0.15 },
  circle: { top: 0, right: 0, bottom: 0, left: 0 },
  diamond: { top: 0.25, right: 0.25, bottom: 0.25, left: 0.25 },
  triangle: { top: 0.45, right: 0.25, bottom: 0.08, left: 0.25 },
  parallelogram: { top: 0.06, right: 0.2, bottom: 0.06, left: 0.2 },
  bubble: { top: 0.08, right: 0.08, bottom: 0.28, left: 0.08 },
  star: { top: 0.34, right: 0.28, bottom: 0.24, left: 0.28 },
};

/* The circle's content square, as a fraction of the drawn square. */
export const CIRCLE_INNER = 0.7;

export interface FitInput {
  shape: Shape;
  width: number;
  height: number;
  /* The content's scroll size, in canvas units. */
  contentWidth: number;
  contentHeight: number;
  /* The canvas grid, when snapping is on; 0 otherwise. */
  grid: number;
}

/* The outer size that fits the content: the inner box the content needs,
   divided by the shape's inner fractions, then both sides scaled by the
   same factor so the card keeps its aspect ratio and never shrinks;
   rounded up to the grid when there is one. */
export function fitSize(input: FitInput): { width: number; height: number } {
  const { shape, width, height, contentWidth, contentHeight, grid } = input;
  let needW: number;
  let needH: number;
  if (shape === 'circle') {
    const side = Math.max(contentWidth, contentHeight) / CIRCLE_INNER;
    needW = side;
    needH = side;
  } else {
    const inset = INSETS[shape];
    needW = contentWidth / (1 - inset.left - inset.right);
    needH = contentHeight / (1 - inset.top - inset.bottom);
  }
  let w: number;
  let h: number;
  if (shape === 'circle') {
    /* A circle is drawn on a square: the card becomes one, no smaller
       than either side it had. */
    w = Math.max(needW, width, height);
    h = w;
  } else {
    const scale = Math.max(1, needW / width, needH / height);
    w = width * scale;
    h = height * scale;
  }
  const snap = (v: number): number => (grid > 0 ? Math.ceil(v / grid) * grid : Math.ceil(v));
  return { width: snap(w), height: snap(h) };
}

/* Wrapped text reflows as the card widens, so scaling the wrapped height
   overshoots. The first fit pass keeps the text's area (its wrapped
   width times height, plus a margin for line breaks) and solves for the
   card at its current aspect ratio; a second, linear pass runs only if
   the re-measure still overflows. */
export const AREA_MARGIN = 1.2;

export function fitSizeByArea(input: FitInput): { width: number; height: number } {
  const { shape, width, height, contentWidth, contentHeight, grid } = input;
  const area = contentWidth * contentHeight * AREA_MARGIN;
  const snap = (v: number): number => (grid > 0 ? Math.ceil(v / grid) * grid : Math.ceil(v));
  if (shape === 'circle') {
    const side = Math.sqrt(area) / CIRCLE_INNER;
    const w = Math.max(side, width, height);
    return { width: snap(w), height: snap(w) };
  }
  const inset = INSETS[shape];
  const innerW = 1 - inset.left - inset.right;
  const innerH = 1 - inset.top - inset.bottom;
  const aspect = width / height;
  const needH = Math.sqrt(area / (aspect * innerW * innerH));
  const needW = aspect * needH;
  const scale = Math.max(1, needW / width, needH / height);
  return { width: snap(width * scale), height: snap(height * scale) };
}
