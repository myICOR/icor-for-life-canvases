# What ICOR for Life - Canvases writes into a .canvas file

Every key the plugin writes, its type, its default, how it is versioned,
and the rule that keeps other plugins' keys intact. The file itself is
JSON Canvas 1.0 as Obsidian writes it; the plugin adds keys in the two
places the format and Obsidian's `canvas.d.ts` leave open ("support
arbitrary keys for forward compatibility").

## 1. Top level: `metadata.icorCanvases` (the ink)

```
"metadata": {
  "icorCanvases": {
    "version": 1,
    "strokes": [
      { "id": "68a422f1f42236bc", "color": "1", "width": 4, "points": [x, y, x, y, ...] }
    ]
  }
}
```

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `metadata` | object | absent | Obsidian's own optional top-level object; Advanced Canvas writes its keys here too. The plugin adds one member and never removes another. |
| `metadata.icorCanvases` | object | absent | Absent when the canvas has no strokes; `withInk` removes it, and removes an emptied `metadata` with it. |
| `.version` | integer | 1 | The ink format version this build writes. |
| `.strokes[]` | array | `[]` | One entry per stroke, in drawing order. |
| `.strokes[].id` | string, 16 hex characters | required | Unique per stroke. |
| `.strokes[].color` | `""` or `"1"` to `"6"` | `""` | The canvas palette; `""` is the theme's text colour. An unknown value reads as `""`. |
| `.strokes[].width` | number, canvas units | required | Base width 2, 4 or 8, scaled by pen pressure. |
| `.strokes[].points` | number array, even length, at least 2 | required | Flat x, y pairs in canvas coordinates, rounded to a tenth. |

Read rule: a malformed stroke is dropped on its own; the rest of the set
is kept. Write rule: `withInk(data, strokes)` returns a new top-level
object with a new `metadata` object (the canvas's undo history holds the
old ones by reference; see `docs/architecture.md`), copying every other
member of `metadata` as it was.

## 2. Node level: `icorShape` and `icorStyle` (text cards)

```
{ "id": "...", "type": "text", "text": "...", "x": 0, "y": 0, "width": 250, "height": 60,
  "icorShape": "diamond",
  "icorStyle": { "version": 1, "fill": "3", "text": "#ff0000" } }
```

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `icorShape` | one of `rectangle`, `rounded`, `ellipse`, `circle`, `diamond`, `triangle`, `parallelogram`, `bubble`, `star` | absent (a plain card) | Written on text cards only. An unknown value reads as the plain card and is left in place. |
| `icorStyle` | object | absent | Absent when neither colour is set. |
| `.version` | integer | 1 | Written with the style; see versioning. |
| `.fill` | `"1"` to `"6"`, `"transparent"`, or `#rgb` / `#rrggbb` | absent (the theme's card background) | |
| `.text` | `"1"` to `"6"` or `#rgb` / `#rrggbb` | absent (the theme's text colour; on a filled card, dark or light by the fill's luminance) | |
| `.stroke` | | | Written by 0.2.0 only. 0.3.0 reads it once, writes it into the card's own `color` when the card has none, removes it, and the next save carries the result. The outline is the card's `color`. |

Read rule: `readShape` reads what it understands and defaults the rest.
Write rule: `withShape(data, patch)` returns a new node-data object and
touches only the keys the patch names: a colour change leaves `icorShape`
as it is, a shape change leaves `icorStyle` as it is, and a member of
`icorStyle` this build does not know is copied through. Default values
remove their keys.

How the keys reach the file: Obsidian 1.13.7 keeps every key it does not
know on a card in `node.unknownData` and spreads them back in
`node.getData()`, which is what the save writes; the plugin writes to
`unknownData` and calls the canvas's own save. Undo, redo, copy and
paste carry the keys because they run through the same two methods.

## 3. Nothing else

The plugin writes no other key, no sidecar file, and never a node of its
own type (Obsidian drops unknown node types on load). "New canvas here"
creates an empty file, exactly as the canvas's own "Create new canvas"
does.

## 4. Versioning

Both blobs carry a `version`, and the rule is the same for both: **a
newer version is read as empty and never rewritten.** `readInk` returns
no strokes for `icorCanvases.version > 1` and `withInk` returns the
object it was given, so an older build's stroke, erase, undo or clear on
such a canvas is a no-op write and a notice. `readShape` returns the
default style for `icorStyle.version > 1` and `withShape` returns its
input, so an older build's shape or colour choice on such a card
changes nothing. A missing `version` reads as 1.

## 5. Stability of the names, and who reads them

The three names are a contract: `icorShape` and `icorStyle` on a node,
`metadata.icorCanvases` at the top level. They do not change. New
members may be added under them at any time; an existing member changes
its meaning, type or name only with a `version` bump and a migration
written down in this file (the way `icorStyle.stroke` left in 0.3.0,
before any reader shipped).

Readers other than this plugin:

- **ICOR for Life - PDF Annotation** reads all three and never writes
  them.

A reader must treat a missing `version` as 1 and a higher `version` than
it knows as "not for me".

## 6. Coexistence

The plugin's writes preserve, byte for byte:

- every other member of top-level `metadata` (Advanced Canvas keeps its
  own keys there), and every other top-level key of the file;
- every key on a node the plugin does not own, whether Obsidian's or
  another plugin's;
- every key of `icorStyle` this build does not know.

`test/format-coexistence.test.mjs` loads a fixture that carries foreign
keys at both levels, commits a stroke and changes a shape and a colour,
and asserts the foreign keys are identical afterwards. The rule for any
future write path: copy the object you touch, set the keys you own, and
nothing else.
