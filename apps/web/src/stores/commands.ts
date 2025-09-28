type Command = {
  undo: () => void;
  redo: () => void;
};

type CommandSnapshot = {
  canUndo: boolean;
  canRedo: boolean;
};

export class CommandStack {
  private past: Command[] = [];
  private future: Command[] = [];
  private listeners = new Set<() => void>();
  private snapshot: CommandSnapshot = { canUndo: false, canRedo: false };

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): CommandSnapshot {
    return this.snapshot;
  }

  private emitIfChanged() {
    const next: CommandSnapshot = {
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
    };
    if (
      next.canUndo === this.snapshot.canUndo &&
      next.canRedo === this.snapshot.canRedo
    ) {
      return;
    }
    this.snapshot = next;
    this.listeners.forEach(listener => listener());
  }

  execute(cmd: Command) {
    cmd.redo();
    this.past.push(cmd);
    this.future = [];
    this.emitIfChanged();
  }

  undo() {
    const cmd = this.past.pop();
    if (!cmd) return;
    cmd.undo();
    this.future.push(cmd);
    this.emitIfChanged();
  }

  redo() {
    const cmd = this.future.pop();
    if (!cmd) return;
    cmd.redo();
    this.past.push(cmd);
    this.emitIfChanged();
  }

  canUndo() { return this.past.length > 0; }
  canRedo() { return this.future.length > 0; }

  clear() {
    if (this.past.length === 0 && this.future.length === 0) return;
    this.past = [];
    this.future = [];
    this.emitIfChanged();
  }
}

export const commandStack = new CommandStack();
