import './App.css';
import InfiniteCanvas from './components/InfiniteCanvas';
import DetailPanel from './components/DetailPanel';
import Toolbar from './components/Toolbar';
import { useQuery } from '@tanstack/react-query';
import apiClient, { connectWs, updateNode as updateNodeApi, setApiClientId } from './api';
import type { WsMessage } from './api';
import { queryClient } from './stores';
import { useState, useEffect, useCallback, useMemo } from 'react';
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            const s = useUiStore.getState();
            if (s.redo) s.redo();
          } else {
            const s = useUiStore.getState();
            if (s.undo) s.undo();
          }
        }
        if (e.key === 'y') {
          e.preventDefault();
          const s = useUiStore.getState();
          if (s.redo) s.redo();
        }
      }
      if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          alignNodes('left');
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          alignNodes('right');
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          alignNodes('top');
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          alignNodes('bottom');
        } else if (e.key.toLowerCase() === 'h') {
          e.preventDefault();
          distributeNodes('horizontal');
        } else if (e.key.toLowerCase() === 'v') {
          e.preventDefault();
          distributeNodes('vertical');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [alignNodes, distributeNodes]);

  const { data: flows = [] } = useQuery<Flow[]>({ queryKey: ['flows', boardId], queryFn: () => fetchFlows(boardId) });
  const { data: nodes = [] } = useQuery<Node[]>({ queryKey: ['nodes', boardId], queryFn: () => fetchNodes(boardId) });
  const { data: edges = [] } = useQuery<Edge[]>({ queryKey: ['edges', boardId], queryFn: () => fetchEdges(boardId) });

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
