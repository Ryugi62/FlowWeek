
import axios from 'axios';
import type { Edge, Node } from '../types';
import { getOrCreateClientId } from '../utils/clientId';

type WsEnvelopeMeta = {
  clientId?: string;
  timestamp?: string;
};

type WsMessage = {
  type: string;
  data?: unknown;
  meta?: WsEnvelopeMeta;
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

export type WsConnection = {
  close: () => void;
};

let cachedClientId: string | null = null;

export const setApiClientId = (id: string) => {
  cachedClientId = id;
  apiClient.defaults.headers.common['x-client-id'] = id;
};

const resolveClientId = () => {
  if (cachedClientId) return cachedClientId;
  const generated = getOrCreateClientId();
  setApiClientId(generated);
  return generated;
};

const withClientHeaders = (headers: Record<string, string> = {}) => ({
  ...headers,
  'x-client-id': resolveClientId(),
});

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export default apiClient;

// Convenience CRUD helpers for frontend canvas operations
type NodeWritePayload = Partial<Omit<Node, 'id' | 'board_id' | 'updated_at'>>;
type EdgeWritePayload = Partial<Omit<Edge, 'id' | 'board_id'>>;

interface UpdateOptions {
  version?: string | null;
}

export const createNode = async (boardId: number, payload: NodeWritePayload) => {
  const res = await apiClient.post(`/boards/${boardId}/nodes`, payload, {
    headers: withClientHeaders(),
  });
  return res.data;
};

export const updateNode = async (
  boardId: number,
  nodeId: number,
  payload: NodeWritePayload,
  options: UpdateOptions = {},
) => {
  const headers = withClientHeaders();
  if (options.version) headers['x-node-version'] = options.version;
  try {
    const res = await apiClient.patch(`/boards/${boardId}/nodes/${nodeId}`, payload, {
      headers,
    });
    return res.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 409) {
      const latest = (error.response.data?.data ?? null) as Node | null;
      if (latest) {
        throw new ConflictError(latest);
      }
    }
    throw error;
  }
};

export const deleteNode = async (boardId: number, nodeId: number) => {
  const res = await apiClient.delete(`/boards/${boardId}/nodes/${nodeId}`, {
    headers: withClientHeaders(),
  });
  return res.data;
};

export const createEdge = async (boardId: number, payload: EdgeWritePayload) => {
  const res = await apiClient.post(`/boards/${boardId}/edges`, payload, {
    headers: withClientHeaders(),
  });
  return res.data;
};

export const deleteEdge = async (boardId: number, edgeId: number) => {
  const res = await apiClient.delete(`/boards/${boardId}/edges/${edgeId}`, {
    headers: withClientHeaders(),
  });
  return res.data;
};

export const updateEdge = async (
  boardId: number,
  edgeId: number,
  payload: EdgeWritePayload,
) => {
  const res = await apiClient.patch(`/boards/${boardId}/edges/${edgeId}`, payload, {
    headers: withClientHeaders(),
  });
  return res.data;
};

// Simple WebSocket listener for development collaboration
export function connectWs(clientId: string, onMessage: WsListener): WsConnection | null {
  const url = import.meta.env.VITE_WS_URL?.trim() || DEFAULT_WS_URL;
  setApiClientId(clientId);

  try {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let closed = false;
    let attempt = 0;

    const cleanupTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (closed) return;
      const delay = Math.min(5000, 500 * 2 ** attempt);
      cleanupTimer();
      reconnectTimer = window.setTimeout(() => {
        attempt += 1;
        connect();
      }, delay);
    };

    const connect = () => {
      if (closed || navigator.onLine === false) {
        scheduleReconnect();
        return;
      }
      socket = new WebSocket(url);
      socket.addEventListener('open', () => {
        devLogOnce('ws-open', () => console.info(`[flowweek] websocket connected (${url})`));
        attempt = 0;
        cleanupTimer();
        try {
          socket?.send(
            JSON.stringify({ type: 'client:hello', clientId, timestamp: new Date().toISOString() }),
          );
        } catch {
          // ignore
        }
      });
      socket.addEventListener('message', event => {
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

      socket.addEventListener('error', () => {
        devLogOnce('ws-error', () => console.warn(`[flowweek] websocket connection failed for ${url}`));
      });

      socket.addEventListener('close', event => {
        if (closed) return;
        if (!event.wasClean) {
          devLogOnce('ws-close', () => console.warn(`[flowweek] websocket closed unexpectedly (code ${event.code})`));
        }
        scheduleReconnect();
      });
    };

    connect();

    const handleOnline = () => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        attempt = 0;
        connect();
      }
    };

    const handleOffline = () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close(1001, 'offline');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return {
      close: () => {
        closed = true;
        cleanupTimer();
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.close(1000, 'client shutdown');
        }
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      },
    };
  } catch (error) {
    devLogOnce('ws-init-error', () => console.warn('[flowweek] unable to initialise websocket', error));
    return null;
  }
}

export type { WsMessage, NodeWritePayload, EdgeWritePayload };

export class ConflictError extends Error {
  latest: Node;

  constructor(latest: Node) {
    super('conflict');
    this.name = 'ConflictError';
    this.latest = latest;
  }
}
