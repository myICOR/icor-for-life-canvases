/* Text properties of the repo: what the directory's scanner reads, what the
 * team's hard rules say, and what the private-API discipline requires. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(repo, f), 'utf8');

function walk(dir, exts) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'build' || name === 'node_modules') continue;
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

/* Every text file in the repo except this one, which carries the very
   strings it forbids. */
const self = resolve(repo, 'test/hygiene.test.mjs');
const textFiles = ['README.md', 'CHANGELOG.md', 'SECURITY.md', 'THIRD-PARTY-NOTICES.md', 'CONTRIBUTING.md', 'LICENSE', 'manifest.json', 'package.json', 'styles.css', 'esbuild.config.mjs', 'eslint.config.mjs']
  .map((f) => resolve(repo, f))
  .concat(walk(resolve(repo, 'src'), ['.ts']), walk(resolve(repo, 'test'), ['.mjs', '.ts']), walk(resolve(repo, 'docs'), ['.md']), walk(resolve(repo, '.github'), ['.yml']))
  .filter((f) => f !== self);

const sources = walk(resolve(repo, 'src'), ['.ts']);
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('no em dash or en dash anywhere in the repo text', () => {
  const hits = [];
  for (const f of textFiles) {
    for (const [i, line] of readFileSync(f, 'utf8').split('\n').entries()) {
      if (/[—–]/.test(line)) hits.push(`${f.slice(repo.length + 1)}:${i + 1}`);
    }
  }
  assert.deepEqual(hits, [], `dashes at:\n  ${hits.join('\n  ')}`);
});

test('the plugin touches no global it should not and writes no raw HTML or inline style', () => {
  const banned = [
    [/vault\.config/, 'app.vault.config'],
    [/app\.plugins\b/, 'app.plugins'],
    [/internalPlugins/, 'app.internalPlugins'],
    [/window\.event/, 'window.event'],
    [/\bprocess\./, 'Node process'],
    [/\bdocument\./, 'the global document'],
    [/\bsetTimeout\(|\bsetInterval\(/, 'a bare timer'],
    [/console\.(log|info|error)\(/, 'console output outside the debug and degrade channels'],
    [/\beval\(|new Function\(/, 'dynamic code'],
    [/\.style\.[a-zA-Z]+\s*=/, 'an inline style write'],
    [/innerHTML|outerHTML/, 'raw HTML'],
    [/\bfetch\(|XMLHttpRequest|WebSocket|requestUrl/, 'a network call'],
    [/from ['"](node:)?(fs|child_process|path|os)['"]/, 'a Node module'],
    [/\(\?<[=!]/, 'a regex lookbehind'],
    [/!important/, '!important'],
    [/\bactiveLeaf\b/, 'the deprecated activeLeaf'],
  ];
  for (const f of sources) {
    const text = stripComments(readFileSync(f, 'utf8'));
    for (const [re, what] of banned) assert.doesNotMatch(text, re, `${f.slice(repo.length + 1)} uses ${what}`);
  }
  const warn = sources.filter((f) => /console\.warn\(/.test(stripComments(readFileSync(f, 'utf8'))));
  assert.deepEqual(warn.map((f) => f.slice(repo.length + 1)), ['src/log.ts'], 'console.warn lives in the degrade channel only');
});

test('every private canvas member is named in internals.ts and guarded before use', () => {
  /* The members the adapter declares are the whole private surface; a
     feature asks for them by name through requireCanvas, and the registry
     is the only caller that binds features. */
  const internals = read('src/canvas/internals.ts');
  const declared = [...internals.matchAll(/^\s{2}(\w+): '(function|element|map|set|object|boolean)',$/gm)].map((m) => m[1]);
  assert.ok(declared.length >= 15, 'the member table is present');
  const registry = read('src/canvas/registry.ts');
  const ink = read('src/canvas/ink.ts');
  const requested = new Set();
  for (const m of [...registry.matchAll(/requireCanvas\(canvas, \[([^\]]*)\]/g), ...ink.matchAll(/INK_MEMBERS[^=]*= \[([^\]]*)\]/g)]) {
    for (const name of m[1].matchAll(/'(\w+)'/g)) requested.add(name[1]);
  }
  for (const name of requested) assert.ok(declared.includes(name), `${name} is requested but not declared in the member table`);
  /* No feature module reaches for `view.canvas` on its own. */
  for (const f of sources) {
    if (f.endsWith('/internals.ts')) continue;
    const text = stripComments(readFileSync(f, 'utf8'));
    assert.doesNotMatch(text, /as any\b/, `${f.slice(repo.length + 1)} casts to any`);
    assert.doesNotMatch(text, /\bcanvas\.menu\b|canvasControlsEl|nodeInteractionLayer/, `${f.slice(repo.length + 1)} names a private member outside the adapter`);
  }
});

test('every class the plugin adds carries the icor-canvases- prefix, apart from the borrowed canvas control classes', () => {
  /* The canvas control classes, and the Backlinks pane's own header and
     container classes, so the theme styles the plugin's section like the
     pane's two. */
  const borrowed = new Set([
    'canvas-control-group', 'mod-raised', 'canvas-control-item', 'is-empty', 'is-active', 'is-erasing', 'is-collapsed',
    'tree-item-self', 'is-clickable', 'tree-item-icon', 'collapse-icon', 'tree-item-inner', 'tree-item-flair-outer', 'tree-item-flair', 'search-result-container', 'search-empty-state',
    'canvas-submenu', 'canvas-color-picker-item',
  ]);
  for (const f of sources) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/(?:addClass|cls:)\s*\(?\s*(\[[^\]]*\]|'[^']+'|`[^`]+`)/g)) {
      for (const cls of m[1].matchAll(/['`]([^'`]+)['`]/g)) {
        const name = cls[1].replace(/\$\{[^}]*\}/g, 'x');
        assert.ok(name.startsWith('icor-canvases-') || borrowed.has(name) || /^(is|mod-canvas-color)-x$/.test(name), `${f.slice(repo.length + 1)}: class ${name}`);
      }
    }
  }
});

test('the stylesheet: prefixed selectors, Obsidian variables only, no hex, no pixel, no !important', () => {
  const css = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'a hex colour');
  assert.doesNotMatch(css, /!important/);
  assert.doesNotMatch(css, /\d(px|em|rem)\b/, 'a literal length; sizes come from --size-* and --radius-*');
  for (const m of css.matchAll(/([^{}]+)\{/g)) {
    for (const selector of m[1].split(',')) {
      assert.match(selector.trim(), /icor-canvases-/, `selector ${selector.trim()} does not carry the prefix`);
    }
  }
  for (const m of css.matchAll(/(?:^|[\s;{])(color|background[a-z-]*|z-index|font-weight|height|width|border-radius|stroke)\s*:\s*([^;]+);/g)) {
    assert.match(m[2].trim(), /^var\(--|^calc\(|^\d+%?$|^currentColor$|^none$|^transparent$|^fit-content$/, `${m[1]}: ${m[2].trim()} is not an Obsidian variable`);
  }
  /* The icon stroke widths are unitless SVG numbers, the one literal the
     sheet carries on purpose. */
  for (const m of css.matchAll(/stroke-width\s*:\s*([^;]+);/g)) assert.match(m[1].trim(), /^\d+(\.\d+)?$/);
});

test('the built plugin bundles nothing but its own code', () => {
  const main = read('main.js');
  assert.match(main, /require\("obsidian"\)/);
  assert.doesNotMatch(main, /node_modules/, 'a dependency was bundled');
  assert.ok(main.length < 64000, `main.js is ${main.length} bytes; expected a small plugin`);
});
