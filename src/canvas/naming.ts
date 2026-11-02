/* The name of a new nested canvas, as one file name inside the parent's
 * folder. Pure, so the tests drive it. Obsidian's normalizePath and
 * Vault.create accept ".." (Vex, 1.13.7 bundle), so the segment check
 * lives here: no separator, no dot segment, no leading or trailing dot,
 * no control character, none of the characters the vault refuses, no
 * reserved Windows name. */

/* The capture room, which Scaffold Check names the same way. */
const SCRATCHPAD_ROOM = '00 Daily Scratchpad';

const FORBIDDEN = /[\\/:*?"<>|]/;
// eslint-disable-next-line no-control-regex -- the class is the control range the vault refuses in a name
const CONTROL = /[\u0000-\u001f]/;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

export type NameVerdict = { ok: true; name: string } | { ok: false; reason: string };

export function validateCanvasName(raw: string): NameVerdict {
  const name = raw.trim();
  if (!name) return { ok: false, reason: 'The name is empty.' };
  if (name === '.' || name === '..') return { ok: false, reason: 'The name cannot be a dot segment.' };
  if (name.startsWith('.')) return { ok: false, reason: 'The name cannot start with a dot.' };
  if (name.endsWith('.')) return { ok: false, reason: 'The name cannot end with a dot.' };
  if (FORBIDDEN.test(name)) return { ok: false, reason: 'The name is one file name: no slash, backslash, colon, quotes, or * ? < > |.' };
  if (CONTROL.test(name)) return { ok: false, reason: 'The name cannot carry control characters.' };
  if (RESERVED.test(name)) return { ok: false, reason: 'That name is reserved on some systems.' };
  return { ok: true, name };
}

/* True when a vault path stays inside the vault: no segment is "..". */
export function staysInVault(path: string): boolean {
  return !path.split('/').includes('..');
}

/* The first free "<parent> - n" in the parent's folder. */
export function childName(parentBasename: string, taken: (name: string) => boolean): string {
  for (let n = 1; n < 10000; n++) {
    const name = `${parentBasename} - ${n}`;
    if (!taken(name)) return name;
  }
  return `${parentBasename} - ${Date.now()}`;
}

export function inScratchpad(folder: string): boolean {
  return folder === SCRATCHPAD_ROOM || folder.startsWith(`${SCRATCHPAD_ROOM}/`);
}

/* The part of the name the user cannot change, or null when all of it is
   theirs. The Daily Scratchpad takes dated names only: Scaffold Check accepts
   `YYYY-MM-DD_canvas...` there and reads any other name as a note about a
   subject, so a nested canvas keeps its parent's name in front. */
export function scratchpadPrefix(parentBasename: string, folder: string): string | null {
  return inScratchpad(folder) ? `${parentBasename} - ` : null;
}

/* The whole name from what was typed after the prefix. Nothing typed stays
   nothing, so the validator refuses it. A pasted whole name keeps one prefix. */
export function withPrefix(prefix: string, typed: string): string {
  const suffix = typed.trim();
  if (!suffix) return '';
  return suffix.startsWith(prefix) ? suffix : `${prefix}${suffix}`;
}
