export const PLUGIN_ID = 'icor-for-life-canvases';
export const PLUGIN_NAME = 'ICOR for Life - Canvases';
/* Every DOM class this plugin ever adds starts with this, apart from the two
   canvas control classes it borrows on purpose so the theme styles the ink
   controls like the canvas's own (see src/canvas/ink.ts). */
export const CLASS_PREFIX = 'icor-canvases-';
/* The sidebar view 0.1.0 registered. Retired in 0.2.0 (the Backlinks pane
   carries the section now); the type is kept only to detach a leaf of it
   left in a workspace. */
export const VIEW_TYPE = 'icor-canvases';
/* The key under `metadata` in a .canvas file that holds this plugin's ink. */
export const METADATA_KEY = 'icorCanvases';
export const METADATA_VERSION = 1;
