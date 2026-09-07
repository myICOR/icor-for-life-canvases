/* The settings page as data. The settings tab's `getSettingDefinitions()`
 * draws from this table, and the tests read it to prove every setting has
 * exactly one row. */
import { INK_COLOR_NAMES } from '../canvas/inkModel';
import type { CanvasesSettings } from './model';

export type SettingGroup = 'Canvas' | 'Notes' | 'Ink' | 'Advanced';

export interface ToggleRow {
  type: 'toggle';
  group: SettingGroup;
  key: keyof CanvasesSettings;
  name: string;
  desc: string;
}

export interface DropdownRow {
  type: 'dropdown';
  group: SettingGroup;
  key: keyof CanvasesSettings;
  name: string;
  desc: string;
  options: Record<string, string>;
}

export type SettingRow = ToggleRow | DropdownRow;

export const SETTING_GROUPS: readonly SettingGroup[] = ['Canvas', 'Notes', 'Ink', 'Advanced'];

export const SETTING_ROWS: readonly SettingRow[] = [
  {
    type: 'dropdown',
    group: 'Canvas',
    key: 'modifier',
    name: 'Open in the right sidebar with',
    desc: 'The key to hold while clicking a note on a canvas to open it in the right sidebar. Shift keeps its usual meaning (add to the selection).',
    options: {
      mod: 'Cmd on macOS, Ctrl elsewhere',
      alt: 'Alt (Option on macOS)',
    },
  },
  {
    type: 'toggle',
    group: 'Canvas',
    key: 'toolbar',
    name: 'Toolbar on note cards',
    desc: 'Two buttons on every note card, shown while the pointer is over it or the card is selected: open the note in a new tab, open it in the right sidebar. A note that sits on more than one canvas also gets a pill in the top right corner that lists the other canvases.',
  },
  {
    type: 'toggle',
    group: 'Notes',
    key: 'footer',
    name: 'Show canvases under the note',
    desc: 'A block at the end of every note, next to the "Backlinks in document" block, listing each canvas the note is on and what its card is connected to there. Nothing is shown for a note that is on no canvas. The sidebar view shows the same rows for the active note whatever this is set to.',
  },
  {
    type: 'dropdown',
    group: 'Ink',
    key: 'penColor',
    name: 'Pen colour',
    desc: 'The colour a canvas starts with when you pick up the pencil. The canvas palette, as used for cards and edges; "Default" is the text colour of the theme.',
    options: {
      default: INK_COLOR_NAMES[''],
      '1': INK_COLOR_NAMES['1'],
      '2': INK_COLOR_NAMES['2'],
      '3': INK_COLOR_NAMES['3'],
      '4': INK_COLOR_NAMES['4'],
      '5': INK_COLOR_NAMES['5'],
      '6': INK_COLOR_NAMES['6'],
    },
  },
  {
    type: 'dropdown',
    group: 'Ink',
    key: 'penWidth',
    name: 'Pen width',
    desc: 'The stroke width a canvas starts with. Strokes are drawn in canvas units and zoom with the cards. A pen that reports pressure scales the width a little.',
    options: {
      thin: 'Thin',
      medium: 'Medium',
      thick: 'Thick',
    },
  },
  {
    type: 'toggle',
    group: 'Ink',
    key: 'penDraws',
    name: 'A stylus always draws',
    desc: 'An Apple Pencil or other stylus draws a stroke without switching drawing mode on first; a finger or the mouse still pans and selects. The stylus\'s eraser end erases. Off, the stylus behaves like a finger until drawing mode is on.',
  },
  {
    type: 'toggle',
    group: 'Advanced',
    key: 'debug',
    name: 'Debug logging',
    desc: 'Writes what the plugin did (canvases wired, strokes saved, index rebuilt) to the developer console. Never the text of a note.',
  },
];

export function settingKeys(): (keyof CanvasesSettings)[] {
  return SETTING_ROWS.map((r) => r.key);
}

export function rowsIn(group: SettingGroup): SettingRow[] {
  return SETTING_ROWS.filter((r) => r.group === group);
}
