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

  undo(_current: T): T | undefined {
    if (this.undoStack.length <= 1) return undefined;
    const latest = this.undoStack.pop()!;
    this.redoStack.push({ value: this.clone(latest.value), timestamp: latest.timestamp });
    const previous = this.undoStack[this.undoStack.length - 1];
    return this.clone(previous.value);
  }

  redo(_current: T): T | undefined {
    if (this.redoStack.length === 0) return undefined;
    const latest = this.redoStack.pop()!;
    this.undoStack.push({ value: this.clone(latest.value), timestamp: latest.timestamp });
    return this.clone(latest.value);
  }

  reset(initial: T) {
    this.undoStack = [{ value: this.clone(initial), timestamp: Date.now() }];
    this.redoStack = [];
  }
}
