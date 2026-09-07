/* The index's tables never drop a canvas that arrived after a sweep: core
 * indexes one canvas per idle callback at startup, so canvases resolve
 * one by one after the first rebuild (Flint, 1.13.7). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { IndexStore, placementsOf } from './build/pure.mjs';

const canvas = (path, note) => [path, placementsOf(path, { nodes: [{ id: 'n', type: 'file', file: note, x: 0, y: 0, width: 100, height: 100 }], edges: [] })];

test('a canvas that resolves after the first sweep is added, and a later sweep that does not name it keeps it', () => {
  const store = new IndexStore();
  store.setMany([canvas('A.canvas', 'one.md')]);
  assert.deepEqual(store.canvasesFor('one.md'), ['A.canvas']);
  /* Core reaches B later: it resolves on its own. */
  store.set(...canvas('B.canvas', 'one.md'));
  assert.deepEqual(store.canvasesFor('one.md'), ['A.canvas', 'B.canvas']);
  /* A sweep that, at its moment, only knows A must not lose B. */
  store.setMany([canvas('A.canvas', 'one.md')]);
  assert.deepEqual(store.canvasesFor('one.md'), ['A.canvas', 'B.canvas']);
  assert.equal(store.size, 2);
});

test('a re-read replaces that canvas only; a removal drops it and reports whether it was there', () => {
  const store = new IndexStore();
  store.setMany([canvas('A.canvas', 'one.md'), canvas('B.canvas', 'two.md')]);
  store.set(...canvas('A.canvas', 'three.md'));
  assert.deepEqual(store.canvasesFor('one.md'), []);
  assert.deepEqual(store.canvasesFor('three.md'), ['A.canvas']);
  assert.deepEqual(store.canvasesFor('two.md'), ['B.canvas']);
  assert.equal(store.remove('B.canvas'), true);
  assert.equal(store.remove('B.canvas'), false);
  assert.deepEqual(store.paths(), ['A.canvas']);
});
