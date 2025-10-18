import type { EditorStore } from '../state/EditorStore';
import { clearSelection } from './useSelection';
import { OverlayGeometry } from './geometry';

export class Marquee {
  private root: HTMLDivElement;
  private active = false;
  private start = { x: 0, y: 0 };
  private last = { x: 0, y: 0 };

  constructor(
    private readonly container: HTMLElement,
    private readonly store: EditorStore,
    private geometry: OverlayGeometry,
    private readonly pageIndex: number,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'embedit-editor-marquee';
    this.root.style.pointerEvents = 'none';
    this.container.appendChild(this.root);
    this.attach();
  }

  updateGeometry(geometry: OverlayGeometry) {
    this.geometry = geometry;
  }

  destroy() {
    this.root.remove();
    this.detach();
  }

  private attach() {
    this.container.addEventListener('pointerdown', this.onPointerDown);
    document.addEventListener('pointermove', this.onPointerMove);
    document.addEventListener('pointerup', this.onPointerUp);
  }

  private detach() {
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    document.removeEventListener('pointermove', this.onPointerMove);
    document.removeEventListener('pointerup', this.onPointerUp);
  }

  private onPointerDown = (event: PointerEvent) => {
    if (!this.store.getState().editMode) return;
    if ((event.target as HTMLElement).closest('.embedit-editor-text, .embedit-editor-image')) {
      return;
    }
    event.preventDefault();
    this.active = true;
    this.start = { x: event.clientX, y: event.clientY };
    this.last = this.start;
    clearSelection(this.store);
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.active) return;
    this.last = { x: event.clientX, y: event.clientY };
    const rect = this.computeRect();
    this.root.style.display = 'block';
    this.root.style.left = `${rect.left}px`;
    this.root.style.top = `${rect.top}px`;
    this.root.style.width = `${rect.width}px`;
    this.root.style.height = `${rect.height}px`;
  };

  private onPointerUp = () => {
    if (!this.active) return;
    this.active = false;
    this.root.style.display = 'none';
    const rect = this.computeRect();
    const geometry = this.geometry;
    const ops = this.store.getState().doc.ops.filter((op) => op.pageIndex === this.pageIndex);
    const selected: string[] = [];
    ops.forEach((op) => {
      const topLeft = geometry.matrix.transformPoint(new DOMPoint(op.box.x, op.box.y));
      if (
        topLeft.x >= rect.left &&
        topLeft.x <= rect.left + rect.width &&
        topLeft.y >= rect.top &&
        topLeft.y <= rect.top + rect.height
      ) {
        selected.push(op.id);
      }
    });
    if (selected.length) {
      this.store.getState().setSelection(selected);
    }
  };

  private computeRect() {
    const left = Math.min(this.start.x, this.last.x);
    const top = Math.min(this.start.y, this.last.y);
    const width = Math.abs(this.last.x - this.start.x);
    const height = Math.abs(this.last.y - this.start.y);
    return { left, top, width, height };
  }
}
