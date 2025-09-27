
import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export default apiClient;

// Convenience CRUD helpers for frontend canvas operations
export const createNode = async (boardId: number, payload: any) => {
  const res = await apiClient.post(`/boards/${boardId}/nodes`, payload);
  return res.data;
};

export const updateNode = async (boardId: number, nodeId: number, payload: any) => {
  const res = await apiClient.patch(`/boards/${boardId}/nodes/${nodeId}`, payload);
  return res.data;
};

export const deleteNode = async (boardId: number, nodeId: number) => {
  const res = await apiClient.delete(`/boards/${boardId}/nodes/${nodeId}`);
  return res.data;
};

export const createEdge = async (boardId: number, payload: any) => {
  const res = await apiClient.post(`/boards/${boardId}/edges`, payload);
  return res.data;
};

export const deleteEdge = async (boardId: number, edgeId: number) => {
  const res = await apiClient.delete(`/boards/${boardId}/edges/${edgeId}`);
  return res.data;
};

export const updateEdge = async (boardId: number, edgeId: number, payload: any) => {
  const res = await apiClient.patch(`/boards/${boardId}/edges/${edgeId}`, payload);
  return res.data;
};

// Simple WebSocket listener for development collaboration
export function connectWs(onMessage: (msg: any) => void) {
  try {
    const url = (import.meta.env.VITE_WS_URL || 'ws://localhost:3001');
    const ws = new WebSocket(url);
    ws.addEventListener('message', (ev) => {
      try { onMessage(JSON.parse(ev.data)); } catch (e) { /* ignore */ }
    });
    return ws;
  } catch (e) {
    return null;
  }
}
