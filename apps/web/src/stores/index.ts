// (Query Client was referenced previously; not needed here so import removed)
import { create } from 'zustand';
import { QueryClient } from '@tanstack/react-query';

type TaskStatusValue = 'todo' | 'in-progress' | 'done';
type StatusFilter = 'all' | TaskStatusValue;

// Simple history wrapper to provide undo/redo functionality without external middleware
type SetFn<S> = (partial: Partial<S> | ((state: S) => Partial<S>)) => void;

function withHistory<S extends object>(createState: (set: SetFn<S>, get: () => S) => S & Record<string, any>) {
  return (set: any, get: any) => {
    const history: S[] = [];
    let future: S[] = [];

    const setAndRecord: SetFn<S> = (partial) => {
      const current = get();
      history.push(JSON.parse(JSON.stringify(current)));
      // clear future on new action
      future = [];
      const patch = typeof partial === 'function' ? (partial as any)(current) : partial;
      set(patch as any);
    };

    const base = createState(setAndRecord, get);

    return {
      ...base,
      undo: () => {
        if (history.length === 0) return;
        const prev = history.pop() as S;
        future.push(JSON.parse(JSON.stringify(get())));
        set((prev as any));
      },
      redo: () => {
        if (future.length === 0) return;
        const next = future.pop() as S;
        history.push(JSON.parse(JSON.stringify(get())));
        set((next as any));
      }
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

export const useUiStore = create<UiState & { undo?: () => void; redo?: () => void }>()(
  withHistory((set: SetFn<any>) => ({
    view: { x: 0, y: 0, zoom: 1 },
    mode: 'select',
    selectedNodeIds: new Set<number>(),
    searchTerm: '',
    statusFilter: 'all',
    tagFilters: [],
    setView: (newView: Partial<UiState['view']>) =>
      set((state: UiState) => ({ view: { ...state.view, ...newView } })),
    setMode: (newMode: InteractionMode) => set({ mode: newMode }),
    toggleNodeSelection: (nodeId: number) =>
      set((state: UiState) => {
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
      set((state: UiState) => {
        if (shiftKey) {
          const newSelection = new Set(state.selectedNodeIds);
          if (newSelection.has(nodeId)) newSelection.delete(nodeId);
          else newSelection.add(nodeId);
          return { selectedNodeIds: newSelection };
        }
        return { selectedNodeIds: new Set<number>([nodeId]) };
      }),
    selectNodes: (nodeIds: number[], additive = false) =>
      set((state: UiState) => {
        const next = additive ? new Set(state.selectedNodeIds) : new Set<number>();
        nodeIds.forEach(id => next.add(id));
        return { selectedNodeIds: next };
      }),
    setStatusFilter: (status: StatusFilter) => set({ statusFilter: status }),
    setTagFilters: (tags: string[]) => set({ tagFilters: tags }),
    setSearchTerm: (term: string) => set(() => ({ searchTerm: term })),
  })),
);

// Provide a QueryClient export for the app
export const queryClient = new QueryClient();
