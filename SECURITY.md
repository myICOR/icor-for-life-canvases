# Security Policy

ICOR for Life - Canvases draws on a canvas, opens notes in other panes,
adds a toolbar to note cards, and reads every .canvas file in the vault to
list where a note sits. It writes into the vault in three ways, every one
started by a click: the ink and a text card's shape, colours, size and
position into the .canvas file being edited, through the canvas's own
save path; a new empty .canvas file next to the parent when you choose
"New canvas here"; and its own settings into data.json. Nothing else. It
opens no connection, spawns no process, touches no clipboard and reads no
file outside the vault. That is the whole capability, and this document
says so with the file to read behind each claim.

If you find a way to make this plugin do something its user did not ask
for, we want to hear about it before anyone else does.

## Reporting a vulnerability

**Please do not open a public GitHub issue for a security problem.**

Two channels, in order of preference:

1. **GitHub private security advisory** (preferred). Open a draft advisory
   on the Security tab of this repository. It stays private between you
   and the maintainer until a fix ships.
2. **Email** `support@myicor.com` with `SECURITY` and `icor-for-life-canvases`
   in the subject line. This is a monitored mailbox.

A useful report contains the plugin version (`manifest.json`), your
Obsidian version and operating system, what an attacker can do and what
they need in order to do it, and steps to reproduce against a throwaway
vault.

## What to expect

| Stage | Target |
| --- | --- |
| We acknowledge your report | within 5 business days |
| We tell you whether we agree it is a vulnerability, and how severe | within 10 business days |
| We ship a fix for a confirmed critical or high issue | we aim for 30 days |
| We ask you to hold public disclosure until | a fix ships, or 90 days from your report, whichever comes first |

Only the most recent release is supported. One branch, no backports.

## Scope: exactly what this plugin does

| Claim | Where to read it |
| --- | --- |
| Reads the `.canvas` files the metadata cache names as link sources (`metadataCache.resolvedLinks`), the ones its `resolve` event names as core indexes them, and the ones the vault's create, rename and modify events name, through `vault.cachedRead`, and parses each as JSON. Never enumerates the vault; reads nothing else. | `src/index/CanvasIndex.ts` |
| Writes the ink and a text card's shape keys into the open canvas's data and calls the canvas's own `requestSave`; sets a card's colour and size through core's `setColor` and `moveAndResize`; adds a group or a file card through core's `createGroupNode` and `createFileNode`. | `src/canvas/ink.ts` (`commit`), `src/canvas/shapes.ts` (`set`, `openOutline`, `fitToText`), `src/canvas/tools.ts` (`createGroup`), `src/canvas/nested.ts` (`create`) |
| Creates one empty `.canvas` file, next to the parent canvas, with the name you type, through `vault.create`. The name is validated as a single file name inside that folder. Nothing else is created, modified, renamed or deleted. | `src/canvas/nested.ts` (`create`), `src/canvas/naming.ts` |
| Saves its settings to its own `data.json` through `saveData`. | `src/main.ts` (`saveSettings`) |
| Opens notes through `workspace.getLeaf`, `getRightLeaf`, `openFile`, `revealLeaf`. | `src/open.ts`, `src/canvas/navigate.ts` |
| Touches Obsidian's unpublished canvas object through one module with a runtime check per member. | `src/canvas/internals.ts` |
| Wraps three methods on a canvas instance (`setData`, `applyHistory`, `addNode`) to re-render after a load and to decorate a new card; restores them on unload. Never patches a prototype. | `src/canvas/ink.ts`, `src/canvas/nodeToolbar.ts`, `around` in `src/canvas/internals.ts` |
| Renders every string (note names, edge labels, text-card lines) through `createEl` and `setText`; no `innerHTML`. | `test/hygiene.test.mjs` |
| No network call, no Node module, no `eval`, no timer, no global document. | `test/hygiene.test.mjs` |
| One debug channel, off by default, that never echoes note text; one degrade channel that names a missing member. | `src/log.ts` |

The built `main.js` bundles no third-party code; see
THIRD-PARTY-NOTICES.md.

## Threats considered

- **A crafted .canvas file.** The index parser accepts only the shapes it
  expects (`src/index/parse.ts`) and drops the rest; a malformed file
  yields nothing. The ink reader validates every stroke and drops what it
  cannot trust (`src/canvas/format.ts`). Neither executes anything.
- **A note name or edge label with markup.** Rendered as text, never as
  HTML.
- **An Obsidian update that changes the private surface.** Every private
  member is checked at runtime; a missing one switches its feature off
  with a notice and a console line rather than throwing.
