/* A text card's shape and colours as data: the read, the write that
 * never mutates, the defaults that remove their keys, the colour values. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIPPED_SHAPES, OUTLINE_POINTS, SHAPES, SHAPE_KEY, STYLE_KEY, colorValue, isShapeColor, legacyStroke, readShape, withShape } from './build/pure.mjs';

test('readShape reads the two keys and falls back to the default for anything else', () => {
  assert.deepEqual(readShape({}), { shape: 'card', fill: '', text: '' });
  assert.deepEqual(readShape(null), { shape: 'card', fill: '', text: '' });
  assert.deepEqual(readShape({ [SHAPE_KEY]: 'diamond', [STYLE_KEY]: { text: '3', fill: '#ff0000' } }), { shape: 'diamond', fill: '#ff0000', text: '3' });
  assert.deepEqual(readShape({ [SHAPE_KEY]: 'blob', [STYLE_KEY]: { text: 'transparent', fill: 'transparent' } }), { shape: 'card', fill: 'transparent', text: '' }, 'text cannot be transparent');
  assert.deepEqual(readShape({ [STYLE_KEY]: 'nope' }), { shape: 'card', fill: '', text: '' });
});

test('withShape returns a new object, keeps other keys, and removes default values', () => {
  const data = { id: 'n', type: 'text', text: 'hi', other: 1 };
  const shaped = withShape(data, { shape: 'star', text: '2' });
  assert.notEqual(shaped, data);
  assert.deepEqual(data, { id: 'n', type: 'text', text: 'hi', other: 1 }, 'the input is untouched');
  assert.equal(shaped[SHAPE_KEY], 'star');
  assert.deepEqual(shaped[STYLE_KEY], { text: '2' });
  assert.equal(shaped.other, 1);
  const filled = withShape(shaped, { fill: '#abc' });
  assert.deepEqual(filled[STYLE_KEY], { fill: '#abc', text: '2' }, 'a patch keeps the other colour');
  const back = withShape(filled, { shape: 'card', text: '', fill: '' });
  assert.equal(SHAPE_KEY in back, false);
  assert.equal(STYLE_KEY in back, false);
  assert.deepEqual(back, data);
});

test('a 0.2.0 outline colour is read for migration and dropped by the next write', () => {
  assert.equal(legacyStroke({}), null);
  assert.equal(legacyStroke({ [STYLE_KEY]: { fill: '1' } }), null);
  assert.equal(legacyStroke({ [STYLE_KEY]: { stroke: '4' } }), '4');
  assert.equal(legacyStroke({ [STYLE_KEY]: { stroke: '#abc' } }), '#abc');
  assert.equal(legacyStroke({ [STYLE_KEY]: { stroke: 'transparent' } }), '', 'a value the card colour cannot take reads as none');
  const migrated = withShape({ id: 'n', [STYLE_KEY]: { stroke: '4', fill: '2' } }, {});
  assert.deepEqual(migrated[STYLE_KEY], { fill: '2' });
  assert.equal('stroke' in readShape({ [STYLE_KEY]: { stroke: '4' } }), false);
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
