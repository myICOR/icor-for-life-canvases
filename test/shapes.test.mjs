/* A text card's shape and colours as data: the read, the write that
 * never mutates, the defaults that remove their keys, the colour values. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIPPED_SHAPES, OUTLINE_POINTS, SHAPES, SHAPE_KEY, STYLE_KEY, colorValue, isShapeColor, isNewerShape, legacyStroke, prefersDarkText, readShape, relativeLuminance, withShape, withoutLegacyStroke } from './build/pure.mjs';

test('readShape reads the two keys and falls back to the default for anything else', () => {
  assert.deepEqual(readShape({}), { shape: 'card', fill: '', text: '', strokeWidth: 2, strokeStyle: 'solid' });
  assert.deepEqual(readShape(null), { shape: 'card', fill: '', text: '', strokeWidth: 2, strokeStyle: 'solid' });
  assert.deepEqual(readShape({ [SHAPE_KEY]: 'diamond', [STYLE_KEY]: { text: '3', fill: '#ff0000', strokeWidth: 3, strokeStyle: 'dashed' } }), { shape: 'diamond', fill: '#ff0000', text: '3', strokeWidth: 3, strokeStyle: 'dashed' });
  assert.deepEqual(readShape({ [STYLE_KEY]: { strokeWidth: 5, strokeStyle: 'wavy' } }).strokeWidth, 2, 'an unknown width reads as the default');
  assert.deepEqual(readShape({ [SHAPE_KEY]: 'blob', [STYLE_KEY]: { text: 'transparent', fill: 'transparent' } }), { shape: 'card', fill: 'transparent', text: '', strokeWidth: 2, strokeStyle: 'solid' }, 'text cannot be transparent');
  assert.deepEqual(readShape({ [STYLE_KEY]: 'nope' }), { shape: 'card', fill: '', text: '', strokeWidth: 2, strokeStyle: 'solid' });
});

test('withShape returns a new object, keeps other keys, and removes default values', () => {
  const data = { id: 'n', type: 'text', text: 'hi', other: 1 };
  const shaped = withShape(data, { shape: 'star', text: '2' });
  assert.notEqual(shaped, data);
  assert.deepEqual(data, { id: 'n', type: 'text', text: 'hi', other: 1 }, 'the input is untouched');
  assert.equal(shaped[SHAPE_KEY], 'star');
  assert.deepEqual(shaped[STYLE_KEY], { version: 1, text: '2' });
  assert.equal(shaped.other, 1);
  const filled = withShape(shaped, { fill: '#abc' });
  assert.deepEqual(filled[STYLE_KEY], { version: 1, text: '2', fill: '#abc' }, 'a patch keeps the other colour');
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
  const migrated = withoutLegacyStroke({ id: 'n', [STYLE_KEY]: { stroke: '4', fill: '2' } });
  assert.deepEqual(migrated[STYLE_KEY], { fill: '2' });
  assert.equal(STYLE_KEY in withoutLegacyStroke({ id: 'n', [STYLE_KEY]: { stroke: '4' } }), false, 'an empty style goes with it');
  assert.equal('stroke' in readShape({ [STYLE_KEY]: { stroke: '4' } }), false);
});

test('withShape patches only the keys it is given and never rewrites a newer build (Flint M1)', () => {
  const newerShape = { id: 'n', [SHAPE_KEY]: 'hexagon', [STYLE_KEY]: { version: 1, fill: '1', glow: true } };
  const recoloured = withShape(newerShape, { fill: '2' });
  assert.equal(recoloured[SHAPE_KEY], 'hexagon', 'a shape this build does not know survives a colour change');
  assert.deepEqual(recoloured[STYLE_KEY], { version: 1, fill: '2', glow: true }, 'an unknown style member survives');
  assert.deepEqual(readShape(newerShape).shape, 'card', 'and reads as the default here');
  const v2 = { id: 'n', [SHAPE_KEY]: 'star', [STYLE_KEY]: { version: 2, fill: '1' } };
  assert.equal(isNewerShape(v2), true);
  assert.equal(withShape(v2, { fill: '3' }), v2, 'a newer version comes back untouched');
  assert.deepEqual(readShape(v2), { shape: 'card', fill: '', text: '', strokeWidth: 2, strokeStyle: 'solid' });
  assert.equal(isNewerShape({ [STYLE_KEY]: { fill: '1' } }), false, 'no version reads as version 1');
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

test('the contrast fallback: dark text on a light fill, light text on a dark one', () => {
  assert.equal(relativeLuminance(255, 255, 255).toFixed(3), '1.000');
  assert.equal(relativeLuminance(0, 0, 0), 0);
  assert.equal(prefersDarkText(relativeLuminance(255, 255, 0)), true, 'yellow');
  assert.equal(prefersDarkText(relativeLuminance(224, 222, 113)), true, 'the canvas yellow');
  assert.equal(prefersDarkText(relativeLuminance(30, 30, 30)), false);
  assert.equal(prefersDarkText(relativeLuminance(255, 91, 46)), false, 'the canvas red is dark enough for light text');
});

test('fitSize: the inner box the text needs, divided by the inset, scaled evenly, never shrinking', async () => {
  const { fitSize, INSETS, CIRCLE_INNER } = await import('./build/pure.mjs');
  const d = INSETS.diamond;
  assert.equal(d.left + d.right, 0.5);
  const fit = fitSize({ shape: 'diamond', width: 200, height: 100, contentWidth: 150, contentHeight: 40, grid: 0 });
  assert.equal(fit.width, 300, '150 over a half');
  assert.equal(fit.height, 150, 'the height follows the ratio 2:1');
  const tall = fitSize({ shape: 'diamond', width: 200, height: 100, contentWidth: 50, contentHeight: 100, grid: 0 });
  assert.equal(tall.height, 200);
  assert.equal(tall.width, 400, 'the axis with the greater need sets the factor');
  const fits = fitSize({ shape: 'diamond', width: 400, height: 400, contentWidth: 100, contentHeight: 100, grid: 0 });
  assert.deepEqual(fits, { width: 400, height: 400 }, 'never shrinks');
  const snapped = fitSize({ shape: 'ellipse', width: 100, height: 100, contentWidth: 100, contentHeight: 10, grid: 20 });
  assert.equal(snapped.width % 20, 0);
  assert.ok(snapped.width >= 100 / 0.7);
  const circle = fitSize({ shape: 'circle', width: 100, height: 60, contentWidth: 70, contentHeight: 20, grid: 0 });
  assert.equal(circle.width, circle.height, 'a circle fits on a square');
  assert.equal(circle.width, Math.ceil(70 / CIRCLE_INNER));
});

test('outline style: defaults remove their keys, others persist, the dash array is screen pixels', async () => {
  const { dashArray } = await import('./build/pure.mjs');
  const dashed = withShape({ id: 'n', [STYLE_KEY]: { version: 1, fill: '1' } }, { strokeWidth: 3, strokeStyle: 'dashed' });
  assert.deepEqual(dashed[STYLE_KEY], { version: 1, fill: '1', strokeWidth: 3, strokeStyle: 'dashed' });
  const back = withShape(dashed, { strokeWidth: 2, strokeStyle: 'solid' });
  assert.deepEqual(back[STYLE_KEY], { version: 1, fill: '1' });
  assert.equal(dashArray(3, 'dashed'), '9 6');
  assert.equal(dashArray(2, 'dotted'), '0 4');
  assert.equal(dashArray(4, 'solid'), 'none');
});

test('fitSizeByArea keeps the text area at the current ratio and never shrinks', async () => {
  const { fitSizeByArea, AREA_MARGIN, INSETS } = await import('./build/pure.mjs');
  const fit = fitSizeByArea({ shape: 'diamond', width: 320, height: 220, contentWidth: 160, contentHeight: 935, grid: 0 });
  assert.ok(fit.width < 1200 && fit.height < 900, `an area fit stays near the need, got ${fit.width}x${fit.height}`);
  assert.ok(Math.abs(fit.width / fit.height - 320 / 220) < 0.02, 'the ratio holds');
  const inner = (fit.width * (1 - INSETS.diamond.left - INSETS.diamond.right)) * (fit.height * (1 - INSETS.diamond.top - INSETS.diamond.bottom));
  assert.ok(inner >= 160 * 935 * AREA_MARGIN - 1, 'the inner box holds the text area with its margin');
  assert.deepEqual(fitSizeByArea({ shape: 'diamond', width: 400, height: 400, contentWidth: 20, contentHeight: 20, grid: 0 }), { width: 400, height: 400 });
  const circle = fitSizeByArea({ shape: 'circle', width: 100, height: 100, contentWidth: 70, contentHeight: 70, grid: 10 });
  assert.equal(circle.width, circle.height);
  assert.equal(circle.width % 10, 0);
});
