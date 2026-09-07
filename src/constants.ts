export const PLUGIN_ID = 'icor-for-life-canvases';
export const PLUGIN_NAME = 'ICOR for Life - Canvases';
/* Every DOM class this plugin ever adds starts with this, apart from the two
   canvas control classes it borrows on purpose so the theme styles the ink
   controls like the canvas's own (see src/canvas/ink.ts). */
export const CLASS_PREFIX = 'icor-canvases-';
/* The sidebar view. */
export const VIEW_TYPE = 'icor-canvases';
/* The key under `metadata` in a .canvas file that holds this plugin's ink. */
export const METADATA_KEY = 'icorCanvases';
export const METADATA_VERSION = 1;
