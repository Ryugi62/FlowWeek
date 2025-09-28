/// <reference path="../testGlobals.d.ts" />
import { CommandStack } from './commands';

describe('CommandStack', () => {
  const createCommand = (log: string[], label: string) => ({
    redo: () => log.push(`${label}:redo`),
    undo: () => log.push(`${label}:undo`),
  });

  it('executes redo immediately and records history', () => {
    const stack = new CommandStack();
    const log: string[] = [];
    const cmd = createCommand(log, 'one');
    stack.execute(cmd);
    expect(log).toEqual(['one:redo']);
    expect(stack.canUndo()).toBe(true);
    expect(stack.canRedo()).toBe(false);
  });

  it('undos and redos commands in order', () => {
    const stack = new CommandStack();
    const log: string[] = [];
    stack.execute(createCommand(log, 'first'));
    stack.execute(createCommand(log, 'second'));

    stack.undo();
    stack.undo();
    expect(log).toEqual(['first:redo', 'second:redo', 'second:undo', 'first:undo']);
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(true);

    stack.redo();
    expect(log).toEqual([
      'first:redo',
      'second:redo',
      'second:undo',
      'first:undo',
      'first:redo',
    ]);
  });

  it('clears future stack when executing new command after undo', () => {
    const stack = new CommandStack();
    const log: string[] = [];
    stack.execute(createCommand(log, 'a'));
    stack.execute(createCommand(log, 'b'));
    stack.undo();
    expect(stack.canRedo()).toBe(true);

    stack.execute(createCommand(log, 'c'));
    expect(stack.canRedo()).toBe(false);
    stack.redo();
    // redo should only reapply last command
    expect(log.slice(-1)).toEqual(['c:redo']);
  });

  it('notifies subscribers when state changes', () => {
    const stack = new CommandStack();
    const states: Array<{ undo: boolean; redo: boolean }> = [];
    const unsubscribe = stack.subscribe(() => {
      states.push({ undo: stack.canUndo(), redo: stack.canRedo() });
    });

    stack.execute(createCommand([], 'one'));
    stack.undo();
    stack.redo();

    expect(states).toEqual([
      { undo: true, redo: false },
      { undo: false, redo: true },
      { undo: true, redo: false },
    ]);

    unsubscribe();
    stack.clear();
    // after unsubscribe no new entries should be pushed
    expect(states.length).toBe(3);
  });

  it('returns cached snapshots until state changes', () => {
    const stack = new CommandStack();
    const initial = stack.getSnapshot();
    expect(initial).toEqual({ canUndo: false, canRedo: false });

    const log: string[] = [];
    stack.execute(createCommand(log, 'snap'));
    const afterExecute = stack.getSnapshot();
    expect(afterExecute).toEqual({ canUndo: true, canRedo: false });
    expect(afterExecute).not.toBe(initial);

    const sameReference = stack.getSnapshot();
    expect(sameReference).toBe(afterExecute);

    stack.undo();
    const afterUndo = stack.getSnapshot();
    expect(afterUndo).toEqual({ canUndo: false, canRedo: true });
    expect(afterUndo).not.toBe(afterExecute);
  });
});
