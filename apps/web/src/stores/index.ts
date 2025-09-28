// (Query Client was referenced previously; not needed here so import removed)
import { create } from 'zustand';
import { QueryClient } from '@tanstack/react-query';

type TaskStatusValue = 'todo' | 'in-progress' | 'done';
export type StatusFilter = 'all' | TaskStatusValue;

type HistoryActions = {
  undo: () => void;
  redo: () => void;
};

type HistorySet<S extends object> = (partial: Partial<S> | ((state: S) => Partial<S>)) => void;

function withHistory<S extends object>(
  createState: (set: HistorySet<S>, get: () => S) => S,
) {
  return (
    set: (partial: Partial<S & HistoryActions> | ((state: S & HistoryActions) => Partial<S & HistoryActions>)) => void,
    get: () => S & HistoryActions,
  ): S & HistoryActions => {
    const history: S[] = [];
    let future: S[] = [];

    const getPlainState = (): S => {
      const { undo, redo, ...rest } = get();
      void undo;
      void redo;
      return rest as S;
    };

    const setAndRecord: HistorySet<S> = partial => {
      const current = getPlainState();
      history.push(JSON.parse(JSON.stringify(current)) as S);
      future = [];
      const patch = typeof partial === 'function' ? (partial as (state: S) => Partial<S>)(current) : partial;
      set(patch as Partial<S & HistoryActions>);
    };

    const baseState = createState(setAndRecord, getPlainState);

    const applyState = (next: S) => {
      set(() => next as Partial<S & HistoryActions>);
    };

    return {
      ...baseState,
      undo: () => {
        if (history.length === 0) return;
        const prev = history.pop() as S;
        future.push(getPlainState());
        applyState(prev);
      },
      redo: () => {
        if (future.length === 0) return;
        const next = future.pop() as S;
        history.push(getPlainState());
        applyState(next);
      },
    };
  };
}

// ... (Query Client is the same)

export type InteractionMode = 'select' | 'panning' | 'linking';

interface UiState {
  view: { x: number; y: number; zoom: number };
  mode: InteractionMode;
  selectedNodeIds: Set<number>;
  searchTerm?: string;
  statusFilter: StatusFilter;
  tagFilters: string[];
  setView: (view: Partial<UiState['view']>) => void;
  setMode: (mode: InteractionMode) => void;
  toggleNodeSelection: (nodeId: number) => void;
  clearNodeSelection: () => void;
  selectNode: (nodeId: number, shiftKey: boolean) => void;
  selectNodes: (nodeIds: number[], additive?: boolean) => void;
  setStatusFilter: (status: StatusFilter) => void;
  setTagFilters: (tags: string[]) => void;
  setSearchTerm?: (term: string) => void;
  // history methods added by withHistory wrapper
  undo?: () => void;
  redo?: () => void;
}

export const useUiStore = create<UiState & HistoryActions>()(
  withHistory<UiState>((set, _get) => {
    void _get;
    return {
      view: { x: 0, y: 0, zoom: 1 },
      mode: 'select',
      selectedNodeIds: new Set<number>(),
      searchTerm: '',
      statusFilter: 'all',
      tagFilters: [],
      setView: (newView: Partial<UiState['view']>) =>
        set(state => ({ view: { ...state.view, ...newView } })),
      setMode: (newMode: InteractionMode) => set({ mode: newMode }),
      toggleNodeSelection: (nodeId: number) =>
        set(state => {
          const newSelection = new Set(state.selectedNodeIds);
          if (newSelection.has(nodeId)) {
            newSelection.delete(nodeId);
          } else {
            newSelection.add(nodeId);
          }
          return { selectedNodeIds: newSelection };
        }),
      clearNodeSelection: () => set({ selectedNodeIds: new Set<number>() }),
      selectNode: (nodeId: number, shiftKey: boolean) =>
        set(state => {
          if (shiftKey) {
            const newSelection = new Set(state.selectedNodeIds);
            if (newSelection.has(nodeId)) newSelection.delete(nodeId);
            else newSelection.add(nodeId);
            return { selectedNodeIds: newSelection };
          }
          return { selectedNodeIds: new Set<number>([nodeId]) };
        }),
      selectNodes: (nodeIds: number[], additive = false) =>
        set(state => {
          const next = additive ? new Set(state.selectedNodeIds) : new Set<number>();
          nodeIds.forEach(id => next.add(id));
          return { selectedNodeIds: next };
        }),
      setStatusFilter: (status: StatusFilter) => set({ statusFilter: status }),
      setTagFilters: (tags: string[]) => set({ tagFilters: tags }),
      setSearchTerm: (term: string) => set(() => ({ searchTerm: term })),
    };
  }),
);

// Provide a QueryClient export for the app
export const queryClient = new QueryClient();
