export interface HistoryEntry<T> {
  value: T;
  timestamp: number;
}

export class HistoryStack<T> {
  private undoStack: HistoryEntry<T>[] = [];
  private redoStack: HistoryEntry<T>[] = [];

  constructor(private readonly clone: (value: T) => T) {}

  push(value: T) {
    this.undoStack.push({ value: this.clone(value), timestamp: Date.now() });
    this.redoStack = [];
  }

  undo(current: T): T | undefined {
    if (this.undoStack.length === 0) return undefined;
    const latest = this.undoStack.pop()!;
    this.redoStack.push({ value: this.clone(current), timestamp: Date.now() });
    return this.clone(latest.value);
  }

  redo(current: T): T | undefined {
    if (this.redoStack.length === 0) return undefined;
    const latest = this.redoStack.pop()!;
    this.undoStack.push({ value: this.clone(current), timestamp: Date.now() });
    return this.clone(latest.value);
  }

  reset(initial: T) {
    this.undoStack = [{ value: this.clone(initial), timestamp: Date.now() }];
    this.redoStack = [];
  }
}
