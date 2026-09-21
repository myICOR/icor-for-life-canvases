# ICOR for Life - Canvases

**Think on a surface, not in a list.**

Draw on an Obsidian canvas with a pen and the ink stays in the file. Put
canvases inside canvases. And under every note, see which canvases it sits on
and what it connects to there.

Part of the [ICOR for Life](https://myicor.com) suite.

## What it is for

Some thinking is not a list. Working out how six ideas relate, sketching a
system, planning a video: these want a surface where you can put things next
to each other and draw the line between them.

Obsidian's canvas gives you the surface. This gives you the pen, the nesting,
and the way back: from any note, the canvases it appears on.

That last part is the one people underestimate. A note you dropped on a
canvas three weeks ago is not lost; the note itself tells you where it is.

## Getting started

Install from Obsidian's community plugin directory: **Settings, Community
plugins, Browse**, search for "ICOR for Life - Canvases". Obsidian's own
Canvas plugin must be on.

Open any canvas. A controls column appears on the left. Pick the pen and
draw.

## The tools

**Select, Hand, Pen, Eraser and Text**, in a column on the left. A zoom bar
and a minimap for finding your way around a big canvas.

**Ink lives in the canvas file.** Nothing is written to a separate drawing
file that can go missing.

**Shapes and colours for text cards**, plus plain text with no box at all, in
your theme's handwriting, body or heading face, when you want a label rather
than a card.

## Canvases inside canvases

A card can be another canvas. Open it and you go one level down, with a
breadcrumb to get back up. This is how a canvas stays readable once it gets
big: the detail moves down a level instead of sprawling sideways.

## Finding your way back

**Under every note**, and in the Backlinks pane, a list of the canvases that
note is on, which groups it sits in, and what its card connects to on each.

**On the canvas**, every note card carries two small buttons, and a card that
appears on more than one canvas shows a pill listing the others.

Hold Cmd, or Ctrl on Windows and Linux, and click a note card to open that
note in the right sidebar without leaving the canvas.

## What it touches

- **Canvas files you draw on**, which is the point.
- **Reads your notes and their links** to build the list under each note.

**It makes no network connection and starts no process.**

## Good to know

- **Desktop and mobile.** On a phone the controls column is hidden and the
  tools run from the command palette instead; tablets show the column.
- **Very large canvases.** The whole canvas file is saved on every stroke, so
  a canvas with thousands of strokes writes a bigger file each time. Split it
  into nested canvases before it gets there.
- **The list under a note reads file cards.** A note linked from inside a text
  card is not counted as being on the canvas; Obsidian's own backlinks show
  those.
- **Beta.** If something looks off, open an issue.

## Support

What myICOR supports: the plugin as published in a tagged release, on the
current version, installed from that release. Bugs go to this repo's issues,
security reports to the process in `SECURITY.md`.

What the community maintains: anything marked community-maintained, including
community source adapters. We review it before it is merged. We do not support
it, we cannot promise it keeps working, and it can be disabled or removed in
any release.

What is yours: your own changes, your fork, your local patch. Please reproduce
the problem on a clean install of the current release before reporting it.

## Licence

MIT, see `LICENSE`. Install it, run it, read it, change it, sell it, ship it in
your own product; keep the copyright and licence notice.
Releases before 0.4.0 stay under the ICOR for Life
Source-Available License (Code) v1.0 they were published with.

The licence covers the code only. "ICOR", "ICOR for Life", "myICOR" and
"Paperless Movement" are trademarks of Paperless Movement, S.L.; a fork needs
its own plugin id and name. See `TRADEMARK.md`.

Contributions are welcome as pull requests under the same MIT terms, with a
DCO sign-off on every commit. See `CONTRIBUTING.md`.

Bundled third-party components keep their own licences; see
`THIRD-PARTY-NOTICES.md`.
