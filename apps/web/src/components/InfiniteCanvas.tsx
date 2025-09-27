import React from 'react';
import type { Flow, Node, Edge } from '../App';

interface CanvasProps {
  flows: Flow[];
  nodes: Node[];
  edges: Edge[];
  boardId: number;
  onNodeDoubleClick: (id: number) => void;
}

const InfiniteCanvas: React.FC<CanvasProps> = () => {
  return (
    <div style={{ flex: 1, background: '#0f172a', height: '600px' }}>
      <p style={{ color: '#9ca3af', padding: 20 }}>Canvas placeholder</p>
    </div>
  );
};

export default InfiniteCanvas;