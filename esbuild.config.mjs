/* Build ICOR for Life - Canvases into a single CommonJS main.js for Obsidian.
 *
 * Everything the plugin needs at runtime comes from the host: `obsidian` is
 * external, so main.js carries only this plugin's own code. styles.css is
 * hand-written and small: the theme owns how a canvas looks, and the ink
 * controls borrow the canvas's own control classes so the theme styles
 * them too. */
import esbuild from 'esbuild';
import process from 'node:process';

const production = process.argv[2] === 'production';

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'main.js',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  logLevel: 'info',
  treeShaking: true,
  sourcemap: production ? false : 'inline',
  minify: production,
  external: ['obsidian'],
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
