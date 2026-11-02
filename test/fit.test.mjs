/* Zoom to fit takes the ink in (Tool Lab item 16). Core's fit knows only the
 * cards; the strokes live in `metadata.icorCanvases`, where it never looks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIT_MARGIN, contentBox, fitWithInk, inkFitBox, strokeBox, withInk } from './build/pure.mjs';

const stroke = (points, width = 4) => ({ id: 'a', color: '1', width, points });
const card = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

test('strokeBox spans the points plus half the pen width', () => {
  assert.deepEqual(strokeBox(stroke([10, 20, 30, 5, 20, 40], 4)), { minX: 8, minY: 3, maxX: 32, maxY: 42 });
  assert.equal(strokeBox(stroke([])), null);
});

test('contentBox: nodes only, strokes only, both, empty', () => {
  const ink = stroke([200, 300, 210, 310], 2);
  const inkBox = { minX: 199, minY: 299, maxX: 211, maxY: 311 };
  assert.deepEqual(contentBox([card], []), card);
  assert.deepEqual(contentBox([], [ink]), inkBox);
  assert.deepEqual(contentBox([card], [ink]), { minX: 0, minY: 0, maxX: 211, maxY: 311 });
  assert.equal(contentBox([], []), null);
});

test('inkFitBox pads the union, and is null without a stroke so core fits as it always did', () => {
  const box = inkFitBox([card], [stroke([200, 50, 210, 50], 2)]);
  assert.deepEqual(box, { minX: -FIT_MARGIN, minY: -FIT_MARGIN, maxX: 211 + FIT_MARGIN, maxY: 100 + FIT_MARGIN });
  assert.equal(inkFitBox([card], []), null);
  assert.equal(inkFitBox([], []), null);
});

function fakeCanvas(strokes, extra = {}) {
  const calls = [];
  const canvas = {
    nodes: new Map([['n', { getBBox: () => card }]]),
    data: withInk({ nodes: [], edges: [] }, strokes),
    zoomToBbox: (box) => calls.push(['bbox', box]),
    ...extra,
  };
  return { canvas, calls, native: () => calls.push(['native']) };
}

test('fitWithInk zooms to the box when there is ink', () => {
  const { canvas, calls, native } = fakeCanvas([stroke([500, 500, 510, 510], 2)]);
  fitWithInk(canvas, native);
  assert.deepEqual(calls, [['bbox', { minX: -FIT_MARGIN, minY: -FIT_MARGIN, maxX: 511 + FIT_MARGIN, maxY: 511 + FIT_MARGIN }]]);
});

test('fitWithInk falls back to core with no strokes, or with no zoomToBbox on this build', () => {
  const none = fakeCanvas([]);
  fitWithInk(none.canvas, none.native);
  assert.deepEqual(none.calls, [['native']]);
  const missing = fakeCanvas([stroke([1, 1, 2, 2])], { zoomToBbox: undefined });
  fitWithInk(missing.canvas, missing.native);
  assert.deepEqual(missing.calls, [['native']]);
});
