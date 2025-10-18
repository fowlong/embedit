# @embedit/plugin-editor

The EmbedIt editor plugin turns the EmbedPDF viewer into a lightweight PDF editor. It adds an edit mode overlay that lets users select existing text runs, move them around, adjust formatting, reposition raster images, and export a flattened PDF that bakes the edits directly into a new document.

## Installation

```bash
pnpm add @embedit/plugin-editor
```

> The plugin expects to run inside the EmbedPDF viewer runtime. It registers itself through the viewer plugin system and relies on the viewer's page render metadata for text and image positions.

## Usage

```ts
import createEditorPlugin from '@embedit/plugin-editor';

const editorPlugin = createEditorPlugin();
const viewer = await EmbedPDF.create({ container, url });
viewer.use(editorPlugin);

// Optional: access the editor store for imperative helpers
const editorStore = editorPlugin.getStore?.();
```

Once mounted you will see new toolbar buttons:

- **Edit** – toggles edit mode (also available through the `E` hotkey).
- **Save edits** / **Load edits** – export or import the JSON payload that tracks the current editor operations.
- **Export (flattened)** – rebuilds the document by rasterising the original page, replaying image moves, and drawing edited text with a bundled Helvetica fallback before writing a brand new PDF.

## Example playground

Need a quick way to try the editor? The repo ships an [`examples/editor-demo`](../examples/editor-demo) workspace that wires the plugin into the EmbedPDF viewer with buttons for opening documents, toggling edit mode, and saving/loading JSON sessions. Run `pnpm --filter @embedit/example-editor-demo dev` from the repo root to start it locally.

## Saving and loading edits

The plugin exposes two helper methods on the returned capability:

```ts
const editorPlugin = createEditorPlugin();
viewer.use(editorPlugin);
const editor = editorPlugin.getStore?.();

// Serialise to JSON
const json = editor?.serialize();

// Load
editor?.load(json);
```

The JSON schema is documented in [`src/types.ts`](./src/types.ts) and is stable for the MVP release.

## Licence

MIT. The plugin ships a compact PDF writer and reuses image renders produced by the EmbedPDF runtime (which may embed PDFium, Apache-2.0).
