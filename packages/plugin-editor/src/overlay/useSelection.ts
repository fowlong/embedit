import type { EditorStore } from '../state/EditorStore';

export function isSelected(store: EditorStore, id: string): boolean {
  return store.getState().selection.ids.includes(id);
}

export function selectSingle(store: EditorStore, id: string) {
  const state = store.getState();
  state.setSelection([id]);
}

export function toggleSelection(store: EditorStore, id: string, additive: boolean) {
  const state = store.getState();
  const current = state.selection.ids;
  if (!additive) {
    state.setSelection([id]);
    return;
  }
  if (current.includes(id)) {
    state.setSelection(current.filter((item) => item !== id));
  } else {
    state.setSelection([...current, id]);
  }
}

export function clearSelection(store: EditorStore) {
  store.getState().clearSelection();
}
