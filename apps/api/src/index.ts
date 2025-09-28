import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { RawData } from 'ws';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

type BroadcastPayload = {
  type: string;
  data: unknown;
};

type BroadcastFn = (payload: BroadcastPayload) => void;

const noopBroadcast: BroadcastFn = () => {};
let broadcast: BroadcastFn = noopBroadcast;

app.use(cors());
app.use(express.json());

// Mock data
const mockFlows = [
  { id: 1, board_id: 1, name: 'Flow 1', color: '#ff0000', y_lane: 0 },
  { id: 2, board_id: 1, name: 'Flow 2', color: '#00ff00', y_lane: 100 },
];

const mockNodes = [
  {
    id: 1,
    board_id: 1,
    flow_id: 1,
    type: 'task',
    status: 'todo',
    tags: ['setup'],
    journaled_at: null,
    x: 100,
    y: 50,
    width: 220,
    height: 120,
    title: 'Wireframe onboarding',
    content: 'Sketch welcome flow variations and pick v1 focus.',
  },
  {
    id: 2,
    board_id: 1,
    flow_id: 2,
    type: 'note',
    status: null,
    tags: ['ideas'],
    journaled_at: null,
    x: 360,
    y: 140,
    width: 200,
    height: 120,
    title: 'Research notes',
    content: 'Collect async collaboration references: Linear, Figma, Excalidraw.',
  },
  {
    id: 3,
    board_id: 1,
    flow_id: 1,
    type: 'journal',
    status: null,
    tags: ['retro'],
    journaled_at: new Date().toISOString(),
    x: 640,
    y: 260,
    width: 220,
    height: 140,
    title: 'Sprint retrospective',
    content: 'Captured wins, blockers, follow-up tasks. Sync with Ryugi.',
  },
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
  const type = payload.type || 'note';
  const defaultStatus = type === 'task' ? 'todo' : null;
  const newNode = {
    id: nextId,
    board_id: boardId,
    flow_id: payload.flow_id || null,
    type,
    status: payload.status ?? defaultStatus,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    journaled_at:
      payload.journaled_at ?? (type === 'journal' ? new Date().toISOString() : null),
    x: payload.x || 0,
    y: payload.y || 0,
    width: payload.width || (type === 'task' ? 220 : 160),
    height: payload.height || (type === 'journal' ? 140 : 120),
    title: payload.title || '',
    content: payload.content || '',
  };
  mockNodes.push(newNode as any);
  res.status(201).json({ data: newNode });
  broadcast({ type: 'node:created', data: newNode });
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
  broadcast({ type: 'node:updated', data: updated });
});

// Delete node (support routes)
app.delete(['/api/nodes/:nodeId', '/api/boards/:boardId/nodes/:nodeId'], (req, res) => {
  const nodeId = parseInt(req.params.nodeId as string);
  const idx = mockNodes.findIndex(n => n.id === nodeId);
  if (idx === -1) return res.status(404).json({ error: 'Node not found' });
  const removed = mockNodes.splice(idx, 1)[0];
  res.json({ data: removed });
  broadcast({ type: 'node:deleted', data: removed });
});

// Create edge
app.post('/api/boards/:boardId/edges', (req, res) => {
  const boardId = parseInt(req.params.boardId);
  const payload = req.body || {};
  const nextId = mockEdges.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  const newEdge = { id: nextId, board_id: boardId, source_node_id: payload.source_node_id, target_node_id: payload.target_node_id };
  mockEdges.push(newEdge as any);
  res.status(201).json({ data: newEdge });
  broadcast({ type: 'edge:created', data: newEdge });
});

// Delete edge
app.delete(['/api/edges/:edgeId', '/api/boards/:boardId/edges/:edgeId'], (req, res) => {
  const edgeId = parseInt((req.params.edgeId as string) || '0');
  const idx = mockEdges.findIndex(e => e.id === edgeId);
  if (idx === -1) return res.status(404).json({ error: 'Edge not found' });
  const removed = mockEdges.splice(idx, 1)[0];
  res.json({ data: removed });
  broadcast({ type: 'edge:deleted', data: removed });
});

// Update edge (reconnect)
app.patch(['/api/edges/:edgeId', '/api/boards/:boardId/edges/:edgeId'], (req, res) => {
  const edgeId = parseInt((req.params.edgeId as string) || '0');
  const payload = req.body || {};
  const idx = mockEdges.findIndex(e => e.id === edgeId);
  if (idx === -1) return res.status(404).json({ error: 'Edge not found' });
  const updated = { ...mockEdges[idx], ...payload };
  mockEdges[idx] = updated as any;
  res.json({ data: updated });
  broadcast({ type: 'edge:updated', data: updated });
});

// Create http server so we can attach ws
const server = http.createServer(app);

const wss = new WebSocketServer({ server });
wss.on('connection', (socket: WebSocket) => {
  console.log('ws client connected');

  socket.on('message', (message: RawData) => {
    wss.clients.forEach(client => {
      if (client !== socket && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  socket.send(JSON.stringify({ type: 'connection:ack' }));
});

broadcast = (payload: BroadcastPayload) => {
  const serialized = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(serialized);
    }
  });
};

setInterval(() => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.ping();
    }
  });
}, 30000).unref();

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
