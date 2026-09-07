# Changelog

All notable changes to ICOR for Life - Canvases.
Tom is the maintainer; Flint is the platform review and Vex the security
audit every release goes through before its tag.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

## [0.3.1] - 2026-09-07

The directory's scan of 0.3.0, before the listing.

### Changed
- **Shapes are SVG geometry.** Every shape but the rectangle and the
  rounded rectangle is drawn as one SVG layer behind the card's content
  (an ellipse, a polygon, a path for the speech bubble), stretched to
  the card, with the fill and a screen-constant stroke; the stylesheet
  uses no `clip-path`, which the scanner flags as partially supported.
  Insets, the frame, the overflow pill and Fit shape to text are as
  before.
- **No vault enumeration.** The index discovers canvas files through
  the metadata cache (`resolvedLinks` names every canvas with a card or
  a link on it) and the vault's own events, never through
  `vault.getFiles`. A canvas with nothing on it has nothing to index.

## [0.3.0] - 2026-09-07

The first public release. 0.1.0 and 0.2.0 below were internal builds
that never shipped; everything in them ships here. Tom's second round,
five findings on the shapes, Flint's reviews of 0.2.0 and 0.3.0, and
Tom's live test of the 0.3.0 build.

### Added
- **The card menu in the column.** The canvas's bottom menu (add card,
  add note, add media) sits in the controls column under the tool group,
  the same elements with their drag-to-place behaviour; the bottom of
  the canvas is clear.
- **Zoom bar at the bottom right.** Fit, zoom out, the live percentage,
  zoom in. The percentage follows the zoom and opens a flyout: show or
  hide the minimap (M), fit to screen, 25, 50, 100 and 200 percent,
  each zooming around the centre of the view. Commands: Zoom to fit,
  Zoom to 100%, Toggle minimap.
- **Minimap.** A small map above the zoom bar: every card in its colour,
  groups as outlines, the current view as a rectangle. Click or drag on
  it to move the view, scroll on it to zoom. Toggled by the flyout, the
  M key, the command and a setting (on by default). Its node layer
  redraws only when cards change; its view rectangle redraws only while
  the canvas itself animates.
- **A frame on shaped cards.** A selected or hovered shaped card shows
  its full bounding rectangle as a thin accent frame with four corner
  discs, so the resize edges can be found; core's own resize and
  connector zones do the work. On touch the corner hit areas are 24px.
- **Outline and Fill on shaped cards.** A shaped card's toolbar shows
  Outline (writes the card's own colour, core's key) and Fill side by
  side with Text, each button a swatch of its state; core's palette
  button steps aside there and stays as it is on plain cards. Core's
  colour tint behind the text no longer shows on shaped cards.
- **Outline style on shaped cards.** Thickness (1 to 6 screen pixels)
  and dash (solid, dashed, dotted) from one flyout, saved as
  `icorStyle.strokeWidth` and `strokeStyle`. Selecting a shaped card no
  longer recolours its outline: the accent stays on the frame.
- **Overflow and fit on shaped cards.** When the text does not fit
  inside a shape, a small "..." pill shows at the bottom of the inset
  area, in the text colour on the fill; measured only when the card is
  resized, its content changes or its shape changes. "Fit shape to
  text" (toolbar button, card menu, command) grows the card around its
  centre, keeping its aspect ratio, until the text fits; undo restores
  the size.
- **Text colour** on text cards, and on a filled card without one, dark
  or light text picked from the fill's luminance.
- `docs/canvas-format.md`: every key the plugin writes, its type,
  default, versioning, and the rule that other plugins' keys are kept;
  a test holds the plugin to it.

### Changed
- **One outline control.** The canvas's own palette sets the card
  colour, which is the outline; the separate outline flyout is gone. A
  0.2.0 outline colour becomes the card's colour on the next save.
- **Shapes are drawn behind the text.** The shape is a layer under the
  content; the text is inset into the shape and centred, and the editor
  shows the fill through. `icorStyle` carries a version and a colour
  change never touches a shape this build does not know.
- Opening any flyout closes the one that is open, the canvas's own
  colour submenu included.
- The card menu buttons inside the column take the column's hover
  colours instead of core's bottom-bar hover lift.

### Fixed (Flint's review of 0.2.0)
- Exports as image no longer carry the breadcrumb, the card toolbars,
  the minimap or the zoom bar.
- Shift with V, H, P or E reaches Obsidian's own hotkeys; a flyout
  choice returns focus to the canvas; the hand pan releases its
  listener; the typed name of a new canvas is normalised; wraps left
  under another plugin's do nothing after unload; the command copes with
  the core backlinks plugin being off.

### Fixed (Flint's review of 0.3.0, and Tom's live test of the build)
- Flint's release read, before the tag: exports as image hide the
  overflow pill and the hover frame too; the palette button and the zoom
  items are found without `:has()`, which an older Android WebView throws
  on; the status-bar offset applies only to a canvas the bar overlaps;
  the editor's overflow observer is released between edits and the
  observers are created from the card's own window; an unload rebuilds
  core's toolbar so the plugin's buttons leave with it; the gate runs
  the directory's manifest checks.
- The editor's mark on a styled card goes on the iframe's root element,
  which core's style relay never rebuilds, so the fill and the text
  colour stay while typing; the mark is cleared on dispose.
- Zoom presets are 25, 50, 100 and 200 percent; core clamps at 200, so
  a 400 preset could never be shown as current.
- The zoom bar and the minimap clear Obsidian's status bar.
- A flyout is placed from its anchor's live rectangle after measuring,
  clamped to the window; the zoom flyout no longer lands at the
  window's bottom left.
- The contrast fallback uses literal black and white, since every
  Obsidian colour token flips with the theme.
- The outline migration from a 0.2.0 file runs after every setData, so
  the first undo keeps the outline.
- Core's colour submenu is closed through its own button rather than
  detached, so the next press on the palette opens it again.
- The minimap reads the accent colour with the node colours and on a
  css change, not once per frame.
- The zoom-source class leaves core's group on dispose.
- The coexistence test keeps the plugin's keys on every node but the
  text card; the docs name the reader of the card keys as planned and
  correct a section number and the startEditing grep.

## [0.2.0] - 2026-09-07 (internal build, never released)

Tom tested 0.1.0 and asked for seven things. All seven, plus two live
asks from the same day.

### Added
- **Connections open at the edge.** A click on a connection row, in the
  note footer or in the Backlinks pane, opens the canvas with that edge
  selected and both of its cards in view. Mod-click keeps the other
  end's own meaning: a note opens in a new tab, any other card opens the
  canvas at that card in a new tab.
- **Tools.** Select, Hand, Pen and Eraser as one exclusive group in the
  canvas's controls column, per canvas, default Select. Select is the
  canvas as it is (drag on empty canvas draws the marquee); Hand pans on
  a mouse or pen drag and leaves a finger to the canvas's own touch pan
  and pinch; Pen and Eraser are the ink modes. Keys V, H, P and E while
  the canvas has focus and nothing is being edited. A Group button
  appears while two or more cards are selected and groups them the way
  the canvas's own "Create group" does. Commands: Pen tool (the 0.1.0
  "Toggle drawing mode" id), Select tool, Hand tool, Eraser tool, Group
  the selection.
- **Flyouts.** The ink colour and width buttons open a panel with every
  option visible (the six canvas colours plus default as swatches; the
  three widths as stroke previews) instead of cycling. One flyout at a
  time; a press outside, Escape, a scroll, a wheel turn or a choice
  closes it.
- **Groups in the metadata.** Under each canvas name, one muted line per
  group whose box contains the card, innermost first: "in group Ideas"
  or "in group unnamed group". A click opens the canvas at the group.
  Group labels keep their screen size once the canvas is zoomed out past
  the point where the canvas hides card labels.
- **Nested canvases.** "New canvas here" in the canvas's background
  context menu creates a .canvas file next to the parent (name
  "<parent> - n", editable in a small dialog) and places a card pointing
  at it where the menu was opened; the card is the canvas's own
  canvas-in-canvas embed. Inside a canvas that sits on other canvases, a
  breadcrumb chip in the top corner names each parent; a click opens
  the parent at this canvas's card. The index places canvas files the
  way it places notes.
- **Shapes and colours for text cards.** With one text card selected,
  the canvas's floating toolbar gets Switch shape (card, rectangle,
  rounded rectangle, ellipse, circle, diamond, triangle, parallelogram,
  speech bubble, star), Outline colour and Fill colour (the six canvas
  colours, the card's own, none, a custom colour). Saved on the card's
  own data as `icorShape` and `icorStyle: { stroke, fill }`, which the
  canvas keeps across loads, saves, undo, redo, copy and paste. The
  card's context menu has a Shape item for the keyboard. Note cards keep
  the 0.1.0 toolbar.
- **Controls column side.** The canvas's controls column, with the tool
  group in it, sits at the left edge by default (Tom's live ask); the
  setting "Controls column side" puts it back on the right. Flyouts and
  tooltips open away from the column's edge.

### Changed
- **The Canvases panel is a section of the Backlinks pane.** The
  separate sidebar view and its ribbon icon are gone; a "Canvases"
  section with the pane's own header look sits under Linked and
  Unlinked mentions, follows the pane's note, and re-renders when a
  canvas changes. The command "Show canvases for this note" (the 0.1.0
  "Open canvases panel" id) reveals the Backlinks pane. A leaf of the
  old view left in a workspace is detached at startup. The note footer
  and its setting are unchanged.

### Fixed (during Tom's test of the first 0.2.0 build)
- The colour flyout opened behind the controls column. Every flyout now
  renders in the window's body, fixed at its button, above the canvas
  controls and menu.

### Known limits
- Built against and verified live on Obsidian 1.13.7 only, on a desktop
  Mac. The private surface grew (`docs/architecture.md` lists every
  member with its re-check grep).
- On a phone the control group is not shown (as in 0.1.0); the tools
  are reached through the commands from the mobile toolbar.
- A shape's text is centred and padded to stay inside the visible area;
  a long text in a triangle or a star is cut, as it would be in Miro.

## [0.1.0] - 2026-09-07 (internal build, never released)

### Added
- First release: four things for the canvas.
- An ink layer per canvas: pencil, eraser, the six canvas palette colours
  plus default, three stroke widths, undo last stroke, clear all (two
  clicks), in a control group at the bottom of the canvas's own controls
  column. Strokes live in canvas coordinates and pan and zoom with the
  cards; a pen's pressure scales the width lightly; Escape leaves drawing
  mode. A stylus draws without switching drawing mode on (setting, on by
  default) and its eraser end erases.
- Ink is saved in the .canvas file under `metadata.icorCanvases` through
  the canvas's own save path, so the canvas's undo and redo include
  strokes and the file carries them through sync and git.
- Modifier-click (Cmd on macOS, Ctrl elsewhere, or Alt by setting) on a
  note card opens the note in the right sidebar. "Open in right sidebar"
  and "Open in new tab" in the card's context menu.
- A toolbar on every note card, shown on hover and while selected: open
  in a new tab, open in the right sidebar. A note on more than one canvas
  gets an "Appears in N canvases" pill with a menu of every canvas it is
  on; choosing one opens that canvas at the note's card.
- An index of every canvas file in the vault, kept fresh from the vault's
  events, with two surfaces: a "Canvases" block under every note next to
  the backlinks block, and a sidebar view that follows the active note.
  Both list each canvas the note is on and, under it, every connection of
  its card with the arrow direction, the other card's title and the edge
  label.
- Commands: Toggle drawing mode, Undo last stroke, Open canvases panel.
  No default hotkeys.
- Settings: the modifier, toolbar on or off, footer on or off, pen colour,
  pen width, a stylus always draws, debug logging.

### Fixed (Flint's review of 0.1.0, before the first tag)
- A locked (read-only) canvas refuses every ink write, including undo
  last stroke, clear all and the command, not only drawing.
- Ink written by a newer version of the plugin is left untouched by an
  older one; a stroke on such a canvas shows a notice instead of
  rewriting the newer ink as version 1.
- The ink layer declares `view` among the members it needs, so a build
  without it degrades with a notice instead of throwing after the save
  wrap is installed.
- A card added in the same tick the canvas unloads no longer gets an
  ownerless toolbar; a pending index refresh is cancelled at unload; a
  stroke in progress stays visible when the file changes underneath;
  the post-processor sweep places footers instead of rebuilding them;
  the footer uses padding above its rule so reading view's section
  measure does not drift; two re-check greps in the architecture doc
  corrected and added.

### Known limits
- Built against and verified live on Obsidian 1.13.7 only. The private
  canvas surface it reads is listed in `docs/architecture.md` with the
  greps that re-verify it on the next Obsidian release.
- Whether "Export as image" includes the ink is unverified.

[0.3.1]: docs/releases/0.3.1.md
[0.3.0]: docs/releases/0.3.0.md
[0.2.0]: docs/releases/0.2.0.md
[0.1.0]: docs/releases/0.1.0.md
