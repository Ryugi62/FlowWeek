import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useUiStore } from '../stores';
import type { InteractionMode, StatusFilter } from '../stores';
import type { Node } from '../types';
import { useQueryClient } from '@tanstack/react-query';
import { deleteNode } from '../api';
import { commandStack } from '../stores/commands';

const subscribeToCommandStack = (listener: () => void) => commandStack.subscribe(listener);
const getCommandStackSnapshot = () => commandStack.getSnapshot();

const Toolbar: React.FC = () => {
  const {
    mode,
    setMode,
    searchTerm = '',
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    tagFilters,
    setTagFilters,
  } = useUiStore();
  const queryClient = useQueryClient();
  const [tagInput, setTagInput] = useState((tagFilters || []).join(', '));

  const { canUndo, canRedo } = useSyncExternalStore(
    subscribeToCommandStack,
    getCommandStackSnapshot,
    getCommandStackSnapshot,
  );

  useEffect(() => {
    setTagInput((tagFilters || []).join(', '));
  }, [tagFilters]);

  const applyTagFilter = (value: string) => {
    setTagInput(value);
    const parsed = value
      .split(',')
      .map(token => token.trim().toLowerCase())
      .filter(Boolean);
    setTagFilters(parsed);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete') return;
      const state = useUiStore.getState();
      const ids = Array.from(state.selectedNodeIds);
      if (ids.length === 0) return;
      const boardId = 1;
      const previous = queryClient.getQueryData<Node[]>(['nodes', boardId]) || [];
      const redo = () =>
        queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) =>
          (old || []).filter(n => !ids.includes(n.id)),
        );
      const undo = () => queryClient.setQueryData<Node[]>(['nodes', boardId], previous);
      commandStack.execute({
        redo: () => {
          redo();
          ids.forEach(id => deleteNode(boardId, id).catch(() => {}));
        },
        undo,
      });
      state.clearNodeSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [queryClient]);

  const buttonClass = useMemo(
    () =>
      (buttonMode: InteractionMode | 'action', disabled = false) => {
        const classes = ['toolbar__button'];
        if (buttonMode !== 'action' && mode === buttonMode) classes.push('toolbar__button--active');
        if (disabled) classes.push('toolbar__button--disabled');
        return classes.join(' ');
      },
    [mode],
  );

  return (
    <div className="toolbar">
      <div className="toolbar__group">
        <button className={buttonClass('select')} onClick={() => setMode('select')}>
          Select (V)
        </button>
        <button className={buttonClass('panning')} onClick={() => setMode('panning')}>
          Pan (H)
        </button>
        <button className={buttonClass('linking')} onClick={() => setMode('linking')}>
          Link (L)
        </button>
      </div>

      <div className="toolbar__divider" aria-hidden />

      <input
        className="toolbar__input"
        value={searchTerm}
        onChange={event => setSearchTerm?.(event.target.value)}
        placeholder="Search title or content"
      />

      <select
        className="toolbar__select"
        value={statusFilter ?? 'all'}
        onChange={event => setStatusFilter(event.target.value as StatusFilter)}
      >
        <option value="all">All status</option>
        <option value="todo">Todo</option>
        <option value="in-progress">In progress</option>
        <option value="done">Done</option>
      </select>

      <input
        className="toolbar__input toolbar__input--tags"
        value={tagInput}
        onChange={event => applyTagFilter(event.target.value)}
        placeholder="Tags (comma separated)"
      />

      <div className="toolbar__group">
        <button className={buttonClass('action', !canUndo)} onClick={() => commandStack.undo()} disabled={!canUndo}>
          Undo
        </button>
        <button className={buttonClass('action', !canRedo)} onClick={() => commandStack.redo()} disabled={!canRedo}>
          Redo
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
