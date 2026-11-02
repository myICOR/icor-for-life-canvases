/* The name of a nested canvas is one file name inside the parent's folder;
 * Obsidian's own normalizePath and Vault.create let ".." through (Vex,
 * 1.13.7), so the plugin refuses it here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { childName, inScratchpad, scratchpadPrefix, staysInVault, validateCanvasName, withPrefix } from './build/pure.mjs';

test("Vex's four typed names are refused, and so are the other escapes", () => {
  const bad = ['../escape', '../../escape', 'nested/child', '..\\escape', '', '  ', '.', '..', '.hidden', 'name.', 'a:b', 'a"b', 'a|b', 'con', 'LPT1', 'tab\there', 'nul '];
  for (const name of bad) {
    const v = validateCanvasName(name);
    assert.equal(v.ok, false, `${JSON.stringify(name)} must be refused`);
    assert.ok(v.reason.length > 0);
  }
});

test('a plain name passes, trimmed, and stays a single segment', () => {
  assert.deepEqual(validateCanvasName('  Ideas - 2  '), { ok: true, name: 'Ideas - 2' });
  assert.equal(validateCanvasName('Plan (draft) #3').ok, true);
  assert.equal(validateCanvasName('Ünïcode name').ok, true);
});

test('childName never contains a separator and staysInVault refuses a dot segment', () => {
  assert.equal(childName('Map', () => false), 'Map - 1');
  assert.equal(childName('Map', (n) => n === 'Map - 1'), 'Map - 2');
  assert.equal(childName('Map', () => false).includes('/'), false);
  assert.equal(staysInVault('Sub/Map - 1.canvas'), true);
  assert.equal(staysInVault('Sub/../../escape.canvas'), false);
  assert.equal(staysInVault('../escape.canvas'), false);
});

/* Tool Lab item 17. Scaffold Check's toolbar-canvas shape, copied from
   icor-for-life-scaffold-check main.js SCRATCHPAD_SHAPES: a name typed over
   the prefill was read as a subject note in the capture room. */
const SCAFFOLD_CANVAS = /^\d{4}-\d{2}-\d{2}_canvas([-_ ].*)?\.canvas$/;

test('the Daily Scratchpad is the room and everything under it, and nothing that only looks like it', () => {
  assert.equal(inScratchpad('00 Daily Scratchpad'), true);
  assert.equal(inScratchpad('00 Daily Scratchpad/2026/11'), true);
  assert.equal(inScratchpad('00 Daily Scratchpad Old'), false);
  assert.equal(inScratchpad('Archive/00 Daily Scratchpad'), false);
  assert.equal(inScratchpad('04 Inner World/Notes'), false);
  assert.equal(inScratchpad(''), false);
});

test('the prefix locks in the Daily Scratchpad and nowhere else', () => {
  assert.equal(scratchpadPrefix('2026-11-02_canvas', '00 Daily Scratchpad/2026/11'), '2026-11-02_canvas - ');
  assert.equal(scratchpadPrefix('Map', '04 Inner World/Notes'), null);
});

test('a name typed in the Daily Scratchpad keeps the prefix and passes Scaffold Check', () => {
  const prefix = '2026-11-02_canvas - ';
  assert.equal(withPrefix(prefix, 'Project ideas'), '2026-11-02_canvas - Project ideas');
  assert.equal(withPrefix(prefix, '  1 '), '2026-11-02_canvas - 1');
  assert.equal(withPrefix(prefix, '2026-11-02_canvas - pasted whole'), '2026-11-02_canvas - pasted whole');
  assert.match(`${withPrefix(prefix, 'Project ideas')}.canvas`, SCAFFOLD_CANVAS);
  assert.match(`${withPrefix('2026-11-02_canvas - 1 - ', 'deeper')}.canvas`, SCAFFOLD_CANVAS);
  assert.doesNotMatch('Project ideas.canvas', SCAFFOLD_CANVAS, 'what an unlocked name did');
});

test('an empty or unsafe suffix is still refused once the prefix is on', () => {
  const prefix = '2026-11-02_canvas - ';
  assert.equal(validateCanvasName(withPrefix(prefix, '   ')).ok, false);
  assert.equal(validateCanvasName(withPrefix(prefix, '../escape')).ok, false);
  assert.equal(validateCanvasName(withPrefix(prefix, 'a:b')).ok, false);
});
