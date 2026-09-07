/* The ink as data: the file round trip, the point gap, the path shape, the
 * eraser's hit test, and the colour and width cycles. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { INK_COLORS, INK_WIDTHS, INK_WIDTH_UNITS, METADATA_KEY, MIN_POINT_GAP, StrokeBuilder, nextColor, nextWidth, pathData, pressureScale, readInk, strokeHit, withInk } from './build/pure.mjs';

const stroke = { id: 'abc', color: '1', width: 4, points: [0, 0, 10, 0, 20, 0] };

test('withInk writes under metadata.icorCanvases and never mutates the object it was given', () => {
  const data = { nodes: [], edges: [], metadata: { other: 1 } };
  const next = withInk(data, [stroke]);
  assert.notEqual(next, data);
  assert.deepEqual(data.metadata, { other: 1 }, 'the old object is untouched: the canvas history holds it');
  assert.deepEqual(next.metadata[METADATA_KEY], { version: 1, strokes: [stroke] });
  assert.equal(next.metadata.other, 1, 'other metadata survives');
  assert.deepEqual(readInk(next), [stroke]);
});

test('an empty stroke set removes the key, and metadata with it when nothing else is there', () => {
  const withStrokes = withInk({ nodes: [], edges: [] }, [stroke]);
  const cleared = withInk(withStrokes, []);
  assert.equal('metadata' in cleared, false);
  const kept = withInk({ nodes: [], edges: [], metadata: { other: 1, [METADATA_KEY]: { version: 1, strokes: [stroke] } } }, []);
  assert.deepEqual(kept.metadata, { other: 1 });
});

test('ink from a newer version is read as none and never rewritten', () => {
  const newer = { nodes: [], edges: [], metadata: { [METADATA_KEY]: { version: 2, strokes: [stroke], extra: true } } };
  assert.deepEqual(readInk(newer), []);
  assert.equal(withInk(newer, [stroke]), newer, 'the same object comes back, so the commit is a no-op');
  assert.equal(withInk(newer, []), newer);
  assert.equal(newer.metadata[METADATA_KEY].version, 2);
});

test('readInk drops what it cannot trust, stroke by stroke', () => {
  const bad = [
    { id: '', color: '1', width: 4, points: [0, 0] },
    { id: 'w', color: '1', width: -1, points: [0, 0] },
    { id: 'p', color: '1', width: 4, points: [0, 0, 1] },
    { id: 'n', color: '1', width: 4, points: [0, 'x'] },
    'nope',
  ];
  const data = { metadata: { [METADATA_KEY]: { version: 1, strokes: [...bad, { id: 'ok', color: 'purple', width: 2, points: [1, 2, 3, 4] }] } } };
  assert.deepEqual(readInk(data), [{ id: 'ok', color: '', width: 2, points: [1, 2, 3, 4] }], 'an unknown colour reads as default');
  assert.deepEqual(readInk({ metadata: { [METADATA_KEY]: { version: 2, strokes: [stroke] } } }), [], 'a newer version is not read');
  assert.deepEqual(readInk(null), []);
  assert.deepEqual(readInk({ metadata: 'x' }), []);
});

test('the builder drops points closer than the gap and rounds to a tenth', () => {
  const b = new StrokeBuilder();
  assert.equal(b.add(0, 0), true);
  assert.equal(b.add(0.5, 0.5), false, 'closer than the gap');
  assert.equal(b.add(MIN_POINT_GAP, 0), true, 'exactly the gap is kept');
  assert.equal(b.add(10.123, 20.456), true);
  assert.deepEqual(b.points, [0, 0, 1.5, 0, 10.1, 20.5]);
  assert.equal(b.count, 3);
});

test('pen pressure scales the width lightly, mouse input not at all', () => {
  const pen = new StrokeBuilder();
  pen.add(0, 0, 1);
  pen.add(10, 0, 1);
  assert.equal(pen.finish('id', '', 4, true).width, 5.2);
  const mouse = new StrokeBuilder();
  mouse.add(0, 0, 0.5);
  mouse.add(10, 0, 0.5);
  assert.equal(mouse.finish('id', '', 4, false).width, 4);
  assert.equal(pressureScale(0), 0.7);
  assert.equal(pressureScale(0.5), 1);
  assert.equal(pressureScale(2), 1.3, 'clamped');
});

test('a path is a dot for one point, a line for two, curves through midpoints after', () => {
  assert.equal(pathData([]), '');
  assert.equal(pathData([3, 4]), 'M3 4l0.01 0');
  assert.equal(pathData([0, 0, 10, 0]), 'M0 0L10 0');
  assert.equal(pathData([0, 0, 10, 0, 10, 10]), 'M0 0Q10 0 10 5L10 10');
});

test('the eraser hits within its radius plus half the width and nowhere else', () => {
  assert.equal(strokeHit(stroke, 10, 3, 1), true, 'within 1 + 2');
  assert.equal(strokeHit(stroke, 10, 3.1, 1), false);
  assert.equal(strokeHit(stroke, 25, 0, 4), true, 'past the end but within reach');
  assert.equal(strokeHit(stroke, 30, 0, 4), false);
  assert.equal(strokeHit({ ...stroke, points: [5, 5] }, 6, 6, 1), true, 'a dot');
});

test('colour and width cycle through their tables and wrap', () => {
  let c = '';
  const seen = [];
  for (let i = 0; i < INK_COLORS.length; i++) {
    seen.push(c);
    c = nextColor(c);
  }
  assert.deepEqual(seen, [...INK_COLORS]);
  assert.equal(c, '', 'wrapped');
  assert.equal(nextWidth('thick'), 'thin');
  assert.deepEqual(INK_WIDTHS.map((w) => INK_WIDTH_UNITS[w]), [2, 4, 8]);
});
