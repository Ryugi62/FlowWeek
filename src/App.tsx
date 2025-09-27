import { useState, useEffect } from 'react';
import './App.css';
import InfiniteCanvas from './components/InfiniteCanvas';
import DetailPanel from './components/DetailPanel';
import apiClient from './api';

export interface Node { id: number; board_id: number; type: 'task' | 'note' | 'journal'; x: number; y: number; width: number; height: number; title: string; content?: string; }
export interface Edge { id: number; board_id: number; source_node_id: number; target_node_id: number; }

function App() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [editingNode, setEditingNode] = useState<Node | null>(null);

  // Fetch initial data
  useEffect(() => {
    const boardId = 1; // Placeholder
    Promise.all([
        apiClient.get(`/boards/${boardId}/nodes`),
        apiClient.get(`/boards/${boardId}/edges`)
    ]).then(([nodesRes, edgesRes]) => {
        setNodes(nodesRes.data.data || []);
        setEdges(edgesRes.data.data || []);
    }).catch(console.error);
  }, []);

  const handleCreateNode = async (newNodeData: Omit<Node, 'id' | 'board_id'>) => {
    try {
        const res = await apiClient.post('/boards/1/nodes', newNodeData);
        setNodes(prev => [...prev, res.data.data]);
    } catch (error) { console.error("Failed to create node:", error); }
  };

  const handleSaveNode = async (nodeId: number, updates: any) => {
    try {
        const res = await apiClient.patch(`/nodes/${nodeId}`, updates);
        setNodes(currentNodes => currentNodes.map(n => n.id === nodeId ? res.data.data : n));
        if (updates.title || updates.content) {
            setEditingNode(null);
        }
    } catch (error) { console.error("Failed to save node:", error); }
  };

  const handleCreateEdge = async (sourceNodeId: number, targetNodeId: number) => {
    try {
        const res = await apiClient.post('/edges', { board_id: 1, source_node_id: sourceNodeId, target_node_id: targetNodeId });
        setEdges(prev => [...prev, res.data.data]);
    } catch (error) { console.error("Failed to create edge:", error); }
  };

  const handleNodeDoubleClick = (nodeId: number) => {
    const nodeToEdit = nodes.find(n => n.id === nodeId);
    if (nodeToEdit) setEditingNode(nodeToEdit);
  };

  const handleClosePanel = () => setEditingNode(null);

  return (
    <div className="app">
      <header className="header">
        <h1>FlowWeek</h1>
      </header>
      <div className="toolbar">
        {/* Toolbar buttons will go here */}
      </div>
      <main className="canvas-container">
        <InfiniteCanvas 
            nodes={nodes}
            edges={edges}
            onNodeCreate={handleCreateNode}
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeDragStop={(nodeId, position) => handleSaveNode(nodeId, position)}
            onEdgeCreate={handleCreateEdge}
        />
        <DetailPanel 
            node={editingNode}
            onSave={handleSaveNode}
            onClose={handleClosePanel}
        />
      </main>
    </div>
  );
}

export default App;