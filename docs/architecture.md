# Architecture

ICOR for Life - Canvases, 0.1.0. What the modules are, which of them
reach into Obsidian's unpublished canvas API, how the ink is persisted,
and what to re-check when Obsidian updates.

## Verified against

The private surface below was read in the Obsidian bundle that runs on
the development Mac on 2026-09-06 and 2026-09-07:

- `~/Library/Application Support/obsidian/obsidian-1.13.7.asar`, the
  self-updated bundle (the installer shell says 1.12.7; `obsidian version`
  prints `1.13.7 (installer 1.12.7)`). Extracted with
  `npx @electron/asar extract`; `app.js` is 3,876,459 bytes.
- Public typings: `obsidian@1.13.1` (`node_modules/obsidian/obsidian.d.ts`),
  which contains no canvas declarations at all. `test/manifest.test.mjs`
  checks every named import against its `@since` tag and the manifest's
  `minAppVersion` of 1.13.0.
- Flint's feasibility read of the same bundle:
  `03 WiP/2026-09-06-icor-for-life-canvases/flint-canvas-api-feasibility.md`
  in the vault, with byte offsets into `app.js`.

## Modules

| Module | Job | Private API |
| --- | --- | --- |
| `src/main.ts` | Loads settings, builds the index, the registry and the footers, registers the view, the commands, the ribbon icon, the vault events and the `file-menu` items. | none |
| `src/canvas/internals.ts` | The one door to the private canvas API: the types, the member table, `requireCanvas`, `asCanvasView`, `nodeFromElement`, the `around` instance patcher, the cross-window element helpers. | all of it, by design |
| `src/canvas/registry.ts` | Finds canvas views, binds the three canvas features to each once, tears them down with the view or the plugin. | via `requireCanvas` |
| `src/canvas/ink.ts` | The ink layer: overlay, controls, draw surface, pointer handling, the commit path, the `setData` and `applyHistory` wraps. | `canvasEl`, `wrapperEl`, `data`, `readonly`, `requestSave`, `setData`, `applyHistory`, `posFromEvt`, `scale`, `.canvas-controls` |
| `src/canvas/inkModel.ts` | Pure: widths, colour cycle, the stroke builder, the SVG path, the eraser hit test. | none |
| `src/canvas/format.ts` | Pure: the file format types, `readInk`, `withInk`. | none |
| `src/canvas/openInSidebar.ts` | Modifier-click on a note card. | `nodes`, `nodeEl`, `.canvas-node`, `.canvas-node-label`, `is-focused` |
| `src/canvas/nodeToolbar.ts` | The toolbar and the pill on every note card; the `addNode` wrap. | `nodes`, `addNode`, `nodeEl`, `file`, `filePath`, `selectOnly`, `zoomToSelection`, `view.file` |
| `src/canvas/navigate.ts` | Open a canvas at a card: `openFile` with `eState.match.nodeId`, then select and zoom once the node exists. | `match.nodeId` ephemeral state, `nodes`, `selectOnly`, `zoomToSelection` |
| `src/open.ts` | Right sidebar, new tab, link-style open. | none |
| `src/index/parse.ts` | Pure: one canvas file to placements and connections. | none (file format only) |
| `src/index/CanvasIndex.ts` | Every canvas in the vault, kept fresh, with `subscribe`. | none |
| `src/views/rows.ts` | The rows both surfaces share. | none |
| `src/views/CanvasesView.ts` | The sidebar `ItemView`. | none |
| `src/views/footer.ts` | The block under a note, placed after `.embedded-backlinks`. | `.embedded-backlinks`, `data-mode` |
| `src/settings/*` | The settings model, the table, the declared settings tab. | none |
| `src/log.ts` | Debug channel and degrade channel. | none |

## The private surface, member by member

Every name here was found in `app.js` of 1.13.7. The grep in the last
column finds the same spot when the minified names change; run each one
against the next bundle before shipping on it.

| Member | Kind | What it is | Re-check grep |
| --- | --- | --- | --- |
| `view.getViewType() === 'canvas'` | view | The canvas view. | `getViewData=function(){return $d(this.canvas.data)}` |
| `view.canvas` | object | The canvas object of a canvas view. | same |
| `view.file` | TFile | Public on FileView. | n/a |
| `canvas.nodes` | Map id to node | Every card. | `addNode=function(e){this.nodes.set(e.id,e)` |
| `canvas.edges` | Map id to edge | Every edge (typed, not used yet). | `this.edges` near `edgeFrom.add` |
| `canvas.selection` | Set of nodes | The selection (typed, not used yet). | `selectOnly=function(e){var t=this.selection` |
| `canvas.data` | object | The object the file was loaded from; replaced on every save. | `setData=function(e){e&&(0!==Object.keys(e).length?(this.importData(e,!0),this.data=e` |
| `canvas.readonly` | boolean | The lock. | `this.readonly=!1,this.history=` |
| `canvas.wrapperEl` | div.canvas-wrapper | Untransformed; holds the controls and receives pointer events. | `this.wrapperEl=e.contentEl.createDiv({cls:"canvas-wrapper"` |
| `canvas.canvasEl` | div.canvas | Transformed every frame; holds nodes, edges and the ink overlay. | `this.canvasEl=n.createDiv("canvas")` |
| `canvas.getData()` | function | `{...this.data, nodes, edges}`. | `prototype.getData=function(){var e=[],t=[]` |
| `canvas.setData(data)` | function, one argument | Loads a file object; `this.data = data`; pushes history. | as for `data` |
| `canvas.importData(data, clearMissing)` | function, two arguments | Adds or updates nodes and edges; does not touch `this.data`. Typed, not called. | `importData=function(e,t){var n=this,i=e.nodes` |
| `canvas.applyHistory(data)` | function | Undo and redo land here; sets `this.data`. | `applyHistory=function(e){this.importData(e,!0),this.data=e` |
| `canvas.requestSave(pushHistory = true)` | function | `this.data = this.getData()`, pushes history, then `view.requestSave()`. | `requestSave=function(e){void 0===e&&(e=!0),this.data=this.getData()` |
| `canvas.requestFrame()` | function | Typed, not called. | `requestFrame=function(e){var t=this;this.frame` |
| `canvas.posFromEvt(evt)` | function | Client coordinates of an event to canvas units. | `posFromEvt=function(e){return this.posFromDom(this.domPosFromEvt(e))}` |
| `canvas.scale` | number | The linear zoom factor (`zoom` is its log2). Optional for the plugin. | `t.zoom=u,t.scale=v` |
| `canvas.zoomToBbox(bbox)`, `zoomToSelection()`, `selectOnly(node)`, `deselectAll()` | functions | Selection and viewport. | `zoomToSelection=function(){var e=this.selection` |
| `canvas.addNode(node)` | function | Every card goes through it, on load and on create. | as for `nodes` |
| `node.nodeEl` | div.canvas-node | Created in the node constructor, attached and detached as it enters and leaves the viewport; keeps its children. | `this.nodeEl=createDiv("canvas-node")` |
| `node.getBBox()` | function | The card's bounds. There is no `node.bbox` property on a node. | `getBBox=function(){return D8(this)}` |
| `node.file`, `node.filePath` | TFile or null, string | On a file node only. | `t.filePath="",t.subpath="",t.file=null` |
| `node.nodeEl` classes `is-selected`, `is-focused`, `is-dragging` | CSS | Set by `select`, `focus`, drag. | `deselect=function(){this.nodeEl.removeClass("is-selected")` |
| `.canvas-controls`, `.canvas-control-group.mod-raised`, `.canvas-control-item` | CSS | The controls column and its groups; the ink group borrows the classes. | `createDiv("canvas-controls"` |
| `.canvas-node-container` | CSS | `contain: strict; overflow: hidden`, so the toolbar is a sibling of it inside `.canvas-node`, never a child. | `createDiv("canvas-node-container")` |
| `.canvas-node-label` | CSS | The label above a card; Mod-click there opens a new tab in core, so the sidebar opener skips it. | `onLabelClick=function(e){` |
| `--zoom-multiplier` | CSS variable | `sqrt(1/scale)`, set on the wrapper every frame; scales the toolbar and the pill. | `"--zoom-multiplier":String(Math.sqrt(1/v))` |
| `eState.match.nodeId` | open state | The canvas view's `setEphemeralState` selects the node and pans to it. `content` and `matches` are read too and must be present. | `void 0!==t.match){var n=this.canvas,i=t.match,r=i.nodeId` |
| `file-menu` with source `'canvas-menu'` | public event | Fired from a file node's context menu; the two menu items hang on it. | `trigger("file-menu",t,r,"canvas-menu")` |
| `.embedded-backlinks` | CSS | The "Backlinks in document" element every Markdown view owns, appended to the preview renderer's footer section or the `.cm-sizer` on each mode's `show()`. Verified live: with "Backlinks in document" off the footer section is empty and the renderer never attaches it, so the element is not in the DOM at all; the block then goes to the end of `.markdown-preview-sizer` (reading) or `.cm-sizer` (editing) and is moved back to the end whenever the renderer attaches a section after it. | `n.backlinksEl=createDiv("embedded-backlinks")` |
| `.markdown-preview-sizer`, `.cm-sizer` | CSS | The two sizers the block falls back to. | `createDiv("markdown-preview-sizer")`, `createDiv("cm-sizer")` |
| `data-mode` on `MarkdownView.containerEl` | attribute | Set on every mode switch; the footer follows it with a MutationObserver. | `containerEl.setAttribute("data-mode",this.getMode())` |

Not used, and known: the `canvas:node-menu`, `canvas:edge-menu` and
`canvas:selection-menu` events (not in the typings; the public `file-menu`
does the job), `canvas.menu` (the selection toolbar core draws), and
`metadataCache.resolvedLinks` for canvas files (the index parses the files
itself so it can show edges).

## Persistence

The ink is in the .canvas file under `metadata.icorCanvases`:

```
{ "version": 1, "strokes": [ { "id", "color": "" | "1".."6", "width", "points": [x, y, ...] } ] }
```

Why no patch of `getData` and no sidecar. In 1.13.7 the save path is:
`canvas.requestSave()` sets `this.data = this.getData()`, and `getData()`
returns `{...this.data, nodes, edges}`; the view's `getViewData()`
serialises `canvas.data`. A load is `setViewData` calling
`canvas.setData(JSON.parse(text))`, which sets `this.data` to the parsed
object. So any top-level key on `canvas.data` survives a load and a save
on its own, which is also what the JSON Canvas spec and Obsidian's
`canvas.d.ts` promise for unknown keys. The plugin therefore treats
`canvas.data.metadata.icorCanvases` as the only copy of the ink.

The one rule that makes undo right: **never mutate `canvas.data` in
place; replace it.** The history stack holds the very objects that were
`canvas.data` at each save (they are shallow copies, and `metadata` is
shared between them by reference), so mutating `metadata` would rewrite
the past and an undo would not remove the stroke. `withInk` builds a new
top-level object with a new `metadata`, the layer assigns it to
`canvas.data` and calls `requestSave()`. Undo then lands in
`applyHistory`, redo the same, an external edit in `setData`; all three
set `this.data`, and both methods are wrapped to re-render the overlay.

The sidecar fallback (`<name>.canvas.ink.json`) was not needed and is
not implemented.

## Wiring lifecycle

- `CanvasRegistry.sweep()` runs at layout-ready and on `layout-change` and
  `active-leaf-change`; it binds every canvas view it has not seen. A
  binding registers its teardown with `view.register`, and the plugin's
  `onunload` tears down every binding that is left.
- Instance methods are wrapped with `around` (own property over the
  prototype's), and the undo restores only while the wrapper is still the
  installed one, so a later patch by another plugin is not torn out.
- Listeners on canvas elements are added with an `AbortController` signal
  per binding and aborted on teardown.
- The toolbar is injected once per card into `node.nodeEl` and survives
  the card being detached off screen; a card added later comes through
  the `addNode` wrap, decorated on the next microtask so its file is set.
- The footer is one element per `MarkdownView`, bound on the first sweep
  that sees the view and placed after `.embedded-backlinks` when that is
  in the DOM, else at the end of the mode's sizer. One MutationObserver
  per view watches the `data-mode` attribute and the preview sizer's
  children (reading view renders sections as they scroll into view) and
  re-places the block; a Markdown post-processor schedules a sweep on
  every render so a view that had nowhere to put the block yet gets one.

## What breaks on an Obsidian update, and how to re-check

1. Open the new bundle: `npx @electron/asar extract "~/Library/Application Support/obsidian/obsidian-<version>.asar" <dir>`.
2. Run every grep in the table above against `app.js`. A grep that finds
   nothing means the member moved or was renamed.
3. Read `getData`, `setData`, `applyHistory` and `requestSave` again; the
   persistence section depends on `getData` spreading `this.data` and on
   the view serialising `canvas.data`.
4. Install the build in a test vault. `requireCanvas` in
   `src/canvas/internals.ts` reports every missing member as one Notice
   and one console warning per member; the feature that asked for it
   stays off and everything else runs. That is the designed failure.
5. Draw one stroke, undo it, redo it, reload the file. Read the .canvas
   file back.
6. Update this document's "Verified against" and the release notes.

## Not verified outside the test suite and the one live vault

- "Export as image" with ink on the canvas.
- Apple Pencil on iPadOS reporting `pointerType === 'pen'` inside the
  Obsidian WebView, and its eraser end as `buttons & 32`.
- A canvas moved into a pop-out window (the element checks are
  cross-window on purpose; the wiring itself was not exercised there).
- Obsidian builds older than 1.13.7.
