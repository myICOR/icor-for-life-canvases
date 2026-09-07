/* Identity and floor. One id across the manifest, the package and the
 * constant; one version across three files; a description the directory
 * accepts; every named import from 'obsidian' present at the declared
 * minAppVersion, read from the @since annotations in obsidian.d.ts, the
 * same source the directory's scanner reads; bare command ids; and every
 * setting with exactly one row. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEFAULT_SETTINGS, PLUGIN_ID, PLUGIN_NAME, SETTING_ROWS, VIEW_TYPE, normaliseSettings, settingKeys } from './build/pure.mjs';

const repo = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(repo, f), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(read('package.json'));
const versions = JSON.parse(read('versions.json'));

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const cmp = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
};

test('one identity across manifest, package and constants', () => {
  assert.equal(manifest.id, 'icor-for-life-canvases');
  assert.equal(PLUGIN_ID, manifest.id);
  assert.equal(pkg.name, manifest.id);
  assert.equal(manifest.name, 'ICOR for Life - Canvases');
  assert.equal(PLUGIN_NAME, manifest.name);
  assert.equal(manifest.author, 'myICOR');
  assert.equal(manifest.authorUrl, 'https://myicor.com');
  assert.equal(manifest.isDesktopOnly, false, 'nothing here needs Node or Electron');
  /* The floor: the settings page is declared through
     getSettingDefinitions(), a 1.13.0 API, and the private canvas surface
     was read on 1.13.7 only. */
  assert.equal(manifest.minAppVersion, '1.13.0');
  assert.doesNotMatch(manifest.id, /obsidian|plugin$/);
  assert.equal(VIEW_TYPE, 'icor-canvases');
});

test('the description is under 250 characters, ends with a period, and never names the app', () => {
  assert.ok(manifest.description.length < 250, `${manifest.description.length} characters`);
  assert.ok(manifest.description.endsWith('.'));
  assert.doesNotMatch(manifest.description, /obsidian/i);
});

test('one version across manifest, package and versions.json', () => {
  assert.equal(pkg.version, manifest.version);
  assert.equal(versions[manifest.version], manifest.minAppVersion);
});

test('every named import from obsidian exists at minAppVersion', () => {
  const dts = read('node_modules/obsidian/obsidian.d.ts');
  const since = new Map();
  for (const m of dts.matchAll(/\/\*\*([^]*?)\*\/\s*export (?:abstract )?(?:class|function|interface|type|const|enum|let|var) (\w+)/g)) {
    const s = m[1].match(/@since (\d+\.\d+\.\d+)/);
    if (s && !since.has(m[2])) since.set(m[2], s[1]);
  }
  const floor = manifest.minAppVersion;
  const offenders = [];
  for (const file of walk(resolve(repo, 'src'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/import (?:type )?\{([^}]*)\} from 'obsidian'/g)) {
      for (const raw of m[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/)[0];
        if (!name) continue;
        const s = since.get(name);
        if (s && cmp(s, floor) > 0) offenders.push(`${name} (@since ${s}) in ${file.slice(repo.length + 1)}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `newer than minAppVersion ${floor}:\n  ${offenders.join('\n  ')}`);
});

test('commands: bare ids, sentence case, icons, no default hotkeys', () => {
  const src = read('src/main.ts');
  const ids = [...src.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['toggle-drawing-mode', 'select-tool', 'hand-tool', 'eraser-tool', 'group-selection', 'undo-last-stroke', 'open-canvases-panel']);
  for (const id of ids) assert.doesNotMatch(id, /icor|canvases:|:/, `${id} carries a prefix`);
  const names = [...src.matchAll(/name: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(names.length, ids.length);
  for (const name of names) {
    assert.match(name, /^[A-Z][a-z]/, `${name} is not sentence case`);
    assert.doesNotMatch(name.slice(1), /\b[A-Z][a-z]+/, `${name} has a capital mid-sentence`);
  }
  assert.equal([...src.matchAll(/icon: /g)].length, ids.length, 'every command has an icon');
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ''), /hotkeys:/, 'a default hotkey');
});

test('every setting has exactly one row and a default the normaliser keeps', () => {
  const keys = settingKeys();
  assert.deepEqual([...keys].sort(), Object.keys(DEFAULT_SETTINGS).sort());
  assert.equal(new Set(keys).size, keys.length, 'a setting with two rows');
  assert.deepEqual(normaliseSettings(DEFAULT_SETTINGS), DEFAULT_SETTINGS);
  assert.deepEqual(normaliseSettings({ modifier: 'shift', penColor: 'pink', penWidth: 9, footer: 'yes' }), DEFAULT_SETTINGS, 'bad values fall back');
  assert.deepEqual(normaliseSettings({ modifier: 'alt', controlsSide: 'right', penColor: '3', penWidth: 'thick', footer: false, toolbar: false, penDraws: false, debug: true }), {
    modifier: 'alt',
    controlsSide: 'right',
    penColor: '3',
    penWidth: 'thick',
    footer: false,
    toolbar: false,
    penDraws: false,
    debug: true,
  });
  for (const row of SETTING_ROWS) {
    assert.match(row.name, /^[A-Z]/, `${row.key}: name`);
    assert.ok(row.desc.endsWith('.'), `${row.key}: description ends with a period`);
    if (row.type === 'dropdown') assert.ok(Object.keys(row.options).includes(String(DEFAULT_SETTINGS[row.key])), `${row.key}: the default is an option`);
  }
});

test('the release assets exist and the release notes for this version are written', () => {
  for (const f of ['manifest.json', 'styles.css', 'README.md', 'CHANGELOG.md', 'SECURITY.md', 'THIRD-PARTY-NOTICES.md', 'LICENSE', 'docs/architecture.md', `docs/releases/${manifest.version}.md`, '.github/workflows/release.yml']) {
    assert.ok(statSync(resolve(repo, f)).isFile(), `${f} is missing`);
  }
  assert.match(read('CHANGELOG.md'), new RegExp(`## \\[${manifest.version.replace(/\\./g, '\\.')}\\]`));
  assert.match(read('docs/architecture.md'), /1\.13\.7/, 'the architecture doc names the bundle it was verified against');
});
