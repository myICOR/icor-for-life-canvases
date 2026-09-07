/* One debug channel, off by default, and one degrade channel that is always
 * on. Debug lines say what the plugin did; they never echo note text. The
 * degrade channel fires once per missing private surface per session: a
 * Notice for the user and a console warning for whoever reads the console,
 * never a throw. Everything the plugin touches that Obsidian does not
 * publish goes through src/canvas/internals.ts and ends here when it is
 * missing. */
import { Notice } from 'obsidian';
import { PLUGIN_ID, PLUGIN_NAME } from './constants';

export function debugLog(enabled: boolean, message: string): void {
  if (enabled) console.debug(`[${PLUGIN_ID}] ${message}`);
}

const degraded = new Set<string>();

export function degrade(what: string): void {
  if (degraded.has(what)) return;
  degraded.add(what);
  console.warn(`[${PLUGIN_ID}] ${what} is not available in this Obsidian version; the feature that needs it is switched off.`);
  new Notice(`${PLUGIN_NAME}: ${what} is not available in this Obsidian version, so that feature is off. Details are in the developer console.`);
}

/* For tests and for a reload: the same surface degrades again. */
export function resetDegraded(): void {
  degraded.clear();
}
