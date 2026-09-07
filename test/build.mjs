/* One bundle feeds the gate: the pure surface (the file format, the ink
 * model, the index parser, the settings model and table), which imports
 * neither `obsidian` nor the DOM. */
import { buildPure } from './lib/build-pure.mjs';

await buildPure();
