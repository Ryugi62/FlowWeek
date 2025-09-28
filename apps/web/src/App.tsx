import './App.css';
import InfiniteCanvas from './components/InfiniteCanvas';
import DetailPanel from './components/DetailPanel';
import Toolbar from './components/Toolbar';
import { useQuery } from '@tanstack/react-query';
import apiClient, {
  connectWs,
  updateNode as updateNodeApi,
  setApiClientId,
  createNode,
  deleteNode,
  type NodeWritePayload,
} from './api';
import type { WsMessage } from './api';
import { queryClient } from './stores';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useUiStore } from './stores';
import { commandStack } from './stores/commands';
import type { Flow, Node, Edge } from './types';
import { getOrCreateClientId } from './utils/clientId';

// API fetch functions
// ... (fetch functions remain the same)

function App() {
  const boardId = 1; // Placeholder
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const clientId = useMemo(() => {
    const id = getOrCreateClientId();
    setApiClientId(id);
    return id;
  }, []);

  const applyNodeTransform = useCallback(
    (builder: (nodes: Node[]) => Map<number, Partial<Node>>) => {
      const selectedIds = Array.from(useUiStore.getState().selectedNodeIds);
      if (selectedIds.length < 2) return;
      const currentNodes = queryClient.getQueryData<Node[]>(['nodes', boardId]) || [];
      const selectedNodes = currentNodes.filter(n => selectedIds.includes(n.id));
      if (selectedNodes.length < 2) return;
      const updates = builder(selectedNodes);
      if (!updates || updates.size === 0) return;

      const prevMap = new Map<number, { x: number; y: number; width: number; height: number }>();
      selectedNodes.forEach(n => prevMap.set(n.id, { x: n.x, y: n.y, width: n.width, height: n.height }));

      commandStack.execute({
        redo: () => {
          queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) =>
            (old || []).map(node => (updates.has(node.id) ? { ...node, ...updates.get(node.id)! } : node)),
          );
          updates.forEach((val, id) => updateNodeApi(boardId, id, val).catch(() => {}));
        },
        undo: () => {
          queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) =>
            (old || []).map(node => (prevMap.has(node.id) ? { ...node, ...prevMap.get(node.id)! } : node)),
          );
          prevMap.forEach((val, id) => updateNodeApi(boardId, id, val).catch(() => {}));
        },
      });
    },
    [boardId],
  );

  const alignNodes = useCallback(
    (direction: 'left' | 'right' | 'top' | 'bottom') => {
      applyNodeTransform(selected => {
        const updates = new Map<number, Partial<Node>>();
        if (direction === 'left') {
          const target = Math.min(...selected.map(n => n.x));
          selected.forEach(n => {
            const nextX = Math.round(target);
            if (nextX !== n.x) updates.set(n.id, { x: nextX });
          });
        } else if (direction === 'right') {
          const target = Math.max(...selected.map(n => n.x + n.width));
          selected.forEach(n => {
            const nextX = Math.round(target - n.width);
            if (nextX !== n.x) updates.set(n.id, { x: nextX });
          });
        } else if (direction === 'top') {
          const target = Math.min(...selected.map(n => n.y));
          selected.forEach(n => {
            const nextY = Math.round(target);
            if (nextY !== n.y) updates.set(n.id, { y: nextY });
          });
        } else {
          const target = Math.max(...selected.map(n => n.y + n.height));
          selected.forEach(n => {
            const nextY = Math.round(target - n.height);
            if (nextY !== n.y) updates.set(n.id, { y: nextY });
          });
        }
        return updates;
      });
    },
    [applyNodeTransform],
  );

  const distributeNodes = useCallback(
    (axis: 'horizontal' | 'vertical') => {
      applyNodeTransform(selected => {
        if (selected.length <= 2) return new Map();
        const sorted = [...selected].sort((a, b) =>
          axis === 'horizontal' ? a.x - b.x : a.y - b.y,
        );
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const min = axis === 'horizontal' ? first.x : first.y;
        const max = axis === 'horizontal' ? last.x + last.width : last.y + last.height;
        const totalSize = sorted.reduce(
          (sum, node) => sum + (axis === 'horizontal' ? node.width : node.height),
          0,
        );
        const gapCount = sorted.length - 1;
        const gap = Math.max(0, (max - min - totalSize) / gapCount);
        const updates = new Map<number, Partial<Node>>();
        let cursor =
          (axis === 'horizontal'
            ? first.x + first.width
            : first.y + first.height) + gap;
        for (let i = 1; i < sorted.length - 1; i++) {
          const node = sorted[i];
          if (axis === 'horizontal') {
            const nextX = Math.round(cursor);
            if (nextX !== node.x) updates.set(node.id, { x: nextX });
            cursor += node.width + gap;
          } else {
            const nextY = Math.round(cursor);
            if (nextY !== node.y) updates.set(node.id, { y: nextY });
            cursor += node.height + gap;
          }
        }
        return updates;
      });
    },
    [applyNodeTransform],
  );

  const duplicateSelectedNodes = useCallback(async (currentNodes: Node[]) => {
    const state = useUiStore.getState();
    const selectedIds = Array.from(state.selectedNodeIds);
    if (!selectedIds.length) return;

    const originals = currentNodes.filter(n => selectedIds.includes(n.id));
    if (!originals.length) return;

    const boardKey = ['nodes', boardId] as const;
    const offset = 28;
    const now = Date.now();
    const optimisticCopies = originals.map((node, index) => ({
      ...node,
      id: -(now + index),
      x: node.x + offset,
      y: node.y + offset,
      title: node.title ? `${node.title} (copy)` : 'Copy',
      updated_at: new Date().toISOString(),
    }));

    const payloads: NodeWritePayload[] = originals.map(node => ({
      flow_id: node.flow_id,
      type: node.type,
      status: node.status ?? (node.type === 'task' ? 'todo' : null),
      tags: node.tags,
      journaled_at: node.journaled_at,
      x: node.x + offset,
      y: node.y + offset,
      width: node.width,
      height: node.height,
      title: node.title,
      content: node.content,
    }));

    let persistedCopies: Node[] = [];
    let cancelled = false;

    commandStack.execute({
      redo: () => {
        cancelled = false;
        queryClient.setQueryData<Node[]>(boardKey, (old = []) => [...old, ...optimisticCopies]);
        useUiStore.getState().selectNodes(optimisticCopies.map(n => n.id), false);

        (async () => {
          try {
            const results = await Promise.all(payloads.map(payload => createNode(boardId, payload)));
            if (cancelled) {
              results.forEach(res => {
                const created = res.data?.data as Node | undefined;
                if (created) deleteNode(boardId, created.id).catch(() => {});
              });
              return;
            }

            persistedCopies = results
              .map(res => res.data?.data as Node | undefined)
              .filter((node): node is Node => Boolean(node));

            if (persistedCopies.length) {
              const persistedIds = new Set(persistedCopies.map(n => n.id));
              queryClient.setQueryData<Node[]>(boardKey, (old = []) => {
                const filtered = (old || []).filter(n => !optimisticCopies.find(o => o.id === n.id));
                const existing = filtered.filter(n => !persistedIds.has(n.id));
                return [...existing, ...persistedCopies];
              });
              useUiStore.getState().selectNodes(persistedCopies.map(n => n.id), false);
            } else {
              queryClient.invalidateQueries({ queryKey: boardKey });
            }
          } catch {
            queryClient.invalidateQueries({ queryKey: boardKey });
          }
        })();
      },
      undo: () => {
        cancelled = true;
        const idsToRemove = new Set(
          (persistedCopies.length ? persistedCopies : optimisticCopies).map(n => n.id),
        );
        queryClient.setQueryData<Node[]>(boardKey, (old = []) =>
          (old || []).filter(n => !idsToRemove.has(n.id)),
        );
        if (persistedCopies.length) {
          persistedCopies.forEach(copy => deleteNode(boardId, copy.id).catch(() => {}));
        }
        persistedCopies = [];
        useUiStore.getState().clearNodeSelection();
      },
    });
  }, [boardId]);

  const zoomBy = useCallback((delta: number) => {
    const store = useUiStore.getState();
    const nextZoom = Math.min(3, Math.max(0.2, store.view.zoom + delta));
    store.setView({ zoom: Number(nextZoom.toFixed(2)) });
  }, []);

  const resetView = useCallback(() => {
    const store = useUiStore.getState();
    store.setView({ zoom: 1, x: 0, y: 0 });
  }, []);

  const { data: flows = [] } = useQuery<Flow[]>({ queryKey: ['flows', boardId], queryFn: () => fetchFlows(boardId) });
  const { data: nodes = [] } = useQuery<Node[]>({ queryKey: ['nodes', boardId], queryFn: () => fetchNodes(boardId) });
  const { data: edges = [] } = useQuery<Edge[]>({ queryKey: ['edges', boardId], queryFn: () => fetchEdges(boardId) });

  const currentNodesRef = useRef<Node[]>(nodes);
  useEffect(() => {
    currentNodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMeta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (isMeta) {
        if (key === 'z') {
          event.preventDefault();
          const store = useUiStore.getState();
          if (event.shiftKey) {
            store.redo?.();
          } else {
            store.undo?.();
          }
          return;
        }
        if (key === 'y') {
          event.preventDefault();
          useUiStore.getState().redo?.();
          return;
        }
        if (key === 'a') {
          event.preventDefault();
          useUiStore.getState().selectNodes(currentNodesRef.current.map(n => n.id), false);
          return;
        }
        if (key === 'd') {
          event.preventDefault();
          duplicateSelectedNodes(currentNodesRef.current);
          return;
        }
        if (key === '=' || key === '+') {
          event.preventDefault();
          zoomBy(0.1);
          return;
        }
        if (key === '-') {
          event.preventDefault();
          zoomBy(-0.1);
          return;
        }
        if (key === '0') {
          event.preventDefault();
          resetView();
          return;
        }
      }

      if (event.altKey && event.shiftKey && !isMeta) {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          alignNodes('left');
          return;
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          alignNodes('right');
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          alignNodes('top');
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          alignNodes('bottom');
          return;
        }
        if (key === 'h') {
          event.preventDefault();
          distributeNodes('horizontal');
          return;
        }
        if (key === 'v') {
          event.preventDefault();
          distributeNodes('vertical');
          return;
        }
      }

      if (!isMeta && !event.ctrlKey && event.key === 'Escape') {
        event.preventDefault();
        const store = useUiStore.getState();
        store.clearNodeSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [alignNodes, distributeNodes, duplicateSelectedNodes, nodes, resetView, zoomBy]);

  // connect to ws for live updates (development)
  useEffect(() => {
    const connection = connectWs(clientId, (msg: WsMessage) => {
      if (!msg?.type || msg.type === 'connection:ack') return;
      if (msg.meta?.clientId && msg.meta.clientId === clientId) return;
      // granular updates for nodes
      if (msg.type === 'node:created') {
        queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) => [...(old || []), msg.data]);
        return;
      }
      if (msg.type === 'node:updated') {
        queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) => (old || []).map(n => n.id === msg.data.id ? msg.data : n));
        return;
      }
      if (msg.type === 'node:deleted') {
        queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) => (old || []).filter(n => n.id !== msg.data.id));
        return;
      }

      // granular updates for edges
      if (msg.type === 'edge:created') {
        queryClient.setQueryData<Edge[]>(['edges', boardId], (old = []) => [...(old || []), msg.data]);
        return;
      }
      if (msg.type === 'edge:deleted') {
        queryClient.setQueryData<Edge[]>(['edges', boardId], (old = []) => (old || []).filter(e => e.id !== msg.data.id));
        return;
      }
    });
    return () => {
      connection?.close();
    };
  }, [boardId, clientId]);

  const editingNode = nodes.find(n => n.id === editingNodeId) || null;

  const isLoading = !flows || !nodes || !edges;
  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="app">
      <header className="header">
        <h1>FlowWeek</h1>
      </header>
      <Toolbar />
      <main className="canvas-container">
        <InfiniteCanvas 
            flows={flows}
            nodes={nodes}
            edges={edges}
            boardId={boardId}
            onNodeDoubleClick={setEditingNodeId}
        />
        <DetailPanel 
            node={editingNode}
            boardId={boardId}
            onClose={() => setEditingNodeId(null)}
        />
      </main>
    </div>
  );
}

// fetch functions need to be defined for the query
const fetchFlows = async (boardId: number) => {
  const res = await apiClient.get(`/boards/${boardId}/flows`);
  return res.data.data || [];
};
const fetchNodes = async (boardId: number) => {
  const res = await apiClient.get(`/boards/${boardId}/nodes`);
  type NodeResponse = Partial<Node> & {
    tags?: unknown;
    content?: unknown;
    status?: unknown;
    updated_at?: unknown;
  };
  const rows: NodeResponse[] = res.data.data || [];
  return rows.map<Node>(node => ({
    ...node,
    content: typeof node.content === 'string' ? node.content : '',
    tags: Array.isArray(node.tags) ? node.tags : [],
    journaled_at: typeof node.journaled_at === 'string' ? node.journaled_at : null,
    status:
      typeof node.status === 'string'
        ? (node.status as Node['status'])
        : node.type === 'task'
        ? 'todo'
        : null,
    updated_at:
      typeof node.updated_at === 'string'
        ? node.updated_at
        : new Date().toISOString(),
  }));
};
const fetchEdges = async (boardId: number) => {
  const res = await apiClient.get(`/boards/${boardId}/edges`);
  return res.data.data || [];
};

export default App;
