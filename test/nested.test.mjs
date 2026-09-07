/* The name of a nested canvas is one file name inside the parent's folder;
 * Obsidian's own normalizePath and Vault.create let ".." through (Vex,
 * 1.13.7), so the plugin refuses it here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { childName, staysInVault, validateCanvasName } from './build/pure.mjs';

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
