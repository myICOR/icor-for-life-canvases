/* The two ink pickers as flyouts: the six canvas colours plus default as
 * swatches, in the canvas's own swatch classes so the theme colours them,
 * and the three widths as stroke previews. */
import { INK_COLORS } from './format';
import type { InkColor } from './format';
import { Flyout, flyoutOption } from './flyout';
import type { FlyoutPlacement } from './flyout';
import { INK_COLOR_NAMES, INK_WIDTHS } from './inkModel';
import type { InkWidth } from './inkModel';

export const WIDTH_LABELS: Record<InkWidth, string> = { thin: 'Thin', medium: 'Medium', thick: 'Thick' };

/* The preview line widths, unitless SVG numbers. */
const PREVIEW_STROKE: Record<InkWidth, string> = { thin: '1.5', medium: '3', thick: '5' };

export function swatch(panel: HTMLElement, color: InkColor, label: string, active: boolean, onChoose: () => void): HTMLElement {
  const cls = ['canvas-color-picker-item', 'icor-canvases-swatch'];
  if (color) cls.push(`mod-canvas-color-${color}`);
  else cls.push('icor-canvases-swatch-default');
  return flyoutOption(panel, cls, label, active, onChoose);
}

export function openColorPicker(anchor: HTMLElement, placement: FlyoutPlacement, current: InkColor, onPick: (color: InkColor) => void): void {
  Flyout.open({
    anchor,
    placement,
    build(panel, close) {
      for (const color of INK_COLORS) {
        swatch(panel, color, `Ink colour: ${INK_COLOR_NAMES[color]}`, color === current, () => {
          onPick(color);
          close();
        });
      }
    },
  });
}

export function openWidthPicker(anchor: HTMLElement, placement: FlyoutPlacement, current: InkWidth, onPick: (width: InkWidth) => void): void {
  Flyout.open({
    anchor,
    placement,
    build(panel, close) {
      for (const width of INK_WIDTHS) {
        const option = flyoutOption(panel, ['icor-canvases-width-option'], `Stroke width: ${WIDTH_LABELS[width]}`, width === current, () => {
          onPick(width);
          close();
        });
        option.createSvg('svg', { cls: 'icor-canvases-width-preview', attr: { viewBox: '0 0 24 24' } }, (svg) => {
          svg.createSvg('path', { attr: { d: 'M4 16 C 9 6, 15 18, 20 8', 'stroke-width': PREVIEW_STROKE[width] } });
        });
      }
    },
  });
}
