/* Boxes in canvas units: union, padding, containment, area. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { boxArea, boxOf, containsBox, padBox, unionBox } from './build/pure.mjs';

test('unionBox spans every box and is null for none', () => {
  assert.equal(unionBox([]), null);
  assert.deepEqual(unionBox([boxOf(0, 0, 10, 10)]), { minX: 0, minY: 0, maxX: 10, maxY: 10 });
  assert.deepEqual(unionBox([boxOf(0, 0, 10, 10), boxOf(-5, 20, 2, 2)]), { minX: -5, minY: 0, maxX: 10, maxY: 22 });
});

test('padBox grows every side; containsBox counts touching edges as inside', () => {
  assert.deepEqual(padBox(boxOf(0, 0, 10, 10), 5), { minX: -5, minY: -5, maxX: 15, maxY: 15 });
  const outer = boxOf(0, 0, 100, 100);
  assert.equal(containsBox(outer, boxOf(0, 0, 100, 100)), true);
  assert.equal(containsBox(outer, boxOf(10, 10, 20, 20)), true);
  assert.equal(containsBox(outer, boxOf(90, 90, 20, 20)), false);
  assert.equal(containsBox(outer, boxOf(-1, 0, 10, 10)), false);
  assert.equal(boxArea(boxOf(0, 0, 10, 5)), 50);
  assert.equal(boxArea({ minX: 5, minY: 5, maxX: 0, maxY: 0 }), 0);
});
