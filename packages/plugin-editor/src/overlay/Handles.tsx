import { Box } from '../types';

export type HandlePosition = 'nw' | 'ne' | 'sw' | 'se';

export interface HandlesOptions {
  container: HTMLElement;
}

export class Handles {
  private root: HTMLDivElement;
  private handles: Record<HandlePosition, HTMLDivElement>;

  constructor(options: HandlesOptions) {
    this.root = document.createElement('div');
    this.root.className = 'embedit-editor-handles';
    this.handles = {
      nw: this.createHandle('nw'),
      ne: this.createHandle('ne'),
      sw: this.createHandle('sw'),
      se: this.createHandle('se'),
    };

    Object.values(this.handles).forEach((handle) => this.root.appendChild(handle));
    options.container.appendChild(this.root);
  }

  update(box: Box) {
    this.root.style.display = 'block';
    this.root.style.left = `${box.x}px`;
    this.root.style.top = `${box.y}px`;
    this.root.style.width = `${box.w}px`;
    this.root.style.height = `${box.h}px`;
  }

  hide() {
    this.root.style.display = 'none';
  }

  destroy() {
    this.root.remove();
  }

  private createHandle(position: HandlePosition) {
    const el = document.createElement('div');
    el.dataset.position = position;
    el.className = `embedit-editor-handle embedit-editor-handle-${position}`;
    return el;
  }
}
