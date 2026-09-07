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

/* Shapes cut with a clip-path lose the container's border; these get an
   SVG outline drawn over the card instead. */
export const CLIPPED_SHAPES: readonly Shape[] = ['diamond', 'triangle', 'parallelogram', 'bubble', 'star'];

/* The outline polygons, in a 0 to 100 box, matching the stylesheet's
   clip-paths point for point. */
export const OUTLINE_POINTS: Readonly<Record<string, string>> = {
  diamond: '50,0 100,50 50,100 0,50',
  triangle: '50,0 100,100 0,100',
  parallelogram: '20,0 100,0 80,100 0,100',
  bubble: '0,0 100,0 100,75 35,75 20,100 22,75 0,75',
  star: '50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35',
};

export const SHAPE_KEY = 'icorShape';
export const STYLE_KEY = 'icorStyle';

/* A colour for the fill or the text: '' (the card's own), '1' to '6'
   (the canvas palette), 'transparent' (fill only), or a hex colour. The
   outline is the card's own colour, set with the canvas's palette
   button; 0.2.0 wrote an `icorStyle.stroke`, which 0.3.0 migrates into
   the card's colour and drops. */
export type ShapeColor = string;

export interface ShapeStyle {
  shape: Shape;
  fill: ShapeColor;
  text: ShapeColor;
}

export const DEFAULT_STYLE: ShapeStyle = { shape: 'card', fill: '', text: '' };

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

/* The style on a node's data; anything unknown reads as the default. */
export function readShape(data: unknown): ShapeStyle {
  if (!isRecord(data)) return { ...DEFAULT_STYLE };
  const shape = isShape(data[SHAPE_KEY]) ? data[SHAPE_KEY] : 'card';
  const style = data[STYLE_KEY];
  const fill = isRecord(style) && isShapeColor(style.fill) ? style.fill : '';
  const text = isRecord(style) && isShapeColor(style.text) && style.text !== 'transparent' ? style.text : '';
  return { shape, fill, text };
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

/* A new data object with the style applied; default values remove their
   keys so an untouched card carries nothing. Never mutates `data`. */
export function withShape(data: Record<string, unknown>, patch: Partial<ShapeStyle>): Record<string, unknown> {
  const current = readShape(data);
  const next: ShapeStyle = { ...current, ...patch };
  const out: Record<string, unknown> = { ...data };
  if (next.shape === 'card') delete out[SHAPE_KEY];
  else out[SHAPE_KEY] = next.shape;
  const style: Record<string, string> = {};
  if (next.fill) style.fill = next.fill;
  if (next.text) style.text = next.text;
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
