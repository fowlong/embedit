import type { Plugin, Viewer } from '@embedpdf/viewer';
import { EditorOverlay } from './overlay/EditorOverlay';
import { createEditorStore } from './state/EditorStore';
import type { EditorStore } from './state/EditorStore';

function injectStyles(target: HTMLElement): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
    .embedit-editor-overlay {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      position: absolute;
      inset: 0;
      pointer-events: none;
      user-select: none;
      z-index: 50;
    }
    .embedit-editor-text,
    .embedit-editor-image {
      position: absolute;
      border: 1px solid transparent;
      border-radius: 2px;
      pointer-events: auto;
    }
    .embedit-editor-text[data-selected='true'],
    .embedit-editor-image[data-selected='true'] {
      border-color: #1a73e8;
      box-shadow: 0 0 0 1px rgba(26, 115, 232, 0.35);
    }
    .embedit-editor-text-content {
      width: 100%;
      height: 100%;
      white-space: pre-wrap;
      outline: none;
      cursor: text;
      color: #111827;
      background: rgba(255, 255, 255, 0.01);
    }
    .embedit-editor-image {
      background: rgba(17, 24, 39, 0.08);
    }
    .embedit-editor-toolbar {
      position: absolute;
      padding: 4px 6px;
      border-radius: 4px;
      background: rgba(17, 24, 39, 0.9);
      color: #fff;
      font-size: 12px;
      display: flex;
      gap: 4px;
      align-items: center;
    }
    .embedit-editor-toolbar button {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.4);
      color: inherit;
      width: 22px;
      height: 22px;
      border-radius: 3px;
      cursor: pointer;
    }
    .embedit-editor-toolbar input[type='number'] {
      width: 48px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.3);
      color: inherit;
      border-radius: 3px;
      padding: 2px 4px;
    }
    .embedit-editor-handles {
      position: absolute;
      pointer-events: none;
      border: 1px dashed rgba(26, 115, 232, 0.7);
      box-sizing: border-box;
    }
    .embedit-editor-handle {
      position: absolute;
      width: 8px;
      height: 8px;
      background: #1a73e8;
      border-radius: 50%;
      pointer-events: none;
    }
    .embedit-editor-handle-nw { top: -4px; left: -4px; }
    .embedit-editor-handle-ne { top: -4px; right: -4px; }
    .embedit-editor-handle-sw { bottom: -4px; left: -4px; }
    .embedit-editor-handle-se { bottom: -4px; right: -4px; }
    .embedit-editor-marquee {
      position: absolute;
      border: 1px solid rgba(26, 115, 232, 0.5);
      background: rgba(26, 115, 232, 0.15);
      display: none;
    }
  `;
  target.appendChild(style);
  return style;
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  requestAnimationFrame(() => {
    URL.revokeObjectURL(link.href);
    link.remove();
  });
}

function createFileLoader(onLoad: (json: string) => void): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onLoad(reader.result);
      }
      input.value = '';
    };
    reader.readAsText(file);
  });
  return input;
}

function registerKeyboard(store: EditorStore) {
  const handler = (event: KeyboardEvent) => {
    if (!store.getState().editMode) return;
    const selection = store.getState().selection.ids;
    if (selection.length === 0) return;
    const step = event.shiftKey ? 10 : 1;
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        store.getState().moveSelection(0, -step);
        break;
      case 'ArrowDown':
        event.preventDefault();
        store.getState().moveSelection(0, step);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        store.getState().moveSelection(-step, 0);
        break;
      case 'ArrowRight':
        event.preventDefault();
        store.getState().moveSelection(step, 0);
        break;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        store.getState().deleteSelection();
        break;
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}

export function createEditorPlugin(): Plugin & { getStore?: () => EditorStore } {
  const plugin: Plugin & { getStore?: () => EditorStore } = {
    name: 'editor',
    onAttach(viewer: Viewer) {
      const store = createEditorStore({ viewer });
      plugin.getStore = () => store;
      const disposers: Array<() => void> = [];
      const style = injectStyles(viewer.container);
      const fileInput = createFileLoader((json) => {
        try {
          const data = JSON.parse(json);
          store.load(data);
          viewer.ui?.showToast?.('Edits loaded', { type: 'success' });
        } catch (error) {
          viewer.ui?.showToast?.('Failed to parse edits JSON', { type: 'error' });
        }
      });
      viewer.container.appendChild(fileInput);

      const unbindKeyboard = registerKeyboard(store);
      disposers.push(unbindKeyboard);

      const unsubscribeRender = viewer.pages.onRender((pageCtx) => {
        store.getState().ensurePageContent(pageCtx);
        EditorOverlay.mount({ pageCtx, store });
      });
      disposers.push(unsubscribeRender);

      viewer.toolbar.registerButton({
        id: 'toggle-edit',
        label: 'Edit',
        tooltip: 'Toggle edit mode (E)',
        onClick: () => store.toggleEditMode(),
        isActive: () => store.getState().editMode,
      });

      viewer.toolbar.registerButton({
        id: 'save-edits',
        label: 'Save edits',
        tooltip: 'Download edits JSON',
        onClick: () => {
          const json = JSON.stringify(store.serialize(), null, 2);
          const blob = new Blob([json], { type: 'application/json' });
          const filename = viewer.document?.title
            ? `${viewer.document.title.replace(/\.[^.]+$/, '')}.embedit.json`
            : 'document.embedit.json';
          downloadBlob(blob, filename);
        },
      });

      viewer.toolbar.registerButton({
        id: 'load-edits',
        label: 'Load edits',
        tooltip: 'Load edits JSON',
        onClick: () => fileInput.click(),
      });

      viewer.toolbar.registerButton({
        id: 'export-flattened',
        label: 'Export',
        tooltip: 'Export flattened PDF',
        onClick: () => store.exportAsPdf(),
      });

      const unbindToggle = viewer.keyboard.bind('e', () => store.toggleEditMode());
      disposers.push(unbindToggle);
      const unbindHistory = viewer.keyboard.bind(['mod+z', 'mod+shift+z'], (evt) => {
        evt.preventDefault();
        store.historyShortcut(evt);
      });
      disposers.push(unbindHistory);

      return () => {
        disposers.forEach((dispose) => dispose());
        style.remove();
        fileInput.remove();
        EditorOverlay.unmountAll(viewer);
        store.destroy();
        plugin.getStore = undefined;
      };
    },
  };

  return plugin;
}
