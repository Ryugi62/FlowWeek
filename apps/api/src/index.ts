import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Mock data
const mockFlows = [
  { id: 1, board_id: 1, name: 'Flow 1', color: '#ff0000', y_lane: 0 },
  { id: 2, board_id: 1, name: 'Flow 2', color: '#00ff00', y_lane: 100 },
];

const mockNodes = [
  { id: 1, board_id: 1, flow_id: 1, type: 'task', x: 100, y: 50, width: 200, height: 100, title: 'Task 1', content: 'Do something' },
  { id: 2, board_id: 1, flow_id: 2, type: 'note', x: 300, y: 150, width: 150, height: 80, title: 'Note 1', content: 'Remember this' },
];

const mockEdges = [
  { id: 1, board_id: 1, source_node_id: 1, target_node_id: 2 },
];

// API routes
app.get('/api/boards/:boardId/flows', (req, res) => {
  const boardId = parseInt(req.params.boardId);
  const flows = mockFlows.filter(f => f.board_id === boardId);
  res.json({ data: flows });
});

app.get('/api/boards/:boardId/nodes', (req, res) => {
  const boardId = parseInt(req.params.boardId);
  const nodes = mockNodes.filter(n => n.board_id === boardId);
  res.json({ data: nodes });
});

app.get('/api/boards/:boardId/edges', (req, res) => {
  const boardId = parseInt(req.params.boardId);
  const edges = mockEdges.filter(e => e.board_id === boardId);
  res.json({ data: edges });
});

// Create node
app.post('/api/boards/:boardId/nodes', (req, res) => {
  const boardId = parseInt(req.params.boardId);
  const payload = req.body || {};
  const nextId = mockNodes.reduce((m, n) => Math.max(m, n.id), 0) + 1;
  const newNode = { id: nextId, board_id: boardId, flow_id: payload.flow_id || null, type: payload.type || 'note', x: payload.x || 0, y: payload.y || 0, width: payload.width || 160, height: payload.height || 64, title: payload.title || '', content: payload.content || '' };
  mockNodes.push(newNode as any);
  res.status(201).json({ data: newNode });
});

// Update node (support both /api/nodes/:id and /api/boards/:boardId/nodes/:id)
app.patch(['/api/nodes/:nodeId', '/api/boards/:boardId/nodes/:nodeId'], (req, res) => {
  const nodeId = parseInt(req.params.nodeId as string);
  const payload = req.body || {};
  const idx = mockNodes.findIndex(n => n.id === nodeId);
  if (idx === -1) return res.status(404).json({ error: 'Node not found' });
  const updated = { ...mockNodes[idx], ...payload };
  mockNodes[idx] = updated as any;
  res.json({ data: updated });
});

// Delete node (support routes)
app.delete(['/api/nodes/:nodeId', '/api/boards/:boardId/nodes/:nodeId'], (req, res) => {
  const nodeId = parseInt(req.params.nodeId as string);
  const idx = mockNodes.findIndex(n => n.id === nodeId);
  if (idx === -1) return res.status(404).json({ error: 'Node not found' });
  const removed = mockNodes.splice(idx, 1)[0];
  res.json({ data: removed });
});

// Create edge
app.post('/api/boards/:boardId/edges', (req, res) => {
  const boardId = parseInt(req.params.boardId);
  const payload = req.body || {};
  const nextId = mockEdges.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  const newEdge = { id: nextId, board_id: boardId, source_node_id: payload.source_node_id, target_node_id: payload.target_node_id };
  mockEdges.push(newEdge as any);
  res.status(201).json({ data: newEdge });
});

// Delete edge
app.delete(['/api/edges/:edgeId', '/api/boards/:boardId/edges/:edgeId'], (req, res) => {
  const edgeId = parseInt((req.params.edgeId as string) || '0');
  const idx = mockEdges.findIndex(e => e.id === edgeId);
  if (idx === -1) return res.status(404).json({ error: 'Edge not found' });
  const removed = mockEdges.splice(idx, 1)[0];
  res.json({ data: removed });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});