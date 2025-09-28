// (Query Client was referenced previously; not needed here so import removed)
import { create } from 'zustand';
import { QueryClient } from '@tanstack/react-query';

type TaskStatusValue = 'todo' | 'in-progress' | 'done';
export type StatusFilter = 'all' | TaskStatusValue;

type HistoryActions = {
  undo: () => void;
  redo: () => void;
};

type HistorySet = (partial: Partial<UiState> | ((state: UiState) => Partial<UiState>)) => void;

const cloneUiState = (value: UiState): UiState => ({
  ...value,
  selectedNodeIds: new Set(value.selectedNodeIds),
});

function withHistory(createState: (set: HistorySet, get: () => UiState) => UiState) {
  return (
    set: (partial: Partial<UiState & HistoryActions> | ((state: UiState & HistoryActions) => Partial<UiState & HistoryActions>)) => void,
    get: () => UiState & HistoryActions,
  ): UiState & HistoryActions => {
    const history: UiState[] = [];
    let future: UiState[] = [];

    const getPlainState = (): UiState => {
      const { undo, redo, ...rest } = get();
      void undo;
      void redo;
      return cloneUiState(rest as UiState);
    };

    const setAndRecord: HistorySet = partial => {
      const current = getPlainState();
      history.push(cloneUiState(current));
      future = [];
      const patch = typeof partial === 'function' ? (partial as (state: UiState) => Partial<UiState>)(cloneUiState(current)) : partial;
      set(patch as Partial<UiState & HistoryActions>);
    };

    const baseState = createState(setAndRecord, () => getPlainState());

    const applyState = (next: UiState) => {
      set(() => cloneUiState(next) as Partial<UiState & HistoryActions>);
    };

    return {
      ...baseState,
      undo: () => {
        if (history.length === 0) return;
        const prev = history.pop() as UiState;
        future.push(getPlainState());
        applyState(prev);
      },
      redo: () => {
        if (future.length === 0) return;
        const next = future.pop() as UiState;
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
  withHistory((set, _get) => {
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
