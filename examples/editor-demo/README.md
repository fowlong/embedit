# Editor Plugin Demo

Spin up a local playground that wires the new `@embedit/plugin-editor` into the EmbedPDF viewer. The page exposes convenience buttons for opening documents, toggling edit mode, exporting the flattened PDF, and saving/loading edit sessions.

## Development

```bash
pnpm install
pnpm --filter @embedit/example-editor-demo dev
```

Point the `PDF URL` field at any reachable PDF (local dev server path or remote URL) and hit **Open PDF**. Use the toolbar buttons or keyboard shortcuts:

- **E** – toggle edit mode
- **Ctrl/Cmd+Z** and **Shift+Ctrl/Cmd+Z** – undo/redo
- **Arrow keys** – nudge selection (Shift for 10pt)
- **Delete** – remove the current selection

All edits are stored in JSON (`*.embedit.json`). Loading a JSON file restores the per-document operations that the plugin serialises.
