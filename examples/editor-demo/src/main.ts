import createEditorPlugin from '@embedit/plugin-editor';

async function boot() {
  const container = document.getElementById('viewer');
  if (!container) throw new Error('Viewer container missing');

  const EmbedPDF: any = (window as any).EmbedPDF ?? (await import('@embedpdf/core'));
  if (!EmbedPDF?.create) {
    throw new Error('EmbedPDF runtime not found. Ensure @embedpdf/core is bundled.');
  }

  const viewer = await EmbedPDF.create({
    container,
    url: (document.getElementById('pdf-url') as HTMLInputElement).value,
  });

  const editorPlugin = createEditorPlugin();
  viewer.use(editorPlugin);
  const editorStore = editorPlugin.getStore?.();

  document.getElementById('open')?.addEventListener('click', async () => {
    const url = (document.getElementById('pdf-url') as HTMLInputElement).value.trim();
    if (!url) return;
    await viewer.open({ url });
  });

  document.getElementById('toggle-edit')?.addEventListener('click', () => {
    editorStore?.toggleEditMode();
  });

  document.getElementById('save-edits')?.addEventListener('click', () => {
    if (!editorStore) return;
    const json = JSON.stringify(editorStore.serialize(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'document.embedit.json';
    link.click();
    URL.revokeObjectURL(link.href);
  });

  document.getElementById('load-edits')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      file.text().then((text) => {
        const data = JSON.parse(text);
        editorStore?.load(data);
      });
    });
    input.click();
  });

  document.getElementById('export-pdf')?.addEventListener('click', () => {
    editorStore?.exportAsPdf();
  });
}

boot().catch((error) => {
  console.error('Failed to boot editor demo', error);
});
