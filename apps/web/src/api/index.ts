
import axios from 'axios';
import type { Edge, Node } from '../types';

type WsMessage = {
  type: string;
  data?: unknown;
};

type WsListener = (message: WsMessage) => void;

const DEFAULT_WS_URL = 'ws://localhost:3001';
const loggedWarnings = new Set<string>();

const devLogOnce = (key: string, log: () => void) => {
  if (!import.meta.env.DEV || loggedWarnings.has(key)) return;
  loggedWarnings.add(key);
  log();
};

const isWsMessage = (payload: unknown): payload is WsMessage =>
  typeof payload === 'object' && payload !== null && 'type' in payload;

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export default apiClient;

// Convenience CRUD helpers for frontend canvas operations
type NodeWritePayload = Partial<Omit<Node, 'id' | 'board_id'>>;
type EdgeWritePayload = Partial<Omit<Edge, 'id' | 'board_id'>>;

export const createNode = async (boardId: number, payload: NodeWritePayload) => {
  const res = await apiClient.post(`/boards/${boardId}/nodes`, payload);
  return res.data;
};

export const updateNode = async (
  boardId: number,
  nodeId: number,
  payload: NodeWritePayload,
) => {
  const res = await apiClient.patch(`/boards/${boardId}/nodes/${nodeId}`, payload);
  return res.data;
};

export const deleteNode = async (boardId: number, nodeId: number) => {
  const res = await apiClient.delete(`/boards/${boardId}/nodes/${nodeId}`);
  return res.data;
};

export const createEdge = async (boardId: number, payload: EdgeWritePayload) => {
  const res = await apiClient.post(`/boards/${boardId}/edges`, payload);
  return res.data;
};

export const deleteEdge = async (boardId: number, edgeId: number) => {
  const res = await apiClient.delete(`/boards/${boardId}/edges/${edgeId}`);
  return res.data;
};

export const updateEdge = async (
  boardId: number,
  edgeId: number,
  payload: EdgeWritePayload,
) => {
  const res = await apiClient.patch(`/boards/${boardId}/edges/${edgeId}`, payload);
  return res.data;
};

// Simple WebSocket listener for development collaboration
export function connectWs(onMessage: WsListener) {
  const url = import.meta.env.VITE_WS_URL?.trim() || DEFAULT_WS_URL;

  try {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => {
      devLogOnce('ws-open', () => console.info(`[flowweek] websocket connected (${url})`));
    });
    ws.addEventListener('message', event => {
      if (typeof event.data !== 'string') return;
      try {
        const parsed = JSON.parse(event.data);
        if (isWsMessage(parsed)) {
          onMessage(parsed);
        }
      } catch (error) {
        devLogOnce('ws-parse-error', () => console.warn('[flowweek] websocket message parsing failed', error));
      }
    });

    ws.addEventListener('error', () => {
      devLogOnce('ws-error', () => console.warn(`[flowweek] websocket connection failed for ${url}`));
    });

    ws.addEventListener('close', event => {
      if (event.wasClean) return;
      devLogOnce('ws-close', () => console.warn(`[flowweek] websocket closed unexpectedly (code ${event.code})`));
    });

    return ws;
  } catch (error) {
    devLogOnce('ws-init-error', () => console.warn('[flowweek] unable to initialise websocket', error));
    return null;
  }
}

export type { WsMessage };
