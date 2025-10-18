import type { EditorStore } from '../state/EditorStore';
import type { TextOp } from '../types';
import { clearSelection, isSelected, selectSingle, toggleSelection } from './useSelection';
import { Handles } from './Handles';
import { OverlayGeometry, transformBoxToScreen, transformDeltaToPage } from './geometry';

export class TextBox {
  private root: HTMLDivElement;
  private content: HTMLDivElement;
  private toolbar: HTMLDivElement;
  private handles: Handles;
  private dragging = false;
  private dragStart = { x: 0, y: 0 };
  private lastDelta = { x: 0, y: 0 };
  private editing = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly store: EditorStore,
    private op: TextOp,
    private geometry: OverlayGeometry,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'embedit-editor-text';
    this.root.tabIndex = -1;
    this.root.style.pointerEvents = 'auto';
    this.root.style.position = 'absolute';
    this.content = document.createElement('div');
    this.content.className = 'embedit-editor-text-content';
    this.content.style.pointerEvents = 'auto';
    this.toolbar = this.createToolbar();
    this.root.appendChild(this.content);
    this.container.appendChild(this.root);
    this.container.appendChild(this.toolbar);
    this.handles = new Handles({ container: this.container });
    this.attachEvents();
  }

  update(op: TextOp, geometry: OverlayGeometry) {
    this.op = op;
    this.geometry = geometry;
    const viewport = transformBoxToScreen(op.box, geometry);
    this.root.style.left = `${viewport.x}px`;
    this.root.style.top = `${viewport.y}px`;
    this.root.style.width = `${viewport.w}px`;
    this.root.style.height = `${viewport.h}px`;

    if (!this.editing) {
      this.content.textContent = op.content;
    }

    const selected = isSelected(this.store, op.id);
    this.root.dataset.selected = selected ? 'true' : 'false';
    if (selected) {
      this.handles.update(viewport);
    } else {
      this.handles.hide();
    }
    this.toolbar.style.display = selected ? 'flex' : 'none';
      if (selected) {
        this.toolbar.style.left = `${viewport.x}px`;
        this.toolbar.style.top = `${Math.max(0, viewport.y - 32)}px`;
        const sizeInput = this.toolbar.querySelector<HTMLInputElement>('input[type="number"]');
        if (sizeInput) {
          sizeInput.value = String(op.style.fontSize);
        }
      }

    this.content.style.fontSize = `${op.style.fontSize}px`;
    this.content.style.fontWeight = op.style.fontWeight ?? 'normal';
    this.content.style.fontStyle = op.style.fontStyle ?? 'normal';
  }

  destroy() {
    this.detachEvents();
    this.handles.destroy();
    this.root.remove();
    this.toolbar.remove();
  }

  private attachEvents() {
    this.root.addEventListener('pointerdown', this.onPointerDown);
    this.root.addEventListener('dblclick', this.onDoubleClick);
    this.content.addEventListener('blur', this.onBlur);
    this.content.addEventListener('keydown', this.onContentKeydown);
    document.addEventListener('pointermove', this.onPointerMove);
    document.addEventListener('pointerup', this.onPointerUp);
  }

  private detachEvents() {
    this.root.removeEventListener('pointerdown', this.onPointerDown);
    this.root.removeEventListener('dblclick', this.onDoubleClick);
    this.content.removeEventListener('blur', this.onBlur);
    this.content.removeEventListener('keydown', this.onContentKeydown);
    document.removeEventListener('pointermove', this.onPointerMove);
    document.removeEventListener('pointerup', this.onPointerUp);
  }

  private createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'embedit-editor-toolbar';
    toolbar.style.pointerEvents = 'auto';

    const bold = document.createElement('button');
    bold.type = 'button';
    bold.textContent = 'B';
    bold.addEventListener('click', () => {
      const state = this.store.getState();
      const current = state.selection.ids;
      current.forEach((id) => {
        const op = this.findTextOp(id);
        if (!op) return;
        state.updateText(id, {
          style: {
            ...op.style,
            fontWeight: op.style.fontWeight === 'bold' ? 'normal' : 'bold',
          },
        });
      });
    });

    const italic = document.createElement('button');
    italic.type = 'button';
    italic.textContent = 'I';
    italic.addEventListener('click', () => {
      const state = this.store.getState();
      const current = state.selection.ids;
      current.forEach((id) => {
        const op = this.findTextOp(id);
        if (!op) return;
        state.updateText(id, {
          style: {
            ...op.style,
            fontStyle: op.style.fontStyle === 'italic' ? 'normal' : 'italic',
          },
        });
      });
    });

    const sizeInput = document.createElement('input');
    sizeInput.type = 'number';
    sizeInput.min = '6';
    sizeInput.max = '96';
    sizeInput.step = '1';
    sizeInput.value = String(this.op.style.fontSize);
    sizeInput.addEventListener('change', () => {
      const next = Number(sizeInput.value) || this.op.style.fontSize;
      const state = this.store.getState();
      state.selection.ids.forEach((id) => {
        const op = this.findTextOp(id);
        if (!op) return;
        state.updateText(id, { style: { ...op.style, fontSize: next } });
      });
    });

    toolbar.appendChild(bold);
    toolbar.appendChild(italic);
    toolbar.appendChild(sizeInput);
    return toolbar;
  }

  private findTextOp(id: string): TextOp | undefined {
    const candidate = this.store
      .getState()
      .doc.ops.find((op): op is TextOp => op.id === id && op.type === 'text');
    return candidate;
  }

  private onPointerDown = (event: PointerEvent) => {
    if (!this.store.getState().editMode) return;
    event.preventDefault();
    this.root.setPointerCapture(event.pointerId);
    this.dragging = true;
    this.dragStart = { x: event.clientX, y: event.clientY };
    this.lastDelta = { x: 0, y: 0 };
    toggleSelection(this.store, this.op.id, event.shiftKey || event.metaKey || event.ctrlKey);
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.dragging || !this.store.getState().editMode) return;
    const delta = transformDeltaToPage(event.clientX - this.dragStart.x, event.clientY - this.dragStart.y, this.geometry);
    const incremental = {
      x: delta.x - this.lastDelta.x,
      y: delta.y - this.lastDelta.y,
    };
    this.lastDelta = delta;
    this.store.getState().moveSelection(incremental.x, incremental.y);
  };

  private onPointerUp = (event: PointerEvent) => {
    if (!this.dragging) return;
    this.dragging = false;
    this.root.releasePointerCapture(event.pointerId);
  };

  private onDoubleClick = (event: MouseEvent) => {
    event.preventDefault();
    selectSingle(this.store, this.op.id);
    this.startEditing();
  };

  private startEditing() {
    this.editing = true;
    this.content.contentEditable = 'true';
    this.content.focus();
    document.execCommand('selectAll', false);
  }

  private stopEditing(commit = true) {
    if (!this.editing) return;
    this.editing = false;
    this.content.contentEditable = 'false';
    if (commit) {
      const text = this.content.textContent ?? '';
      this.store.getState().updateText(this.op.id, { content: text });
    } else {
      this.content.textContent = this.op.content;
    }
  }

  private onBlur = () => {
    this.stopEditing(true);
  };

  private onContentKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      this.stopEditing(false);
      clearSelection(this.store);
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      this.stopEditing(true);
      clearSelection(this.store);
      event.preventDefault();
    }
  };
}
