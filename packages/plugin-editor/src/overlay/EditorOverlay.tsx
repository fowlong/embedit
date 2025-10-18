import type { PageRenderContext, Viewer } from '@embedpdf/viewer';
import type { EditorStore } from '../state/EditorStore';
import type { EditorState } from '../state/EditorStore';
import type { ImageOp, TextOp } from '../types';
import { TextBox } from './TextBox';
import { ImageBox } from './ImageBox';
import { Marquee } from './Marquee';
import { createGeometry, OverlayGeometry } from './geometry';

interface MountOptions {
  pageCtx: PageRenderContext;
  store: EditorStore;
}

class EditorOverlayInstance {
  private container: HTMLDivElement;
  private textBoxes = new Map<string, TextBox>();
  private imageBoxes = new Map<string, ImageBox>();
  private marquee: Marquee;
  private unsubscribe: () => void;
  private geometry: OverlayGeometry;

  constructor(private readonly pageCtx: PageRenderContext, private readonly store: EditorStore) {
    this.container = document.createElement('div');
    this.container.className = 'embedit-editor-overlay';
    this.container.style.position = 'absolute';
    this.container.style.inset = '0';
    this.container.style.pointerEvents = 'none';
    this.container.style.userSelect = 'none';
    this.container.dataset.pageIndex = String(pageCtx.pageIndex);

    pageCtx.container.style.position = pageCtx.container.style.position || 'relative';
    pageCtx.container.appendChild(this.container);

    this.geometry = createGeometry(pageCtx.viewport.transform);
    this.marquee = new Marquee(this.container, store, this.geometry, pageCtx.pageIndex);

    store.getState().ensurePageContent(pageCtx);

    this.unsubscribe = store.subscribe((state) => state, this.onStateChange);
    this.render(store.getState());
  }

  update(pageCtx: PageRenderContext) {
    this.geometry = createGeometry(pageCtx.viewport.transform);
    this.marquee.updateGeometry(this.geometry);
    this.render(this.store.getState());
  }

  destroy() {
    this.unsubscribe();
    this.textBoxes.forEach((box) => box.destroy());
    this.textBoxes.clear();
    this.imageBoxes.forEach((box) => box.destroy());
    this.imageBoxes.clear();
    this.marquee.destroy();
    this.container.remove();
  }

  private onStateChange = (state: EditorState) => {
    this.render(state);
  };

  private render(state: EditorState) {
    this.container.style.display = state.editMode ? 'block' : 'none';
    this.container.style.pointerEvents = state.editMode ? 'auto' : 'none';
    const ops = state.doc.ops.filter((op) => op.pageIndex === this.pageCtx.pageIndex && !(op.type === 'image' && op.remove));

    const seen = new Set<string>();
    ops.forEach((op) => {
      seen.add(op.id);
      if (op.type === 'text') {
        this.renderText(op, state);
      } else {
        this.renderImage(op, state);
      }
    });

    this.textBoxes.forEach((box, id) => {
      if (!seen.has(id)) {
        box.destroy();
        this.textBoxes.delete(id);
      }
    });
    this.imageBoxes.forEach((box, id) => {
      if (!seen.has(id)) {
        box.destroy();
        this.imageBoxes.delete(id);
      }
    });
  }

  private renderText(op: TextOp, state: EditorState) {
    let box = this.textBoxes.get(op.id);
    if (!box) {
      box = new TextBox(this.container, this.store, op, this.geometry);
      this.textBoxes.set(op.id, box);
    }
    box.update(op, this.geometry);
  }

  private renderImage(op: ImageOp, state: EditorState) {
    let box = this.imageBoxes.get(op.id);
    if (!box) {
      box = new ImageBox(this.container, this.store, op, this.geometry);
      this.imageBoxes.set(op.id, box);
    }
    box.update(op, this.geometry);
  }
}

const instances = new Map<number, EditorOverlayInstance>();

export class EditorOverlay {
  static mount(options: MountOptions) {
    const existing = instances.get(options.pageCtx.pageIndex);
    if (existing) {
      existing.update(options.pageCtx);
      return existing;
    }
    const instance = new EditorOverlayInstance(options.pageCtx, options.store);
    instances.set(options.pageCtx.pageIndex, instance);
    return instance;
  }

  static unmountAll(_viewer: Viewer) {
    instances.forEach((instance) => instance.destroy());
    instances.clear();
  }
}
