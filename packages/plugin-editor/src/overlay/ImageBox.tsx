import type { EditorStore } from '../state/EditorStore';
import type { ImageOp } from '../types';
import { clearSelection, isSelected, selectSingle, toggleSelection } from './useSelection';
import { OverlayGeometry, transformBoxToScreen, transformDeltaToPage } from './geometry';

export class ImageBox {
  private root: HTMLDivElement;
  private dragging = false;
  private dragStart = { x: 0, y: 0 };
  private lastDelta = { x: 0, y: 0 };

  constructor(
    private readonly container: HTMLElement,
    private readonly store: EditorStore,
    private op: ImageOp,
    private geometry: OverlayGeometry,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'embedit-editor-image';
    this.root.tabIndex = -1;
    this.root.style.pointerEvents = 'auto';
    this.root.style.position = 'absolute';
    this.container.appendChild(this.root);
    this.attachEvents();
  }

  update(op: ImageOp, geometry: OverlayGeometry) {
    this.op = op;
    this.geometry = geometry;
    const viewport = transformBoxToScreen(op.box, geometry);
    if (!viewport) return;
    this.root.style.left = `${viewport.x}px`;
    this.root.style.top = `${viewport.y}px`;
    this.root.style.width = `${viewport.w}px`;
    this.root.style.height = `${viewport.h}px`;
    this.root.dataset.selected = isSelected(this.store, op.id) ? 'true' : 'false';
  }

  destroy() {
    this.detachEvents();
    this.root.remove();
  }

  private attachEvents() {
    this.root.addEventListener('pointerdown', this.onPointerDown);
    this.root.addEventListener('dblclick', this.onDoubleClick);
    document.addEventListener('pointermove', this.onPointerMove);
    document.addEventListener('pointerup', this.onPointerUp);
  }

  private detachEvents() {
    this.root.removeEventListener('pointerdown', this.onPointerDown);
    this.root.removeEventListener('dblclick', this.onDoubleClick);
    document.removeEventListener('pointermove', this.onPointerMove);
    document.removeEventListener('pointerup', this.onPointerUp);
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
    if (!this.dragging) return;
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
    if (event.altKey) {
      selectSingle(this.store, this.op.id);
      this.store.getState().deleteSelection();
      clearSelection(this.store);
    }
  };
}
