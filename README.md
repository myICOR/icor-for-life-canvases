# ICOR for Life - Canvases

Obsidian's canvas, the way Heptabase does it. Draw on a canvas with a pen
and the ink saves into the .canvas file. Four tools in the controls
column: Select, Hand, Pen, Eraser. Shapes and colours for text cards.
Canvases inside canvases, with a breadcrumb back up. Hold Cmd (Ctrl on
Windows and Linux) and click a note card to open the note in the right
sidebar. Every note card gets two small buttons and, when it sits on more
than one canvas, a pill that lists the others. And under every note, and
in the Backlinks pane, a list of the canvases the note is on, the groups
it sits in, and what its card is connected to on each.

Part of the ICOR for Life suite. Source-available; see LICENSE.

## Install

Copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/icor-for-life-canvases/`, then enable the plugin
under Settings, Community plugins. Needs Obsidian 1.13.0 or newer, on
desktop and mobile. The core Canvas plugin must be on.

## The controls column and the tools

Open a canvas. The canvas's controls column sits at the left edge (the
setting "Controls column side" puts it back on the right). Under the
canvas's own settings and undo controls comes the plugin's tool group,
and under that the canvas's card menu (add card, add note, add media),
moved up from the bottom of the canvas with its drag-to-place behaviour
intact. The zoom controls sit at the bottom right instead (next
section).

| Control | Key | What it does |
| --- | --- | --- |
| Select | V | The canvas as it is: drag on empty canvas to select every card the rectangle touches (Shift adds to the selection); selected cards move, delete and group with the canvas's own behaviour. |
| Hand | H | Drag on the canvas to pan; clicks select nothing. A finger pans and pinches as it always did. |
| Pen | P | Draw. The pointer draws; the cards do not react to it. Escape goes back to Select. |
| Eraser | E | Touch a stroke to remove it. |
| Group | | Appears while two or more cards are selected: wraps them in a group with the same margin the canvas's own "Create group" leaves. |
| Colour | | Opens a flyout: Default, Red, Orange, Yellow, Green, Cyan, Purple, the canvas palette, so a theme that recolours the palette recolours the ink. |
| Width | | Opens a flyout: thin, medium, thick, as stroke previews. |
| Undo last stroke | | Removes the newest stroke. |
| Clear all strokes | | Click twice within five seconds to remove every stroke on the canvas. |

One tool is active per canvas; a canvas starts in Select. The keys work
while the canvas has focus and no text is being edited; on touch the
buttons are the only switch. A flyout closes on a press outside it,
Escape, a scroll, a wheel turn, or a choice.

Strokes are drawn in canvas coordinates, so they pan and zoom with the
cards. Points closer than 1.5 canvas units are dropped while you draw. A
pen that reports pressure (Apple Pencil, a Wacom) scales the stroke width
a little; a mouse or a trackpad does not. On a phone the control group is
not shown, because the column is full there; the commands below do the
same job from the mobile toolbar.

**A stylus always draws.** An Apple Pencil or other stylus starts a stroke
without switching to the Pen first, because the canvas ignores pen input
for panning and dragging anyway. The stylus's eraser end erases. A finger
or the mouse still pans and selects. Off under Settings, Ink.

The canvas's own undo and redo (Cmd+Z, Cmd+Shift+Z) include strokes,
because every stroke change goes through the canvas's own save path.

Commands, with no default hotkey: **Select tool**, **Hand tool**, **Pen
tool** (a toggle), **Eraser tool**, **Group the selection**, **Undo last
stroke**. All work on the canvas in the most recently focused tab.

## Zoom bar and minimap

Bottom right: **fit**, **zoom out**, the **live percentage**, **zoom
in**. Click the percentage for a flyout: show or hide the minimap (or
press M), fit to screen, 25%, 50%, 100%, 200%; a preset zooms around
the centre of the view. Commands: **Zoom to fit**, **Zoom to 100%**,
**Toggle minimap**.

Above the bar, the **minimap**: every card as a small rounded rectangle
in its colour, groups as outlines, the current view as a rectangle.
Click or drag on the map to move the view to that point; scroll on it
to zoom. Off under Settings, Canvas, "Minimap", or with M while the
canvas has focus. It leaves the page entirely when off.

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

## Shapes and colours for text cards

Select one text card. The canvas's floating toolbar above it gets three
more buttons:

| Button | What it opens |
| --- | --- |
| Switch shape | A grid of ten: card (the default), rectangle, rounded rectangle, ellipse, circle, diamond, triangle, parallelogram, speech bubble, star. |
| Fill colour | The six canvas colours, the card's own, none, and a custom colour. |
| Text colour | The six canvas colours, the card's own, and a custom colour. On a filled card without one, the text is dark or light by the fill's brightness. |

The outline is the card's own colour: the canvas's palette button, as
for any card. The shape is drawn behind the text, the text is inset into
the shape and centred, and the editor shows the fill through when you
double-click to edit. The card's context menu (right-click, long press)
has a **Shape** item with the same list for the keyboard. Note cards keep
their toolbar from 0.1.0 and are not shaped.

Where it is saved: on the card's own entry in the .canvas file, as
`"icorShape": "diamond"` and `"icorStyle": { "version": 1, "fill": "3",
"text": "#ffcc00" }`. Obsidian keeps unknown keys on a card across a
load, a save, undo, redo, copy and paste. A card with the default shape
and no colours carries neither key. Every key the plugin writes, with
its rules, is in `docs/canvas-format.md`.

## Canvases inside canvases

Right-click empty canvas (or long press): **New canvas here** creates a
.canvas file next to the parent, named "<parent> - 1" (the dialog lets
you change it), and places a card pointing at it where you clicked. The
card shows the child canvas the way Obsidian embeds one canvas in another;
double-click its label to open it.

Inside a canvas that sits on other canvases, a chip in the top corner
reads "in <parent>", one per parent. Click it to open the parent at this
canvas's card (Cmd-click for a new tab). The canvas's own "Create group"
sits in the same background menu, which is the Heptabase "section".

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

## Canvases under the note, and in the Backlinks pane

Every note that sits on a canvas gets a "Canvases" block at its end, next
to Obsidian's own "Backlinks in document" block, in reading view and in
editing view. It lists each canvas the note is on; click the canvas name
to open it at the note's card. Under the name, one muted line per group
the card sits in, innermost first ("in group Ideas", or "in group unnamed
group"); click it to open the canvas at the group. Then one row per
connection of that card:

| Glyph | Meaning |
| --- | --- |
| → | The card points to the other card. |
| ← | The other card points to this one. |
| ↔ | Arrows at both ends. |
| − | A line with no arrow. |

Then the other card's title (a note's name, the first line of a text card
cut to sixty characters, a link's URL, a group's label) and, muted, the
edge label. Click a row to open the canvas at that connection: the edge
selected, both cards in view. Cmd-click a note row to open that note in a
new tab instead; Cmd-click any other row to open the canvas at that card
in a new tab. The heading collapses the block. A note on no canvas shows
nothing. Off under Settings, Notes, "Show canvases under the note".

The core **Backlinks** pane carries the same rows as a third section,
"Canvases", under Linked mentions and Unlinked mentions, with the same
header look and a count. It follows the note the pane shows, pinned or
not. The command **Show canvases for this note** reveals the pane. (0.1.0
had a separate Canvases view; it is gone, and a leaf of it left in your
workspace is closed at startup.)

The index behind both is every .canvas file in the vault, read when the
plugin loads and again when a canvas file changes, appears, is renamed or
deleted. A canvas edited a moment ago shows up within a third of a
second. A canvas that sits on another canvas is placed like a note.

## Settings

| Setting | Default | What it governs |
| --- | --- | --- |
| Open in the right sidebar with | Cmd on macOS, Ctrl elsewhere | The key held while clicking a note card. Alt is the alternative. |
| Controls column side | Left | Which edge the canvas's controls column, and the tool group in it, sits on. |
| Minimap | On | The map above the zoom bar. |
| Toolbar on note cards | On | The two buttons and the pill on every note card. |
| Show canvases under the note | On | The block at the end of every note. |
| Pen colour | Default | The colour a canvas starts with when you pick up the pen. |
| Pen width | Medium | The width a canvas starts with. |
| A stylus always draws | On | A stylus draws without picking the Pen first. |
| Debug logging | Off | What the plugin did, in the developer console. Never the text of a note. |

Every setting appears in Obsidian's settings search.

## What this plugin reaches into

Obsidian publishes no API for the live canvas, only for the file format.
Opening notes, the menu items, the Backlinks section's content, the note
footer's content and the index are built on the public API and will not
break. Drawing, the tools, the card toolbar, modifier-click, the shape
buttons, "New canvas here" and zooming to a card or an edge read the
canvas object Obsidian keeps for each canvas view, which is not
published. All of that goes through one small module with a runtime check
for every member it uses; when an Obsidian update renames one, the
feature that needs it switches itself off with a notice, and the rest
keeps working. The list of members and how to re-check them is in
`docs/architecture.md`.

## Known limits

- **Export as image.** Whether the canvas's own "Export as image" includes
  the ink or the shape outlines is unverified.
- **Cards that are being edited.** With a card focused for editing,
  modifier-click inside it keeps its usual editor meaning; the sidebar
  opener steps aside there.
- **Text cards and links in the index.** The index reads file cards only.
  A note linked from inside a text card is not "on" the canvas for the
  index; Obsidian's own backlinks list that.
- **Phones.** The control group is not shown on a phone; the tool
  commands are. Tablets show it.
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
