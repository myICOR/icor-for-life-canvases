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

### Known limits
- Built against and verified live on Obsidian 1.13.7 only. The private
  canvas surface it reads is listed in `docs/architecture.md` with the
  greps that re-verify it on the next Obsidian release.
- Whether "Export as image" includes the ink is unverified.

[0.1.0]: docs/releases/0.1.0.md
