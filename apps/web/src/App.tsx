import './App.css';
import InfiniteCanvas from './components/InfiniteCanvas';
import DetailPanel from './components/DetailPanel';
import Toolbar from './components/Toolbar';
import { useQuery } from '@tanstack/react-query';
import apiClient, { connectWs } from './api';
import { queryClient } from './stores';
import { useState, useEffect } from 'react'; // Import useEffect
import { useUiStore } from './stores'; // Import useUiStore

// Data Models
export interface Flow { id: number; board_id: number; name: string; color: string; y_lane: number; }
export interface Node { id: number; board_id: number; flow_id: number; type: 'task' | 'note' | 'journal'; x: number; y: number; width: number; height: number; title: string; content?: string; }
export interface Edge { id: number; board_id: number; source_node_id: number; target_node_id: number; }

// API fetch functions
// ... (fetch functions remain the same)

function App() {
  const boardId = 1; // Placeholder
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);

  // Undo/Redo keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            const s = useUiStore.getState();
            s.redo && s.redo();
          } else {
            const s = useUiStore.getState();
            s.undo && s.undo();
          }
        }
        if (e.key === 'y') {
          e.preventDefault();
          const s = useUiStore.getState();
          s.redo && s.redo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const { data: flows = [] } = useQuery<Flow[]>({ queryKey: ['flows', boardId], queryFn: () => fetchFlows(boardId) });
  const { data: nodes = [] } = useQuery<Node[]>({ queryKey: ['nodes', boardId], queryFn: () => fetchNodes(boardId) });
  const { data: edges = [] } = useQuery<Edge[]>({ queryKey: ['edges', boardId], queryFn: () => fetchEdges(boardId) });

  // connect to ws for live updates (development)
  useEffect(() => {
    const ws = connectWs((msg: any) => {
      if (!msg || !msg.type) return;
      if (msg.type.startsWith('node:')) {
        queryClient.invalidateQueries({ queryKey: ['nodes', boardId] });
      }
      if (msg.type.startsWith('edge:')) {
        queryClient.invalidateQueries({ queryKey: ['edges', boardId] });
      }
    });
    return () => { ws && ws.close(); };
  }, [boardId]);

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
  return res.data.data || [];
};
const fetchEdges = async (boardId: number) => {
  const res = await apiClient.get(`/boards/${boardId}/edges`);
  return res.data.data || [];
};

export default App;