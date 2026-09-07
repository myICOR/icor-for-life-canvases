/* Where a flyout goes, as numbers: the anchor's rectangle in, the panel's
 * top-left out, clamped inside the window. Pure, so the tests drive it
 * with fake rectangles. Placement: `below` centres under the anchor,
 * `above` sits over it with its right edge on the anchor's right, `side`
 * opens away from the nearer window edge at the anchor's top. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/* `below` for a toolbar button; `side` for a button in the controls column,
   which opens away from the edge the column sits on; `above` for a button
   on the bottom bar. */
export type FlyoutPlacement = 'below' | 'above' | 'side';

export interface Point {
  left: number;
  top: number;
}

/* The gap between the anchor and the panel, in CSS pixels. */
export const FLYOUT_GAP = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function placeFlyout(anchor: Rect, panel: Size, placement: FlyoutPlacement, viewport: Size): Point {
  let left: number;
  let top: number;
  if (placement === 'below') {
    left = anchor.left + anchor.width / 2 - panel.width / 2;
    top = anchor.bottom + FLYOUT_GAP;
  } else if (placement === 'above') {
    left = anchor.right - panel.width;
    top = anchor.top - FLYOUT_GAP - panel.height;
  } else {
    const opensRight = anchor.left + anchor.width / 2 < viewport.width / 2;
    left = opensRight ? anchor.right + FLYOUT_GAP : anchor.left - FLYOUT_GAP - panel.width;
    top = anchor.top;
  }
  return {
    left: Math.round(clamp(left, 0, viewport.width - panel.width)),
    top: Math.round(clamp(top, 0, viewport.height - panel.height)),
  };
}

/* The side a `side` flyout opens to, for its placement class. */
export function sideOf(anchor: Rect, viewport: Size): 'left' | 'right' {
  return anchor.left + anchor.width / 2 < viewport.width / 2 ? 'right' : 'left';
}
