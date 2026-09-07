# ICOR for Life - Canvases

Four things for the canvas, the way Heptabase does them. Draw on a canvas
with a pen and the ink saves into the .canvas file. Hold Cmd (Ctrl on
Windows and Linux) and click a note card to open the note in the right
sidebar. Every note card gets two small buttons, open in a new tab and
open in the right sidebar, and a note that sits on more than one canvas
gets a pill in the corner that lists the others. And under every note,
and in a sidebar view, a list of the canvases the note is on and what its
card is connected to on each, with the arrow direction and the edge label.

Part of the ICOR for Life suite. Source-available; see LICENSE.

## Install

Copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/icor-for-life-canvases/`, then enable the plugin
under Settings, Community plugins. Needs Obsidian 1.13.0 or newer, on
desktop and mobile. The core Canvas plugin must be on.

## Ink

Open a canvas. A new group sits at the bottom of the controls column on the
right, styled like the zoom and undo controls above it:

| Control | What it does |
| --- | --- |
| Pencil | Drawing mode on or off. On, the pointer draws; the cards do not react to it. Escape switches it off. |
| Eraser | Erasing mode on or off. Touch a stroke to remove it. |
| Colour | Cycles Default, Red, Orange, Yellow, Green, Cyan, Purple: the canvas palette, the same colours cards and edges use, so a theme that recolours the palette recolours the ink. |
| Width | Cycles thin, medium, thick. |
| Undo last stroke | Removes the newest stroke. |
| Clear all strokes | Click twice within five seconds to remove every stroke on the canvas. |

Strokes are drawn in canvas coordinates, so they pan and zoom with the
cards. Points closer than 1.5 canvas units are dropped while you draw. A
pen that reports pressure (Apple Pencil, a Wacom) scales the stroke width
a little; a mouse or a trackpad does not. On a phone the control group is
not shown, because the column is full there; the two commands below do
the same job from the mobile toolbar.

**A stylus always draws.** An Apple Pencil or other stylus starts a stroke
without switching drawing mode on first, because the canvas ignores pen
input for panning and dragging anyway. The stylus's eraser end erases. A
finger or the mouse still pans and selects. Off under Settings, Ink.

The canvas's own undo and redo (Cmd+Z, Cmd+Shift+Z) include strokes,
because every stroke change goes through the canvas's own save path.

Two commands, with no default hotkey: **Toggle drawing mode** and **Undo
last stroke**. Both work on the canvas in the most recently focused tab.

### Where the ink is saved

In the .canvas file itself, under one top-level key:

```
"metadata": {
  "icorCanvases": {
    "version": 1,
    "strokes": [
      { "id": "…", "color": "1", "width": 4, "points": [x, y, x, y, …] }
    ]
  }
}
```

Obsidian keeps unknown top-level keys of a canvas file across a load and a
save, and the JSON Canvas format promises the same, so the ink travels
with the file through sync, git and a rename. Any other tool reading the
file ignores the key. A canvas with no strokes carries no key.

## Open in the right sidebar

Hold Cmd (macOS) or Ctrl (Windows, Linux) and click a note card: the note
opens in the right sidebar. The modifier can be Alt instead, under
Settings, Canvas. Shift keeps its usual meaning (add the card to the
selection), and the small label above a card keeps Obsidian's own
behaviour, where Cmd-click opens the note in a new tab.

The same two actions, **Open in right sidebar** and **Open in new tab**,
are in the card's context menu (right-click, or long press on a phone).

## The card toolbar

Move the pointer over a note card, or select it, and two buttons appear in
its top left corner: open the note in a new tab, open it in the right
sidebar. They keep their size while the canvas zooms and hide while the
canvas is zoomed far out. Off under Settings, Canvas, "Toolbar on note
cards".

A note that is on more than one canvas also gets a pill in the top right
corner, "Appears in 2 canvases". Click it for a menu of every canvas the
note is on, the current one ticked; choose another and that canvas opens
in the current tab (Cmd-click for a new tab) with the note's card selected
and zoomed to.

## Canvases under the note, and the sidebar view

Every note that sits on a canvas gets a "Canvases" block at its end, next
to Obsidian's own "Backlinks in document" block, in reading view and in
editing view. It lists each canvas the note is on; click the canvas name
to open it at the note's card. Under each canvas, one row per connection
of that card:

| Glyph | Meaning |
| --- | --- |
| → | The card points to the other card. |
| ← | The other card points to this one. |
| ↔ | Arrows at both ends. |
| − | A line with no arrow. |

Then the other card's title (a note's name, the first line of a text card
cut to sixty characters, a link's URL, a group's label) and, muted, the
edge label. Click a note row to open that note (Cmd-click for a new tab);
click any other row to open the canvas at that card. The heading
collapses the block. A note on no canvas shows nothing. Off under
Settings, Notes, "Show canvases under the note".

The sidebar view shows the same rows for the active note and follows it
as you move between notes. Open it with the ribbon icon or the command
**Open canvases panel**. A note on no canvas reads "Not on any canvas".

The index behind both is every .canvas file in the vault, read when the
plugin loads and again when a canvas file changes, appears, is renamed or
deleted. A canvas edited a moment ago shows up within a third of a
second.

## Settings

| Setting | Default | What it governs |
| --- | --- | --- |
| Open in the right sidebar with | Cmd on macOS, Ctrl elsewhere | The key held while clicking a note card. Alt is the alternative. |
| Toolbar on note cards | On | The two buttons and the pill on every note card. |
| Show canvases under the note | On | The block at the end of every note. |
| Pen colour | Default | The colour a canvas starts with when you pick up the pencil. |
| Pen width | Medium | The width a canvas starts with. |
| A stylus always draws | On | A stylus draws without drawing mode on. |
| Debug logging | Off | What the plugin did, in the developer console. Never the text of a note. |

Every setting appears in Obsidian's settings search.

## What this plugin reaches into

Obsidian publishes no API for the live canvas, only for the file format.
Opening notes, the menu items, the sidebar view, the note footer's content
and the index are built on the public API and will not break. Drawing,
the card toolbar, modifier-click and zooming to a card read the canvas
object Obsidian keeps for each canvas view, which is not published. All of
that goes through one small module with a runtime check for every member
it uses; when an Obsidian update renames one, the feature that needs it
switches itself off with a notice, and the rest keeps working. The list of
members and how to re-check them is in `docs/architecture.md`.

## Known limits

- **Export as image.** Whether the canvas's own "Export as image" includes
  the ink is unverified. If it does not, that is a known gap, not a bug in
  your file.
- **Cards that are being edited.** With a card focused for editing,
  modifier-click inside it keeps its usual editor meaning; the sidebar
  opener steps aside there.
- **Text cards and links in the index.** The index reads file cards only.
  A note linked from inside a text card is not "on" the canvas for the
  index; Obsidian's own backlinks pane lists that.
- **Very large ink.** The whole canvas file is written on every stroke and
  on every card move. A canvas with thousands of strokes writes a larger
  file each time; the point gap keeps strokes compact, but the count is
  yours.

## Development

```
npm install
npm run gate      # typecheck, build, lint, tests
npm run dev       # rebuild on change
```

`src/canvas/internals.ts` is the one door to the private canvas API. Every
other module asks it for the members it needs by name and stays off when
one is missing. `test/hygiene.test.mjs` checks that no other file names a
private member, that no text in the repo carries an em or en dash, and
that every class and every stylesheet value follows the suite's rules.
