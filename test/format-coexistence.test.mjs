/* Other plugins' keys survive our writes, at the top level and on a node
 * (docs/canvas-format.md, section 6). The fixture carries an Advanced
 * Canvas style metadata member, a stray top-level key, and unknown keys
 * on a text card; a stroke commit and a shape and colour change leave
 * every one of them byte-identical. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { METADATA_KEY, SHAPE_KEY, STYLE_KEY, readInk, readShape, withInk, withShape } from './build/pure.mjs';

const fixture = () => ({
  nodes: [
    { id: 'n1', type: 'text', text: 'hello', x: 0, y: 0, width: 250, height: 60, color: '2', someOtherPlugin: { a: [1, 2, { b: 'c' }] }, 'x-flag': true },
    { id: 'n2', type: 'file', file: 'A.md', x: 300, y: 0, width: 400, height: 400 },
  ],
  edges: [{ id: 'e1', fromNode: 'n1', toNode: 'n2', theirs: 'kept' }],
  metadata: {
    version: '1.0-1.0',
    frontmatter: { tags: ['x'] },
    startNode: 'n1',
    advancedCanvas: { portals: { n2: true } },
    'some.other.key': [1, 2, 3],
  },
  topLevelForeign: { deep: { deeper: 1 } },
});

const snapshot = (data) => {
  const { [METADATA_KEY]: _ink, ...metadataRest } = data.metadata ?? {};
  const nodes = data.nodes.map((n) => {
    const { [SHAPE_KEY]: _shape, [STYLE_KEY]: _style, ...rest } = n;
    return rest;
  });
  const { metadata: _m, nodes: _n, ...top } = data;
  return JSON.stringify({ top, metadataRest, nodes, edges: data.edges });
};

test('a stroke commit keeps every sibling of metadata.icorCanvases and every other top-level key', () => {
  const before = fixture();
  const beforeText = snapshot(before);
  const stroke = { id: 'abcdefabcdefabcd', color: '1', width: 4, points: [0, 0, 10, 10] };
  const after = withInk(before, [stroke]);
  assert.equal(snapshot(after), beforeText, 'nothing but our key changed');
  assert.deepEqual(readInk(after), [stroke]);
  assert.equal(after.metadata.advancedCanvas, before.metadata.advancedCanvas, 'the same object, untouched');
  const cleared = withInk(after, []);
  assert.equal(snapshot(cleared), beforeText);
  assert.equal(METADATA_KEY in cleared.metadata, false);
  assert.deepEqual(Object.keys(cleared.metadata).sort(), Object.keys(before.metadata).sort());
});

test('a shape and a colour change keep every foreign key on the node', () => {
  const before = fixture();
  const node = before.nodes[0];
  const nodeText = JSON.stringify(node);
  const shaped = withShape(node, { shape: 'star' });
  const coloured = withShape(shaped, { fill: '4' });
  const texted = withShape(coloured, { text: '#abc' });
  const { [SHAPE_KEY]: shape, [STYLE_KEY]: style, ...rest } = texted;
  const { [SHAPE_KEY]: _s, [STYLE_KEY]: _t, ...originalRest } = node;
  assert.equal(JSON.stringify(rest), JSON.stringify(originalRest), 'every other key is byte-identical, in order');
  assert.equal(shape, 'star');
  assert.deepEqual(style, { version: 1, fill: '4', text: '#abc' });
  assert.equal(JSON.stringify(node), nodeText, 'the input was never mutated');
  assert.deepEqual(readShape(texted), { shape: 'star', fill: '4', text: '#abc' });
  const back = withShape(texted, { shape: 'card', fill: '', text: '' });
  assert.equal(JSON.stringify(back), nodeText, 'undoing every choice gives the original bytes back');
});

test('the whole file round-trips through both writes with the foreign keys intact', () => {
  const before = fixture();
  const beforeText = snapshot(before);
  const inked = withInk(before, [{ id: 'abcdefabcdefabcd', color: '', width: 2, points: [1, 1, 2, 2] }]);
  const nodes = inked.nodes.map((n) => (n.type === 'text' ? withShape(withShape(n, { shape: 'diamond' }), { fill: '3' }) : n));
  const after = { ...inked, nodes };
  assert.equal(snapshot(after), beforeText);
});
