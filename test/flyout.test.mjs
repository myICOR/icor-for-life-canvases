/* Flyout placement as numbers: above sits over the anchor with its right
 * edge on the anchor's right; below centres under it; side opens away
 * from the nearer window edge; everything is clamped inside the window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLYOUT_GAP, placeFlyout, sideOf } from './build/pure.mjs';

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const viewport = { width: 1440, height: 900 };
const panel = { width: 180, height: 160 };

test('above: over the anchor, right edges aligned, the gap between', () => {
  const anchor = rect(1300, 850, 40, 30);
  const p = placeFlyout(anchor, panel, 'above', viewport);
  assert.equal(p.left, 1340 - 180);
  assert.equal(p.top, 850 - FLYOUT_GAP - 160);
});

test('below: centred under the anchor', () => {
  const p = placeFlyout(rect(700, 100, 40, 30), panel, 'below', viewport);
  assert.equal(p.left, 720 - 90);
  assert.equal(p.top, 130 + FLYOUT_GAP);
});

test('side: away from the nearer edge, at the anchor top', () => {
  const leftColumn = rect(8, 400, 32, 32);
  assert.equal(sideOf(leftColumn, viewport), 'right');
  assert.deepEqual(placeFlyout(leftColumn, panel, 'side', viewport), { left: 40 + FLYOUT_GAP, top: 400 });
  const rightColumn = rect(1400, 400, 32, 32);
  assert.equal(sideOf(rightColumn, viewport), 'left');
  assert.deepEqual(placeFlyout(rightColumn, panel, 'side', viewport), { left: 1400 - FLYOUT_GAP - 180, top: 400 });
});

test('clamped inside the window, and a zero anchor never lands off screen', () => {
  const p = placeFlyout(rect(10, 10, 40, 30), panel, 'above', viewport);
  assert.deepEqual(p, { left: 0, top: 0 });
  const q = placeFlyout(rect(1430, 890, 40, 30), panel, 'below', viewport);
  assert.deepEqual(q, { left: 1440 - 180, top: 900 - 160 });
  const z = placeFlyout(rect(0, 0, 0, 0), panel, 'above', viewport);
  assert.deepEqual(z, { left: 0, top: 0 });
});
