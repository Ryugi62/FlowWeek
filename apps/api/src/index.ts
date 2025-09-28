import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { RawData } from 'ws';
import { PrismaClient, NodeType, TaskStatus } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();

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

const ensureBoard = async (boardId: number) => {
  await prisma.board.upsert({
    where: { id: boardId },
    update: { updatedAt: new Date() },
    create: { id: boardId, name: `Board ${boardId}` },
  });
};

const serializeTags = (tags: unknown): string => {
  if (Array.isArray(tags)) {
    return JSON.stringify(tags.map(tag => String(tag)));
  }
  if (typeof tags === 'string') {
    try {
      JSON.parse(tags);
      return tags;
    } catch (error) {
      return JSON.stringify([tags]);
    }
  }
  return '[]';
};

const parseTags = (stored: string | null) => {
  if (!stored) return [] as string[];
  try {
    const tags = JSON.parse(stored);
    return Array.isArray(tags) ? tags.map((tag: unknown) => String(tag)) : [];
  } catch (error) {
    return [] as string[];
  }
};

const toFlowResponse = (flow: { id: number; boardId: number; name: string; color: string; yLane: number }) => ({
  id: flow.id,
  board_id: flow.boardId,
  name: flow.name,
  color: flow.color,
  y_lane: flow.yLane,
});

const toDomainStatus = (status: TaskStatus | null): string | null => {
  if (!status) return null;
  if (status === TaskStatus.in_progress) return 'in-progress';
  return status;
};

const fromDomainStatus = (status: unknown, type: NodeType): TaskStatus | null => {
  if (typeof status !== 'string') {
    return type === NodeType.task ? TaskStatus.todo : null;
  }
  if (status === 'in-progress') return TaskStatus.in_progress;
  if (Object.values(TaskStatus).includes(status as TaskStatus)) {
    return status as TaskStatus;
  }
  return type === NodeType.task ? TaskStatus.todo : null;
};

const toNodeResponse = (node: {
  id: number;
  boardId: number;
  flowId: number | null;
  type: NodeType;
  status: TaskStatus | null;
  tags: string;
  journaledAt: Date | null;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  content: string;
}) => ({
  id: node.id,
  board_id: node.boardId,
  flow_id: node.flowId,
  type: node.type,
  status: toDomainStatus(node.status),
  tags: parseTags(node.tags),
  journaled_at: node.journaledAt,
  x: node.x,
  y: node.y,
  width: node.width,
  height: node.height,
  title: node.title,
  content: node.content,
});

const toEdgeResponse = (edge: {
  id: number;
  boardId: number;
  sourceNodeId: number;
  targetNodeId: number;
}) => ({
  id: edge.id,
  board_id: edge.boardId,
  source_node_id: edge.sourceNodeId,
  target_node_id: edge.targetNodeId,
});

const normaliseNodeInput = (boardId: number, payload: any) => {
  const toNumber = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const type = (payload.type as NodeType) || NodeType.note;
  const status = fromDomainStatus(payload.status ?? null, type);

  const journaledAt = payload.journaled_at || payload.journaledAt;
  return {
    boardId,
    flowId: payload.flow_id ?? payload.flowId ?? null,
    type,
    status,
    tags: serializeTags(payload.tags),
    journaledAt: journaledAt ? new Date(journaledAt) : null,
    x: toNumber(payload.x, 0),
    y: toNumber(payload.y, 0),
    width: toNumber(payload.width, type === NodeType.task ? 220 : 160),
    height: toNumber(payload.height, type === NodeType.journal ? 140 : 120),
    title: typeof payload.title === 'string' ? payload.title : '',
    content: typeof payload.content === 'string' ? payload.content : '',
  };
};

// API routes
app.get('/api/boards/:boardId/flows', async (req, res) => {
  const boardId = parseInt(req.params.boardId, 10);
  if (Number.isNaN(boardId)) return res.status(400).json({ error: 'Invalid board id' });

  await ensureBoard(boardId);
  const flows = await prisma.flow.findMany({
    where: { boardId },
    orderBy: { id: 'asc' },
  });
  res.json({ data: flows.map(toFlowResponse) });
});

app.get('/api/boards/:boardId/nodes', async (req, res) => {
  const boardId = parseInt(req.params.boardId, 10);
  if (Number.isNaN(boardId)) return res.status(400).json({ error: 'Invalid board id' });

  await ensureBoard(boardId);
  const nodes = await prisma.node.findMany({
    where: { boardId },
    orderBy: { id: 'asc' },
  });
  res.json({ data: nodes.map(toNodeResponse) });
});

app.get('/api/boards/:boardId/edges', async (req, res) => {
  const boardId = parseInt(req.params.boardId, 10);
  if (Number.isNaN(boardId)) return res.status(400).json({ error: 'Invalid board id' });

  await ensureBoard(boardId);
  const edges = await prisma.edge.findMany({
    where: { boardId },
    orderBy: { id: 'asc' },
  });
  res.json({ data: edges.map(toEdgeResponse) });
});

app.post('/api/boards/:boardId/nodes', async (req, res) => {
  const boardId = parseInt(req.params.boardId, 10);
  if (Number.isNaN(boardId)) return res.status(400).json({ error: 'Invalid board id' });

  await ensureBoard(boardId);
  const data = normaliseNodeInput(boardId, req.body || {});
  const created = await prisma.node.create({ data });
  const response = toNodeResponse(created);
  res.status(201).json({ data: response });
  broadcast({ type: 'node:created', data: response });
});

if (process.env.NODE_ENV !== 'production') {
  app.post('/api/boards/:boardId/nodes/bulk', async (req, res) => {
    const boardId = parseInt(req.params.boardId, 10);
    if (Number.isNaN(boardId)) return res.status(400).json({ error: 'Invalid board id' });

    await ensureBoard(boardId);
    let flows = await prisma.flow.findMany({ where: { boardId } });
    if (flows.length === 0) {
      const fallback = await prisma.flow.create({
        data: { boardId, name: 'Auto flow', color: '#38bdf8', yLane: 0 },
      });
      flows = [fallback];
    }

    const { count = 100 } = req.body || {};
    const safeCount = Math.min(Math.max(Number(count) || 0, 1), 500);
    const baseX = Date.now() % 1000;
    const data = Array.from({ length: safeCount }).map((_, index) => ({
      boardId,
      flowId: flows[index % flows.length]?.id ?? null,
      type: NodeType.note,
      status: null,
      tags: '[]',
      journaledAt: null,
      x: baseX + index * 40,
      y: (index % 10) * 160,
      width: 200,
      height: 120,
      title: `Generated ${index + 1}`,
      content: 'Generated via bulk API for performance testing.',
    }));

    await prisma.node.createMany({ data });
    const latest = await prisma.node.findMany({
      where: { boardId },
      orderBy: { id: 'desc' },
      take: safeCount,
    });
    const mapped = latest.map(toNodeResponse);
    mapped.forEach(node => broadcast({ type: 'node:created', data: node }));
    res.status(201).json({ data: mapped });
  });
}

app.patch(['/api/nodes/:nodeId', '/api/boards/:boardId/nodes/:nodeId'], async (req, res) => {
  const nodeId = parseInt(req.params.nodeId as string, 10);
  if (Number.isNaN(nodeId)) return res.status(400).json({ error: 'Invalid node id' });

  const existing = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!existing) return res.status(404).json({ error: 'Node not found' });

  const partial = normaliseNodeInput(existing.boardId, { ...existing, ...req.body });
  const updated = await prisma.node.update({ where: { id: nodeId }, data: partial });
  const response = toNodeResponse(updated);
  res.json({ data: response });
  broadcast({ type: 'node:updated', data: response });
});

app.delete(['/api/nodes/:nodeId', '/api/boards/:boardId/nodes/:nodeId'], async (req, res) => {
  const nodeId = parseInt(req.params.nodeId as string, 10);
  if (Number.isNaN(nodeId)) return res.status(400).json({ error: 'Invalid node id' });

  const existing = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!existing) return res.status(404).json({ error: 'Node not found' });

  await prisma.edge.deleteMany({ where: { OR: [{ sourceNodeId: nodeId }, { targetNodeId: nodeId }] } });
  const removed = await prisma.node.delete({ where: { id: nodeId } });
  const response = toNodeResponse(removed);
  res.json({ data: response });
  broadcast({ type: 'node:deleted', data: response });
});

app.post('/api/boards/:boardId/edges', async (req, res) => {
  const boardId = parseInt(req.params.boardId, 10);
  if (Number.isNaN(boardId)) return res.status(400).json({ error: 'Invalid board id' });

  await ensureBoard(boardId);
  const { source_node_id: sourceNodeId, target_node_id: targetNodeId } = req.body || {};
  if (!sourceNodeId || !targetNodeId) return res.status(400).json({ error: 'Missing source or target node id' });

  const created = await prisma.edge.create({
    data: {
      boardId,
      sourceNodeId,
      targetNodeId,
    },
  });
  const response = toEdgeResponse(created);
  res.status(201).json({ data: response });
  broadcast({ type: 'edge:created', data: response });
});

app.delete(['/api/edges/:edgeId', '/api/boards/:boardId/edges/:edgeId'], async (req, res) => {
  const edgeId = parseInt((req.params.edgeId as string) || '0', 10);
  if (Number.isNaN(edgeId)) return res.status(400).json({ error: 'Invalid edge id' });

  const existing = await prisma.edge.findUnique({ where: { id: edgeId } });
  if (!existing) return res.status(404).json({ error: 'Edge not found' });

  const removed = await prisma.edge.delete({ where: { id: edgeId } });
  const response = toEdgeResponse(removed);
  res.json({ data: response });
  broadcast({ type: 'edge:deleted', data: response });
});

app.patch(['/api/edges/:edgeId', '/api/boards/:boardId/edges/:edgeId'], async (req, res) => {
  const edgeId = parseInt((req.params.edgeId as string) || '0', 10);
  if (Number.isNaN(edgeId)) return res.status(400).json({ error: 'Invalid edge id' });

  const existing = await prisma.edge.findUnique({ where: { id: edgeId } });
  if (!existing) return res.status(404).json({ error: 'Edge not found' });

  const { source_node_id: sourceNodeId = existing.sourceNodeId, target_node_id: targetNodeId = existing.targetNodeId } = req.body || {};
  const updated = await prisma.edge.update({
    where: { id: edgeId },
    data: { sourceNodeId, targetNodeId },
  });
  const response = toEdgeResponse(updated);
  res.json({ data: response });
  broadcast({ type: 'edge:updated', data: response });
});

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
