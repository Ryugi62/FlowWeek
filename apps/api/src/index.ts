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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});