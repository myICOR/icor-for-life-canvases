# Architecture

ICOR for Life - Canvases, 0.3.0. What the modules are, which of them
reach into Obsidian's unpublished canvas API, how the ink and the card
styles are persisted, and what to re-check when Obsidian updates.

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
| `src/main.ts` | Loads settings, builds the index, the registry, the footers and the Backlinks sections; registers the commands, the vault events, the `file-menu` items and the node-menu event; detaches a leaf of the retired 0.1.0 view. | none |
| `src/canvas/internals.ts` | The one door to the private canvas API: the types, the member table, `requireCanvas`, `asCanvasView`, `nodeFromElement`, the node type guards, `selectionMenu`, `onNodeMenu`, the `around` instance patcher, the cross-window element helpers. | all of it, by design |
| `src/canvas/registry.ts` | Finds canvas views, binds every canvas feature to each once (in an order whose reverse is the dispose order), tears them down with the view or the plugin. | via `requireCanvas` |
| `src/canvas/ink.ts` | The ink layer: overlay, draw surface, pointer handling, the commit path, the `setData` and `applyHistory` wraps; reports mode changes to the tools. | `canvasEl`, `wrapperEl`, `data`, `readonly`, `requestSave`, `setData`, `applyHistory`, `posFromEvt`, `scale` |
| `src/canvas/tools.ts` | The tool group in the controls column: Select, Hand, Pen, Eraser, Group, the pickers, undo, clear; the Hand surface; V/H/P/E. | `wrapperEl`, `posFromEvt`, `panBy`, `selection`, `readonly`, `createGroupNode`, `.canvas-controls` |
| `src/canvas/flyout.ts` | The popover every picker uses: body-appended, fixed at the anchor, one at a time. | `.canvas-submenu` (look only) |
| `src/canvas/pickers.ts` | The ink colour and width flyouts. | `.canvas-color-picker-item`, `mod-canvas-color-N` (look only) |
| `src/canvas/selectionMenu.ts` | One wrap of the selection toolbar's `render` per canvas, shared. | `menu`, `menu.menuEl`, `menu.render(rebuild)` |
| `src/canvas/nodeHook.ts` | One wrap of `addNode` per canvas, shared by the toolbar and the shapes. | `addNode` |
| `src/canvas/shapeModel.ts` | Pure: shapes, colours, `readShape`, `withShape`, the outline polygons. | none |
| `src/canvas/shapes.ts` | Shapes and colours on text cards: the toolbar buttons, the flyouts, the node-menu item, the per-node `setData` and `startEditing` wraps, the DOM apply, the editor iframe's root marker, the overflow measure and fit, the contrast fallback. | `selection`, `readonly`, `requestSave`, `node.unknownData`, `node.setData`, `node.startEditing`, `node.color`, `node.setColor`, `node.text`, `nodeEl`, `.canvas-node-container`, `iframe.embed-iframe`, `canvas:node-menu`, `.canvas-menu` buttons |
| `src/canvas/layout.ts` | The column layout: the card menu moved into the column, the zoom items moved into a bottom-right bar with the live percentage and its flyout. Core's elements are moved, not recreated, and put back on dispose. | `canvasControlsEl`, `cardMenuEl`, the zoom items by icon, `zoomBy`, `zoomToFit`, `tZoom`, `markViewportChanged` |
| `src/canvas/minimap.ts` | The minimap: two stacked canvas elements; the node layer on node changes (debounced), the view rectangle on `requestFrame`. | `nodes`, `getBBox`, `color`, `getViewportBBox`, `panTo`, `zoomBy`, `requestFrame`, `markMoved`, `markDirty`, `removeNode`, `setData`, `applyHistory` |
| `src/canvas/nested.ts` | "New canvas here" through the `showCreationMenu` wrap, the name modal, the breadcrumb chip. | `showCreationMenu`, `createFileNode`, `readonly`, `view.file`, `wrapperEl` |
| `src/canvas/geometry.ts` | Pure: boxes, union, padding, containment, area. | none |
| `src/canvas/inkModel.ts` | Pure: widths, the stroke builder, the SVG path, the eraser hit test. | none |
| `src/canvas/format.ts` | Pure: the file format types, `readInk`, `withInk`. | none |
| `src/canvas/openInSidebar.ts` | Modifier-click on a note card. | `nodes`, `nodeEl`, `.canvas-node`, `.canvas-node-label`, `is-focused` |
| `src/canvas/nodeToolbar.ts` | The toolbar and the pill on every note card. | `nodes`, `nodeEl`, `file`, `filePath`, `selectOnly`, `zoomToSelection`, `view.file` |
| `src/canvas/navigate.ts` | Open a canvas at a card or at an edge: `openFile` with `eState.match.nodeId`, then select and zoom once the node exists. | `match.nodeId` ephemeral state, `nodes`, `edges`, `selectOnly`, `zoomToSelection`, `zoomToBbox`, `edge.from/to.node`, `edge.getBBox` |
| `src/open.ts` | Right sidebar, new tab, link-style open. | none |
| `src/index/parse.ts` | Pure: one canvas file to placements, connections and containing groups. | none (file format only) |
| `src/index/CanvasIndex.ts` | Every canvas in the vault, kept fresh, with `subscribe`. | none |
| `src/views/rows.ts` | The rows both surfaces share. | none |
| `src/views/backlinksSection.ts` | The "Canvases" section inside the core Backlinks pane; re-rendered on the pane's direct `update` (its file load) and on the plugin's own sweeps, which compare the file. | `.backlink-pane`, the pane's header classes, `view.update` |
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
| `.markdown-preview-sizer`, `.cm-sizer` | CSS | The two sizers the block falls back to. | `createDiv("markdown-preview-sizer markdown-preview-section")`, `createDiv("cm-sizer")` |
| `.canvas-wrapper.mod-zoomed-out` | CSS | Set on the wrapper each frame past the zoom breakpoint; core hides card labels under it, the plugin hides the toolbar and the pill. | `toggleClass("mod-zoomed-out"` |
| `data-mode` on `MarkdownView.containerEl` | attribute | Set on every mode switch; the footer follows it with a MutationObserver. | `containerEl.setAttribute("data-mode",this.getMode())` |
| `canvas.select(item)` | function | Adds a node or an edge to the selection. The selection holds both. | `select=function(e){var t=this.selection;t.has(e)\|\|this.updateSelection` |
| `edge.from`, `edge.to`, `edge.getBBox()` | object, function | `{node, side, end}` at each end; the box spanned by the two ends. | `getBBox=function(){var e=this.from,t=this.to` |
| `edge.select()` | function | Adds `is-focused` to both path groups; what `selectOnly(edge)` shows. | `select=function(){this.lineGroupEl.addClass("is-focused")` |
| `canvas.panBy(dx, dy)` | function | Moves the viewport by canvas units; the Hand tool's pan. | `panBy=function(e,t){this.x+=e,this.y+=t` |
| `canvas.handleDragToSelect` | behaviour | A left drag on the wrapper itself draws the marquee; the Select tool is this, untouched. | `e.targetNode===this.wrapperEl&&"mouse"===e.pointerType&&0===e.button` |
| `canvas.createGroupNode({pos, size})` | function | The Group button; core's own "Create group" pads the union box by 20 and calls it the same way. | `createGroupNode=function(e){var t=e.pos,n=e.size` |
| `canvas.createFileNode({pos, size, file, save, focus})` | function | The card for a new nested canvas. | `createFileNode=function(e){var t=e.pos,n=e.size` |
| `canvas.showCreationMenu(menu, pos, size)` | function | Builds the background context menu's items; `onContextMenu` looks it up on the instance at call time, so an instance wrap adds "New canvas here". | `showCreationMenu=function(e,t,n){` and `this.showCreationMenu(i,n),i.addSeparator()` |
| `canvas.menu`, `menu.menuEl`, `menu.render(rebuild)` | object | The floating selection toolbar (`div.canvas-menu`); the frame loop calls `render` with `rebuild` true on a selection change and false on a viewport change. Wrapped once per canvas. | `this.menuEl=n.createDiv("canvas-menu")` and `&&t.menu.render(te)` |
| `.canvas-menu button.clickable-icon` | CSS | Core's toolbar buttons; the shape buttons are built the same. | `createEl("button","clickable-icon")` (two hits: the toolbar and one other) |
| `.canvas-submenu`, `.canvas-color-picker-item`, `.mod-canvas-color-N` | CSS | Core's colour submenu look; the flyouts borrow the classes and add their own placement. | `createDiv("canvas-submenu")`, `createDiv("canvas-color-picker-item")`, `"mod-canvas-color-"+e` |
| `node.unknownData`, `node.setData(data)` | object, function | The keys of a card's data the canvas does not know, replaced on every `setData` and spread back by `getData`; the shape and colours live there. | `this.unknownData=s},Object.defineProperty(e.prototype,"rect"` and `getData=function(){var e=this,t=e.id,n=e.x,i=e.y,r=e.width,o=e.height,a=e.color,s=e.unknownData` |
| `node.text` (text card), `node.label` + `bgPath` (group) | properties | The type guards for a text card and a group. | `{type:"text",text:this.text}` and `{type:"group"})` |
| `canvas:node-menu` | private event | `(menu, node)` from a card's context menu; the Shape item for text cards. | `trigger("canvas:node-menu",e,this)` |
| `.canvas-controls` at `inset-inline-end` | CSS | Core's column on the right; the plugin's wrapper class moves it to `inset-inline-start` by setting. | `createDiv("canvas-controls"` and, in app.css, `.canvas-controls {` |
| `.canvas-group-label` | CSS | A group's label, scaled by the zoom multiplier; not hidden under `mod-zoomed-out` (only `.canvas-node-label` is); the plugin holds it at screen size past the breakpoint. | `createDiv("canvas-group-label")` |
| `--layer-cover` (5), `--layer-menu` (65) | CSS variables | The controls column's layer and the one the flyouts use above it. | `--layer-cover: 5`, `--layer-menu: 65` in app.css |
| view type `backlink`, `.backlink-pane`, `.tree-item-self.is-clickable` header, `.search-result-container`, `view.update()` | view | The core Backlinks pane and its two section headers; the Canvases section is a third built the same way, and `update` (the pane's own refresh on a file change) is wrapped on the instance. `view.file` is public. | `Q3="backlink"`, `createDiv("backlink-pane")`, `update=function(){this.leaf.updateHeader();var e=this.backlink;e.file=this.file` |
| `is-collapsed` on a header and its `.collapse-icon` | CSS | How the pane collapses a section. | `function cI(e,t){e.toggleClass("is-collapsed",t)` |
| `--canvas-node-width`, `--canvas-node-height` | CSS variables | Set on `.canvas-node` in the node render; the shape insets and the circle read them. | `"--canvas-node-width"` |
| `.canvas-node-interaction-layer`, `.canvas-node-resizer[data-resize]`, `.canvas-node-connection-point[data-side]` | DOM | Core's one interaction layer, moved onto the hovered (desktop) or selected (mobile) card and sized to its full rectangle; its eight resizers and four connector dots are the hit zones. The shaped card's frame only makes that rectangle visible; on touch the corner resizers are widened to 24px. | `createDiv("canvas-node-interaction-layer")` and `cls:"canvas-node-resizer"` |
| `node.moveAndResize(rect)` | function | Rounds x, y, width, height and marks the node moved; no save, so the plugin's requestSave after it is what pushes history. Fit shape to text. | `moveAndResize=function(e){` |
| `canvas.options.snapToGrid`, `canvas.gridSpacing` | option, number | The grid, read the way core's arrow-key nudge reads it; fit-to-text snaps to it when on. | `snapToGrid` and `gridSpacing` near `nudgeSelection` |
| The palette button by `lucide-palette` | DOM | Core's colour button in the toolbar, `button.clickable-icon` with the icon as its first child; hidden on a shaped card. | `actionSetColor(),"lucide-palette"` |
| `.cm-content`, `.markdown-preview-sizer` inside the content box | DOM | The overflow measure: the editor's content height (its scroller scrolls inside) and the preview's rendered height. | `createDiv("markdown-preview-sizer markdown-preview-section")` |
| `.canvas-node.is-themed .canvas-node-content` tint | CSS | Core's 7 percent colour tint on a coloured card's content box; transparent on a shaped card. | `.is-themed .canvas-node-content` in app.css |
| `.canvas-card-menu-button.mod-draggable:hover svg` lift | CSS | Core's bottom-bar hover lift; neutralised on the moved menu inside the column. | `.mod-draggable:hover svg` in app.css |
| `.status-bar` | CSS | Obsidian's status bar, over the bottom right corner; its height is measured onto the wrapper so the zoom bar and the minimap clear it. | `createDiv("status-bar")` |
| `.canvas-wrapper.is-screenshotting` | CSS | Set for "Export as image"; core hides its controls under it, the plugin hides its chrome (chip, toolbars, minimap, zoom bar). | `addClass("is-screenshotting")` |
| `canvas.canvasControlsEl`, `canvas.cardMenuEl` | elements | The controls column and the bottom card menu; the layout moves the menu into the column and the zoom items out of it, and puts both back on unload. | `this.canvasControlsEl=n.createDiv("canvas-controls"` and `this.cardMenuEl=n.createDiv("canvas-card-menu"` |
| `canvas.zoomBy(delta, center?)`, `zoomToFit()`, `panTo(x, y)` | functions | The zoom bar, the presets, the minimap. | `zoomBy=function(e,t){var n=this.tZoom`, `zoomToFit=function`, `panTo=function(e,t){this.x=e` |
| `canvas.markViewportChanged()` | function | Every viewport change requests a frame through it; wrapped for the live percentage. | `markViewportChanged=function(){this.viewportChanged=!0` |
| `canvas.requestFrame()` | function | Called once per animated frame while the viewport or a drag animates, never while idle; wrapped for the minimap's viewport rectangle. | `requestFrame=function(e){var t=this;this.frame` |
| `canvas.getViewportBBox()` | function | The view in canvas units, for the minimap rectangle. | `getViewportBBox=function(){var e=this.canvasRect` |
| `canvas.markMoved(item)`, `markDirty(item)`, `removeNode(node)` | functions | Node changes; wrapped for the minimap's node layer. | `markMoved=function`, `markDirty=function(e){this.dirty.add(e)`, `removeNode=function(e){` |
| The zoom items by icon: `lucide-plus`, `lucide-rotate-cw`, `lucide-maximize`, `lucide-minus` | DOM | How the layout finds the four zoom items in the second control group. | `Ag(e,"lucide-rotate-cw")` |
| `node.startEditing()`, `iframe.embed-iframe` | function, DOM | A text card's editor mounts an iframe with its own document that receives the app's stylesheets (the plugin's included) and mirrors the body classes; the plugin marks its body for a styled card. | `startEditing=function(){` (two hits: the base node and the group node; the text card's is `startEditing=function(t){e.prototype.startEditing.call(this)`) and `"embed-iframe"` |
| `node.color`, `node.setColor(color)` | property, function | The card's own colour; the 0.2.0 outline colour migrates into it. | `setColor=function(e,t){void 0===t&&(t=!1),e=Z8(e` (two hits: node and edge) |

Not used, and known: the `canvas:edge-menu` and `canvas:selection-menu`
events (not in the typings), `canvas.getContainingNodes` (the index
computes containment from the file), and `metadataCache.resolvedLinks`
for canvas files (the index parses the files itself so it can show
edges and groups). Obsidian's context menus are native on macOS by
default, so a menu wrap is verified by handing the wrapped method a
recording menu object, not by reading `.menu` in the DOM.

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

### Shapes and colours on a text card

On the card's own entry: `"icorShape": "<shape>"` and
`"icorStyle": { "stroke"?: "<colour>", "fill"?: "<colour>" }`, a colour
being `"1"` to `"6"`, `"transparent"` or a hex string. In 1.13.7 a card's
`setData` keeps every key it does not know in `node.unknownData` (a fresh
object each time) and `getData` spreads it back first, so the keys
survive a save, a load, undo, redo, copy and paste with no patch of
`getData`. The write is `node.unknownData = withShape(node.unknownData,
patch)` plus `canvas.requestSave()`; the DOM is re-applied through an
instance wrap of the node's `setData`, which is where a load, an undo
and a paste land. Default values remove their keys.

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
- The selection toolbar's `render` and the canvas's `addNode` are each
  wrapped once per canvas (`SelectionMenuHook`, `NodeAddHook`) and fan
  out to listeners; the registry disposes features in the reverse of the
  bind order so every wrap is the installed one when its undo runs.
- The Backlinks section is bound per `backlink` leaf on every sweep,
  wraps the view's `update` on the instance, and is removed with the
  view's `register` or the plugin.
- Flyouts are appended to the body of the anchor's window, fixed at the
  anchor's rectangle, and closed by an outside press, Escape, scroll,
  wheel, resize, a choice, or the plugin unloading through the
  controller that owns them.
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
- The canvas-in-canvas embed of a new, empty child (a 0-byte file, as
  core's own command writes).
- Touch on an iPad for the Hand surface and the tool buttons.
- The body-appended flyouts in a pop-out window.
- "Export as image" with shapes and outlines on the canvas.
