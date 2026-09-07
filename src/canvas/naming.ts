/* The name of a new nested canvas, as one file name inside the parent's
 * folder. Pure, so the tests drive it. Obsidian's normalizePath and
 * Vault.create accept ".." (Vex, 1.13.7 bundle), so the segment check
 * lives here: no separator, no dot segment, no leading or trailing dot,
 * no control character, none of the characters the vault refuses, no
 * reserved Windows name. */

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
