/* A text card's shape and colours as data: the read, the write that
 * never mutates, the defaults that remove their keys, the colour values. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIPPED_SHAPES, OUTLINE_POINTS, SHAPES, SHAPE_KEY, STYLE_KEY, colorValue, isShapeColor, readShape, withShape } from './build/pure.mjs';

test('readShape reads the two keys and falls back to the default for anything else', () => {
  assert.deepEqual(readShape({}), { shape: 'card', stroke: '', fill: '' });
  assert.deepEqual(readShape(null), { shape: 'card', stroke: '', fill: '' });
  assert.deepEqual(readShape({ [SHAPE_KEY]: 'diamond', [STYLE_KEY]: { stroke: '3', fill: '#ff0000' } }), { shape: 'diamond', stroke: '3', fill: '#ff0000' });
  assert.deepEqual(readShape({ [SHAPE_KEY]: 'blob', [STYLE_KEY]: { stroke: 'red', fill: 'transparent' } }), { shape: 'card', stroke: '', fill: 'transparent' });
  assert.deepEqual(readShape({ [STYLE_KEY]: 'nope' }), { shape: 'card', stroke: '', fill: '' });
});

test('withShape returns a new object, keeps other keys, and removes default values', () => {
  const data = { id: 'n', type: 'text', text: 'hi', other: 1 };
  const shaped = withShape(data, { shape: 'star', stroke: '2' });
  assert.notEqual(shaped, data);
  assert.deepEqual(data, { id: 'n', type: 'text', text: 'hi', other: 1 }, 'the input is untouched');
  assert.equal(shaped[SHAPE_KEY], 'star');
  assert.deepEqual(shaped[STYLE_KEY], { stroke: '2' });
  assert.equal(shaped.other, 1);
  const filled = withShape(shaped, { fill: '#abc' });
  assert.deepEqual(filled[STYLE_KEY], { stroke: '2', fill: '#abc' }, 'a patch keeps the other colour');
  const back = withShape(filled, { shape: 'card', stroke: '', fill: '' });
  assert.equal(SHAPE_KEY in back, false);
  assert.equal(STYLE_KEY in back, false);
  assert.deepEqual(back, data);
});

test('colours: the palette maps to the canvas variables, hex passes, junk is refused', () => {
  assert.equal(colorValue(''), '');
  assert.equal(colorValue('4'), 'var(--canvas-color-4)');
  assert.equal(colorValue('transparent'), 'transparent');
  assert.equal(colorValue('#12ab34'), '#12ab34');
  assert.equal(isShapeColor('#12ab34'), true);
  assert.equal(isShapeColor('#abc'), true);
  assert.equal(isShapeColor('red'), false);
  assert.equal(isShapeColor('7'), false);
  assert.equal(isShapeColor('#12ab3'), false);
});

test('every clipped shape has an outline polygon; card is the first shape', () => {
  assert.equal(SHAPES[0], 'card');
  assert.equal(SHAPES.length, 10);
  for (const shape of CLIPPED_SHAPES) assert.match(OUTLINE_POINTS[shape], /^\d+,\d+( \d+,\d+)+$/, shape);
});
