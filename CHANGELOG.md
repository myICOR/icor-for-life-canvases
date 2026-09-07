# Changelog

All notable changes to ICOR for Life - Canvases.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-09-07

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

[0.1.0]: docs/releases/0.1.0.md
