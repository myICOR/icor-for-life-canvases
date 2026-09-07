/* The settings, their defaults, and the one normaliser that turns whatever
 * data.json holds into a valid record. */
import type { InkColor } from '../canvas/format';
import { INK_COLORS } from '../canvas/format';
import type { InkWidth } from '../canvas/inkModel';
import { INK_WIDTHS } from '../canvas/inkModel';

/* Which key, held on a click on a file node, opens it in the right
   sidebar: Cmd on macOS and Ctrl elsewhere, or Alt (Option). */
export type OpenModifier = 'mod' | 'alt';

export const OPEN_MODIFIERS: readonly OpenModifier[] = ['mod', 'alt'];

/* The dropdown cannot carry an empty string as a value, so the default
   colour is 'default' here and '' in the file. */
export type PenColorSetting = 'default' | Exclude<InkColor, ''>;

export const PEN_COLOR_SETTINGS: readonly PenColorSetting[] = ['default', '1', '2', '3', '4', '5', '6'];

/* Which edge of the canvas the controls column sits on. Core puts it on
   the right; Heptabase's toolbar is on the left. */
export type ControlsSide = 'left' | 'right';

export const CONTROLS_SIDES: readonly ControlsSide[] = ['left', 'right'];

export interface CanvasesSettings {
  modifier: OpenModifier;
  controlsSide: ControlsSide;
  /* The minimap in the bottom right corner of every canvas. */
  minimap: boolean;
  footer: boolean;
  toolbar: boolean;
  penColor: PenColorSetting;
  penWidth: InkWidth;
  /* A stylus (Apple Pencil) draws without switching drawing mode on. */
  penDraws: boolean;
  debug: boolean;
}

export const DEFAULT_SETTINGS: CanvasesSettings = {
  modifier: 'mod',
  controlsSide: 'left',
  minimap: true,
  footer: true,
  toolbar: true,
  penColor: 'default',
  penWidth: 'medium',
  penDraws: true,
  debug: false,
};

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function normaliseSettings(raw: unknown): CanvasesSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    modifier: oneOf(r.modifier, OPEN_MODIFIERS, DEFAULT_SETTINGS.modifier),
    controlsSide: oneOf(r.controlsSide, CONTROLS_SIDES, DEFAULT_SETTINGS.controlsSide),
    minimap: bool(r.minimap, DEFAULT_SETTINGS.minimap),
    footer: bool(r.footer, DEFAULT_SETTINGS.footer),
    toolbar: bool(r.toolbar, DEFAULT_SETTINGS.toolbar),
    penColor: oneOf(r.penColor, PEN_COLOR_SETTINGS, DEFAULT_SETTINGS.penColor),
    penWidth: oneOf(r.penWidth, INK_WIDTHS, DEFAULT_SETTINGS.penWidth),
    penDraws: bool(r.penDraws, DEFAULT_SETTINGS.penDraws),
    debug: bool(r.debug, DEFAULT_SETTINGS.debug),
  };
}

export function penColorOf(setting: PenColorSetting): InkColor {
  return setting === 'default' ? '' : setting;
}

export function penColorSetting(color: InkColor): PenColorSetting {
  return color === '' ? 'default' : color;
}

/* Guards against a value that is not one of the palette entries. */
export function isInkColor(v: unknown): v is InkColor {
  return typeof v === 'string' && (INK_COLORS as readonly string[]).includes(v);
}
