/* The canvas index parser: which notes a canvas places, the direction of
 * every edge as seen from the note's card, the labels, the other end's
 * title, and what a malformed file yields. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNNAMED_GROUP, basename, containingGroups, direction, firstLine, otherTitle, parseCanvasFile, placementsOf } from './build/pure.mjs';

const node = (id, extra) => ({ id, x: 0, y: 0, width: 100, height: 100, ...extra });
const file = (id, path) => node(id, { type: 'file', file: path });

const canvas = {
  nodes: [
    file('a', 'Notes/A.md'),
    file('b', 'Notes/B.md'),
    node('t', { type: 'text', text: '# Heading line\nsecond line' }),
    node('l', { type: 'link', url: 'https://example.com' }),
    node('g', { type: 'group', label: 'Ideas' }),
    file('a2', 'Notes/A.md'),
  ],
  edges: [
    { id: 'e1', fromNode: 'a', toNode: 'b', label: 'test' },
    { id: 'e2', fromNode: 't', toNode: 'a' },
    { id: 'e3', fromNode: 'a', toNode: 'l', fromEnd: 'arrow', toEnd: 'arrow' },
    { id: 'e4', fromNode: 'g', toNode: 'a', fromEnd: 'none', toEnd: 'none' },
    { id: 'e5', fromNode: 'a', toNode: 'a' },
    { id: 'e6', fromNode: 'b', toNode: 'missing' },
  ],
};

test('direction reads the arrow ends with their defaults', () => {
  assert.equal(direction({ id: 'x', fromNode: 'a', toNode: 'b' }, 'a'), 'out');
  assert.equal(direction({ id: 'x', fromNode: 'a', toNode: 'b' }, 'b'), 'in');
  assert.equal(direction({ id: 'x', fromNode: 'a', toNode: 'b', fromEnd: 'arrow', toEnd: 'arrow' }, 'a'), 'both');
  assert.equal(direction({ id: 'x', fromNode: 'a', toNode: 'b', fromEnd: 'arrow', toEnd: 'arrow' }, 'b'), 'both');
  assert.equal(direction({ id: 'x', fromNode: 'a', toNode: 'b', toEnd: 'none' }, 'a'), 'none');
  assert.equal(direction({ id: 'x', fromNode: 'a', toNode: 'b', fromEnd: 'arrow', toEnd: 'none' }, 'a'), 'in');
  assert.equal(direction({ id: 'x', fromNode: 'a', toNode: 'b', fromEnd: 'arrow', toEnd: 'none' }, 'b'), 'out');
});

test('a canvas yields one placement per file node with its connections', () => {
  const placements = placementsOf('Maps/one.canvas', canvas);
  assert.deepEqual([...placements.keys()].sort(), ['Notes/A.md', 'Notes/B.md']);
  const a = placements.get('Notes/A.md');
  assert.equal(a.length, 2, 'the note sits on two cards');
  assert.equal(a[0].canvasPath, 'Maps/one.canvas');
  assert.equal(a[0].nodeId, 'a');
  assert.deepEqual(
    a[0].connections.map((c) => [c.direction, c.other.kind, c.label ?? null, c.edgeId]),
    [
      ['out', 'file', 'test', 'e1'],
      ['in', 'text', null, 'e2'],
      ['both', 'link', null, 'e3'],
      ['none', 'group', null, 'e4'],
    ],
  );
  assert.deepEqual(a[1].connections, [], 'the second card has no edges');
  const b = placements.get('Notes/B.md');
  assert.equal(b.length, 1);
  assert.deepEqual(
    b[0].connections.map((c) => [c.direction, c.other.file, c.label]),
    [['in', 'Notes/A.md', 'test']],
    'an edge to a node that does not exist is dropped',
  );
});

test('the other end carries what its title needs', () => {
  const a = placementsOf('one.canvas', canvas).get('Notes/A.md')[0];
  assert.deepEqual(
    a.connections.map((c) => otherTitle(c.other)),
    ['B', 'Heading line', 'https://example.com', 'Ideas'],
  );
  assert.equal(otherTitle({ kind: 'file', nodeId: 'x' }), 'File');
  assert.equal(otherTitle({ kind: 'text', nodeId: 'x', text: '\n\n' }), 'Text');
  assert.equal(otherTitle({ kind: 'group', nodeId: 'x' }), 'Group');
});

test('the first line of a text card drops list, heading and emphasis markers and is cut at sixty', () => {
  assert.equal(firstLine('- [ ] a task\nmore'), 'a task');
  assert.equal(firstLine('> **bold** quote'), 'bold quote');
  assert.equal(firstLine('1. numbered'), 'numbered');
  const long = 'x'.repeat(80);
  assert.equal(firstLine(long).length, 60);
  assert.ok(firstLine(long).endsWith('…'));
  assert.equal(firstLine('y'.repeat(60)), 'y'.repeat(60));
});

test('basename strips the folder and the extension', () => {
  assert.equal(basename('Maps/2026-09-06_canvas.canvas'), '2026-09-06_canvas');
  assert.equal(basename('Notes/A.md'), 'A');
  assert.equal(basename('no-extension'), 'no-extension');
  assert.equal(basename('.hidden'), '.hidden');
});

test('a malformed file yields null; a file with no file nodes yields an empty map', () => {
  assert.equal(parseCanvasFile('x.canvas', '{not json'), null);
  assert.equal(parseCanvasFile('x.canvas', '[]'), null);
  assert.equal(parseCanvasFile('x.canvas', JSON.stringify({ nodes: [node('t', { type: 'text', text: 'hi' })], edges: [] })).size, 0);
  assert.equal(parseCanvasFile('x.canvas', JSON.stringify({ nodes: 'nope', edges: null })).size, 0);
});

test("Tom's test canvas: two file nodes, one edge labelled test", () => {
  const text = JSON.stringify({
    nodes: [
      { id: 'e17502c51d9fbb3a', x: 0, y: 0, width: 400, height: 400, type: 'file', file: 'Logs/one.md' },
      { id: 'fa8ac4d044562538', x: -560, y: 0, width: 400, height: 400, type: 'file', file: 'Logs/two.md' },
    ],
    edges: [{ id: '6f260753d47ae15c', fromNode: 'fa8ac4d044562538', fromSide: 'right', toNode: 'e17502c51d9fbb3a', toSide: 'left', color: '1', label: 'test' }],
  });
  const placements = parseCanvasFile('00 Daily Scratchpad/2026-09-06_canvas.canvas', text);
  const one = placements.get('Logs/one.md')[0];
  const two = placements.get('Logs/two.md')[0];
  assert.equal(one.connections[0].direction, 'in');
  assert.equal(one.connections[0].label, 'test');
  assert.equal(otherTitle(one.connections[0].other), 'two');
  assert.equal(two.connections[0].direction, 'out');
  assert.equal(otherTitle(two.connections[0].other), 'one');
});

test('a placement lists the groups around its card, innermost first, and a canvas on a canvas is a placement', () => {
  const data = {
    nodes: [
      { id: 'outer', type: 'group', label: 'Outer', x: 0, y: 0, width: 1000, height: 1000 },
      { id: 'inner', type: 'group', label: '  Inner ', x: 100, y: 100, width: 400, height: 400 },
      { id: 'blank', type: 'group', x: 600, y: 600, width: 300, height: 300 },
      { id: 'a', type: 'file', file: 'A.md', x: 120, y: 120, width: 100, height: 100 },
      { id: 'b', type: 'file', file: 'B.md', x: 900, y: 900, width: 100, height: 100 },
      { id: 'c', type: 'file', file: 'C.md', x: 650, y: 650, width: 50, height: 50 },
      { id: 'child', type: 'file', file: 'Maps/child.canvas', x: 2000, y: 2000, width: 400, height: 400 },
    ],
    edges: [],
  };
  const p = placementsOf('Maps/parent.canvas', data);
  assert.deepEqual(p.get('A.md')[0].groups, [
    { nodeId: 'inner', label: 'Inner' },
    { nodeId: 'outer', label: 'Outer' },
  ]);
  assert.deepEqual(p.get('B.md')[0].groups, [{ nodeId: 'outer', label: 'Outer' }], 'touching the outer edge is inside');
  assert.deepEqual(p.get('C.md')[0].groups.map((g) => g.nodeId), ['blank', 'outer']);
  assert.equal(p.get('C.md')[0].groups[0].label, '', 'an unlabelled group reads as empty; the rows say unnamed group');
  assert.equal(UNNAMED_GROUP, 'unnamed group');
  assert.deepEqual(p.get('Maps/child.canvas')[0].groups, []);
  assert.equal(p.get('Maps/child.canvas')[0].nodeId, 'child', 'a nested canvas is placed like a note');
  assert.deepEqual(containingGroups({ id: 'x', type: 'file', x: 'nope' }, []), [], 'a card without a box is in no group');
});
