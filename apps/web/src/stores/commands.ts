type Command = {
  undo: () => void;
  redo: () => void;
};

class CommandStack {
  private past: Command[] = [];
  private future: Command[] = [];

  execute(cmd: Command) {
    cmd.redo();
    this.past.push(cmd);
    this.future = [];
  }

  undo() {
    const cmd = this.past.pop();
    if (!cmd) return;
    cmd.undo();
    this.future.push(cmd);
  }

  redo() {
    const cmd = this.future.pop();
    if (!cmd) return;
    cmd.redo();
    this.past.push(cmd);
  }

  canUndo() { return this.past.length > 0; }
  canRedo() { return this.future.length > 0; }
}

export const commandStack = new CommandStack();
