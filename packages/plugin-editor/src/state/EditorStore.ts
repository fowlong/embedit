import type { Viewer, PageRenderContext } from '@embedpdf/viewer';
import {
  Box,
  EditorDoc,
  EditorOp,
  ImageOp,
  SelectionState,
  SerializedEditorDoc,
  TextOp,
  TextStyle,
} from '../types';
import { HistoryStack } from './history';
import { exportFlattenedPdf } from '../export/pdfExport';

export interface EditorStoreOptions {
  viewer: Viewer;
}

export interface EditorState {
  editMode: boolean;
  selection: SelectionState;
  doc: EditorDoc;
  sourcePages: number[];
  toggleEditMode: () => void;
  setEditMode: (value: boolean) => void;
  setSelection: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  clearSelection: () => void;
  moveSelection: (dx: number, dy: number) => void;
  nudgeSelection: (dx: number, dy: number) => void;
  updateText: (id: string, changes: Partial<Pick<TextOp, 'content' | 'style' | 'box'>>) => void;
  updateImage: (id: string, changes: Partial<ImageOp>) => void;
  deleteSelection: () => void;
  ensurePageContent: (ctx: PageRenderContext) => void;
  loadDoc: (doc: SerializedEditorDoc) => void;
  serialize: () => SerializedEditorDoc;
}

const cloneDoc = (doc: EditorDoc): EditorDoc => ({
  ops: doc.ops.map((op) => {
    if (op.type === 'text') {
      const text: TextOp = {
        ...op,
        box: { ...op.box },
        style: { ...op.style },
      };
      return text;
    }
    const image: ImageOp = {
      ...op,
      box: { ...op.box },
      sourceBox: op.sourceBox ? { ...op.sourceBox } : undefined,
    };
    return image;
  }),
});

const snapBox = (box: Box): Box => ({
  x: Math.round(box.x * 1000) / 1000,
  y: Math.round(box.y * 1000) / 1000,
  w: Math.round(box.w * 1000) / 1000,
  h: Math.round(box.h * 1000) / 1000,
});

type PartialState<T> = Partial<T> | ((state: T) => Partial<T> | T);

type SetState<T> = (partial: PartialState<T>, replace?: boolean) => void;

type Selector<TState, TSlice> = (state: TState) => TSlice;

type Listener<TState> = (state: TState, prevState: TState) => void;

interface InternalStore<TState> {
  getState: () => TState;
  setState: SetState<TState>;
  subscribe: <TSlice>(
    selector: Selector<TState, TSlice>,
    listener: (slice: TSlice, previousSlice: TSlice) => void,
    options?: { fireImmediately?: boolean },
  ) => () => void;
  destroy: () => void;
}

function createStore<TState>(initializer: (set: SetState<TState>, get: () => TState) => TState): InternalStore<TState> {
  let state: TState;
  const listeners = new Set<Listener<TState>>();

  const getState = () => state;

  const setState: SetState<TState> = (partial, replace = false) => {
    const prevState = state;
    const partialState = typeof partial === 'function' ? (partial as (state: TState) => Partial<TState> | TState)(prevState) : partial;
    const nextState = replace ? (partialState as TState) : { ...prevState, ...(partialState as Partial<TState>) };
    state = nextState as TState;
    listeners.forEach((listener) => listener(state, prevState));
  };

  state = initializer(setState, getState);

  const subscribe = <TSlice>(
    selector: Selector<TState, TSlice>,
    listener: (slice: TSlice, previousSlice: TSlice) => void,
    options?: { fireImmediately?: boolean },
  ) => {
    let currentSlice = selector(state);
    if (options?.fireImmediately) {
      listener(currentSlice, currentSlice);
    }
    const wrapped: Listener<TState> = (nextState, prevState) => {
      const nextSlice = selector(nextState);
      if (Object.is(nextSlice, currentSlice)) {
        return;
      }
      const previousSlice = currentSlice;
      currentSlice = nextSlice;
      listener(nextSlice, previousSlice);
    };
    listeners.add(wrapped);
    return () => {
      listeners.delete(wrapped);
    };
  };

  const destroy = () => {
    listeners.clear();
  };

  return { getState, setState, subscribe, destroy };
}

const internalStore = createStore<EditorState>((set, get) => ({
  editMode: false,
  selection: { ids: [] },
  doc: { ops: [] },
  sourcePages: [],
  toggleEditMode: () => {
    const state = get();
    set({ editMode: !state.editMode, selection: { ids: [] } });
  },
  setEditMode: (value: boolean) => {
    set((state) => ({ ...state, editMode: value, selection: { ids: [] } }));
  },
  setSelection: (ids: string[]) => set((state) => ({ ...state, selection: { ids } })),
  addToSelection: (id: string) => {
    const current = get().selection.ids;
    if (current.includes(id)) return;
    set((state) => ({ ...state, selection: { ids: [...current, id] } }));
  },
  clearSelection: () => set((state) => ({ ...state, selection: { ids: [] } })),
  moveSelection: (dx: number, dy: number) => {
    const { doc, selection } = get();
    if (selection.ids.length === 0) return;
    const updated = doc.ops.map((op) => {
      if (!selection.ids.includes(op.id)) return op;
      const box = snapBox({
        x: op.box.x + dx,
        y: op.box.y + dy,
        w: op.box.w,
        h: op.box.h,
      });
      return { ...op, box } as EditorOp;
    });
    set((state) => ({ ...state, doc: { ops: updated } }));
  },
  nudgeSelection: (dx: number, dy: number) => {
    const { moveSelection } = get();
    moveSelection(dx, dy);
  },
  updateText: (id: string, changes: Partial<Pick<TextOp, 'content' | 'style' | 'box'>>) => {
    const state = get();
    const updated = state.doc.ops.map((op) => {
      if (op.id !== id || op.type !== 'text') return op;
      const next: TextOp = {
        ...op,
        ...('box' in changes && changes.box ? { box: snapBox({ ...op.box, ...changes.box }) } : {}),
        ...('style' in changes && changes.style ? { style: { ...op.style, ...changes.style } } : {}),
        ...('content' in changes && changes.content !== undefined ? { content: changes.content } : {}),
      } as TextOp;
      return next;
    });
    set((state) => ({ ...state, doc: { ops: updated } }));
  },
  updateImage: (id: string, changes: Partial<ImageOp>) => {
    const state = get();
    const updated = state.doc.ops.map((op) => {
      if (op.id !== id || op.type !== 'image') return op;
      return {
        ...op,
        ...changes,
        box: changes.box ? snapBox({ ...op.box, ...changes.box }) : op.box,
      } as ImageOp;
    });
    set((state) => ({ ...state, doc: { ops: updated } }));
  },
  deleteSelection: () => {
    const { selection, doc } = get();
    if (!selection.ids.length) return;
    set((state) => ({
      ...state,
      doc: { ops: doc.ops.filter((op) => !selection.ids.includes(op.id)) },
      selection: { ids: [] },
    }));
  },
  ensurePageContent: (ctx: PageRenderContext) => {
    const { doc, sourcePages } = get();
    if (sourcePages.includes(ctx.pageIndex)) return;
    const newOps: EditorOp[] = [];
    ctx.text?.forEach((run) => {
      const existing = doc.ops.find((op) => op.type === 'text' && op.sourceRunId === run.id);
      if (existing) return;
      const textOp: TextOp = {
        id: `text-${run.id}`,
        type: 'text',
        pageIndex: ctx.pageIndex,
        content: run.content,
        box: snapBox(run.box as Box),
        style: normalizeStyle(run.style),
        sourceRunId: run.id,
      };
      newOps.push(textOp);
    });
    ctx.images?.forEach((image) => {
      const existing = doc.ops.find((op) => op.type === 'image' && op.sourceImageId === image.id);
      if (existing) return;
      const imageOp: ImageOp = {
        id: `image-${image.id}`,
        type: 'image',
        pageIndex: ctx.pageIndex,
        box: snapBox(image.box as Box),
        sourceBox: snapBox(image.box as Box),
        sourceImageId: image.id,
      };
      newOps.push(imageOp);
    });
    if (newOps.length > 0) {
      set((state) => ({
        ...state,
        doc: { ops: [...doc.ops, ...newOps] },
        sourcePages: [...sourcePages, ctx.pageIndex],
      }));
    } else {
      set((state) => ({ ...state, sourcePages: [...sourcePages, ctx.pageIndex] }));
    }
  },
  loadDoc: (doc: SerializedEditorDoc) => set((state) => ({ ...state, doc: cloneDoc(doc), selection: { ids: [] } })),
  serialize: () => cloneDoc(get().doc),
}));

function normalizeStyle(style: TextStyle | undefined): TextStyle {
  if (!style) {
    return { fontSize: 12, fontWeight: 'normal', fontStyle: 'normal' };
  }
  return {
    fontSize: style.fontSize ?? 12,
    fontWeight: style.fontWeight ?? 'normal',
    fontStyle: style.fontStyle ?? 'normal',
  };
}

type BoundStore = typeof internalStore;

export interface EditorStore {
  useStore: BoundStore;
  getState: BoundStore['getState'];
  subscribe: BoundStore['subscribe'];
  destroy: BoundStore['destroy'];
  toggleEditMode: () => void;
  historyShortcut: (event: KeyboardEvent) => void;
  exportAsPdf: () => Promise<void>;
  load: (doc: SerializedEditorDoc) => void;
  serialize: () => SerializedEditorDoc;
}

export function createEditorStore(options: EditorStoreOptions): EditorStore {
  const history = new HistoryStack<EditorDoc>((value) => cloneDoc(value));
  history.reset({ ops: [] });

  const getState = () => internalStore.getState();
  const toggleEditMode = () => {
    const state = getState();
    state.toggleEditMode();
  };

  const serialize = (): SerializedEditorDoc => {
    return internalStore.getState().serialize();
  };

  const load = (doc: SerializedEditorDoc) => {
    internalStore.getState().loadDoc(doc);
    history.reset(cloneDoc(doc));
  };

  const historyShortcut = (event: KeyboardEvent) => {
    const isRedo = event.shiftKey;
    if (isRedo) {
      const redo = history.redo(internalStore.getState().doc);
      if (redo) {
        internalStore.setState((state) => ({ ...state, doc: redo, selection: { ids: [] } }));
      }
    } else {
      const undo = history.undo(internalStore.getState().doc);
      if (undo) {
        internalStore.setState((state) => ({ ...state, doc: undo, selection: { ids: [] } }));
      }
    }
  };

  const exportAsPdf = async () => {
    const viewer = options.viewer;
    const doc = cloneDoc(internalStore.getState().doc);
    const blob = await exportFlattenedPdf(viewer, doc);
    const filename = viewer.document?.title
      ? `${viewer.document.title.replace(/\.[^.]+$/, '')}.flattened.pdf`
      : 'document.flattened.pdf';
    if (viewer.storage?.saveBlob) {
      await viewer.storage.saveBlob(blob, filename);
    } else {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    }
    viewer.ui?.showToast?.('Exported flattened PDF');
  };

  const store: EditorStore = {
    useStore: internalStore,
    getState,
    subscribe: internalStore.subscribe,
    destroy: () => internalStore.destroy(),
    toggleEditMode,
    historyShortcut,
    exportAsPdf,
    load,
    serialize,
  };

  // subscribe to doc changes for history tracking
  internalStore.subscribe(
    (state) => state.doc,
    (doc) => {
      history.push(doc);
    },
    { fireImmediately: true },
  );

  return store;
}
