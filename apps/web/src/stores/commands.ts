type Command = {
  undo: () => void;
  redo: () => void;
};

export class CommandStack {
  private past: Command[] = [];
  private future: Command[] = [];
  private listeners = new Set<() => void>();

  private notify() {
    this.listeners.forEach(listener => listener());
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  execute(cmd: Command) {
    cmd.redo();
    this.past.push(cmd);
    this.future = [];
    this.notify();
  }

  undo() {
    const cmd = this.past.pop();
    if (!cmd) return;
    cmd.undo();
    this.future.push(cmd);
    this.notify();
  }

  redo() {
    const cmd = this.future.pop();
    if (!cmd) return;
    cmd.redo();
    this.past.push(cmd);
    this.notify();
  }

  canUndo() { return this.past.length > 0; }
  canRedo() { return this.future.length > 0; }

  clear() {
    this.past = [];
    this.future = [];
    this.notify();
  }
}

export const commandStack = new CommandStack();
