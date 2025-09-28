import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Flow, Node, Edge, TaskStatus } from '../types';
import { useUiStore } from '../stores';
import { useQueryClient } from '@tanstack/react-query';
import { updateNode, createNode, createEdge, deleteNode, deleteEdge, type EdgeWritePayload } from '../api';
import { commandStack } from '../stores/commands';
import { filterNodes } from '../utils/filterNodes';

interface CanvasProps {
  flows: Flow[];
  nodes: Node[];
  edges: Edge[];
  boardId: number;
  onNodeDoubleClick: (id: number) => void;
}

// Simple hit test: nodes are rectangles
const isPointInNode = (x: number, y: number, node: Node) => {
  return x >= node.x && x <= node.x + node.width && y >= node.y && y <= node.y + node.height;
};

const TASK_CHECKBOX_SIZE = 18;
const TASK_CHECKBOX_MARGIN = 12;
const NODE_PADDING_X = 16;
const NODE_PADDING_Y = 16;
const LINE_HEIGHT = 18;
const TAG_GAP = 8;
const MIN_GROUP_DIMENSION = 80;
const statusFill: Record<TaskStatus, string> = {
  todo: '#1f2937',
  'in-progress': '#1e293b',
  done: '#14532d',
};
const statusAccent: Record<TaskStatus, string> = {
  todo: '#94a3b8',
  'in-progress': '#38bdf8',
  done: '#4ade80',
};

const formatJournalTimestamp = (iso: string | null) => {
  if (!iso) return '기록 시간 미지정';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '기록 시간 미지정';
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const buildContentLines = (content: string | undefined, maxWidthChars = 42, maxLines = 3) => {
  if (!content) return [];
  const raw = content.replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const words = raw.split(' ');
  const lines: string[] = [];
  let current = '';
  words.forEach(word => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxWidthChars) {
      if (current) lines.push(current);
      if (word.length > maxWidthChars) {
        lines.push(word.slice(0, maxWidthChars) + '…');
        current = '';
      } else {
        current = word;
      }
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
};

const cycleTaskStatus = (status: TaskStatus | null): TaskStatus => {
  if (status === 'todo') return 'in-progress';
  if (status === 'in-progress') return 'done';
  return 'todo';
};

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface SelectionBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  handles: Array<{ key: ResizeHandle; x: number; y: number }>;
}

interface GroupResizeState {
  handle: ResizeHandle;
  startPointer: { x: number; y: number };
  startBounds: SelectionBounds;
  startSnapshot: Map<number, { x: number; y: number; width: number; height: number }>;
  lastApplied: Map<number, { x: number; y: number; width: number; height: number }> | null;
}

const InfiniteCanvas: React.FC<CanvasProps> = ({ flows, nodes, edges, boardId, onNodeDoubleClick }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const draggingRef = useRef<{ nodeId: number | null; offsetX: number; offsetY: number } | null>(null);
  const groupDragRef = useRef<Map<number, { x: number; y: number }> | null>(null);
  const linkingRef = useRef<{ fromId: number | null; toX: number; toY: number } | null>(null);
  const edgeDragRef = useRef<{ edgeId: number; which: 'source' | 'target'; toX: number; toY: number; originalNodeId: number } | null>(null);
  const panRef = useRef<{ isPanning: boolean; startX: number; startY: number } | null>(null);
  const moveSnapshotRef = useRef<Map<number, { x: number; y: number }> | null>(null);
  const marqueeRef = useRef<{ start: { x: number; y: number }; current: { x: number; y: number }; additive: boolean } | null>(null);
  const selectionBoundsRef = useRef<SelectionBounds | null>(null);
  const groupResizeRef = useRef<GroupResizeState | null>(null);
  const visibleNodeIdsRef = useRef<Set<number>>(new Set());
  const [size, setSize] = useState({ w: 800, h: 600 });
  const ui = useUiStore();
  const queryClient = useQueryClient();
  const [selectedEdgeId, setSelectedEdgeId] = useState<number | null>(null);
  const [hoverNodeId, setHoverNodeId] = useState<number | null>(null);
  const [hoverHandle, setHoverHandle] = useState<ResizeHandle | null>(null);

  // We'll perform manual optimistic updates using queryClient and direct api calls

  // Resize canvas to container
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const resize = () => {
      const parent = el.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const DPR = window.devicePixelRatio || 1;
      el.width = Math.max(300, Math.floor(rect.width * DPR));
      el.height = Math.max(200, Math.floor(rect.height * DPR));
      el.style.width = rect.width + 'px';
      el.style.height = rect.height + 'px';
      setSize({ w: el.width, h: el.height });
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el.parentElement || document.body);
    return () => ro.disconnect();
  }, []);

  // Render loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const DPR = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // apply view transform
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(ui.view.zoom * DPR, ui.view.zoom * DPR);
    ctx.translate(-ui.view.x, -ui.view.y);

    // background grid
    const gridSize = 64;
    ctx.fillStyle = '#071029';
    ctx.fillRect(ui.view.x - canvas.width, ui.view.y - canvas.height, canvas.width * 4, canvas.height * 4);
    ctx.strokeStyle = '#0b1220';
    ctx.lineWidth = 1 / (ui.view.zoom * DPR);
    for (let gx = Math.floor((ui.view.x - canvas.width) / gridSize) * gridSize; gx < ui.view.x + canvas.width * 2; gx += gridSize) {
      ctx.beginPath();
      ctx.moveTo(gx, ui.view.y - canvas.height * 2);
      ctx.lineTo(gx, ui.view.y + canvas.height * 2);
      ctx.stroke();
    }
    for (let gy = Math.floor((ui.view.y - canvas.height) / gridSize) * gridSize; gy < ui.view.y + canvas.height * 2; gy += gridSize) {
      ctx.beginPath();
      ctx.moveTo(ui.view.x - canvas.width * 2, gy);
      ctx.lineTo(ui.view.x + canvas.width * 2, gy);
      ctx.stroke();
    }

      // render edges (bezier routing)
      const visibleIds = visibleNodeIdsRef.current;
      edges.forEach(e => {
        if (!visibleIds.has(e.source_node_id) || !visibleIds.has(e.target_node_id)) return;
        const isSelectedEdge = selectedEdgeId === e.id;
        if (isSelectedEdge) {
          ctx.strokeStyle = '#f9731677';
          ctx.lineWidth = 3 / (ui.view.zoom * DPR);
        } else {
          ctx.strokeStyle = '#9ca3af88';
          ctx.lineWidth = 2 / (ui.view.zoom * DPR);
        }
      const s = nodes.find(n => n.id === e.source_node_id);
      const t = nodes.find(n => n.id === e.target_node_id);
      if (!s || !t) return;
      // compute control points for a simple cubic bezier
      // endpoints (may be overridden by an active edge-drag preview)
      let x1 = s.x + s.width / 2;
      let y1 = s.y + s.height / 2;
      let x2 = t.x + t.width / 2;
      let y2 = t.y + t.height / 2;
      // if this edge is being dragged, replace the dragged endpoint with preview coord
      const ed = edgeDragRef.current;
      if (ed && ed.edgeId === e.id) {
        if (ed.which === 'source') {
          x1 = ed.toX;
          y1 = ed.toY;
        } else {
          x2 = ed.toX;
          y2 = ed.toY;
        }
      }
      const dx = Math.abs(x2 - x1);
      const dir = x2 > x1 ? 1 : -1;
      // simple control-point offsets to reduce overlap with node boxes
      const cpOffset = Math.min(120, dx * 0.35);
      const cp1x = x1 + dir * cpOffset * 0.4;
      const cp2x = x2 - dir * cpOffset * 0.4;
      // vertical nudge away from node centers to avoid crossing boxes
      const cp1y = y1 + (y2 - y1) * 0.12 + Math.sign(y2 - y1) * Math.min(40, Math.abs(y2 - y1) * 0.12);
      const cp2y = y2 - (y2 - y1) * 0.12 - Math.sign(y2 - y1) * Math.min(40, Math.abs(y2 - y1) * 0.12);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
      ctx.stroke();
      // draw small endpoint handles for easier reconnecting
      ctx.fillStyle = '#60a5fa';
      ctx.beginPath();
      ctx.arc(x1, y1, 6 / (ui.view.zoom * DPR), 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y2, 6 / (ui.view.zoom * DPR), 0, Math.PI * 2);
      ctx.fill();
    });

    // preview link while linking
    if (linkingRef.current && linkingRef.current.fromId != null) {
      const from = nodes.find(n => n.id === linkingRef.current!.fromId);
      if (from) {
        const x1 = from.x + from.width / 2;
        const y1 = from.y + from.height / 2;
        const x2 = linkingRef.current.toX;
        const y2 = linkingRef.current.toY;
        const dx = Math.abs(x2 - x1);
        const dir = x2 > x1 ? 1 : -1;
        const cpOffset = Math.min(120, dx * 0.35);
        const cp1x = x1 + dir * cpOffset * 0.4;
        const cp2x = x2 - dir * cpOffset * 0.4;
        const cp1y = y1 + (y2 - y1) * 0.12 + Math.sign(y2 - y1) * Math.min(40, Math.abs(y2 - y1) * 0.12);
        const cp2y = y2 - (y2 - y1) * 0.12 - Math.sign(y2 - y1) * Math.min(40, Math.abs(y2 - y1) * 0.12);
        ctx.strokeStyle = '#60a5fa88';
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // draw node handle (small circle on right side)

    const filtered = filterNodes(nodes, ui.searchTerm || '', ui.statusFilter || 'all', ui.tagFilters || []);
    visibleNodeIdsRef.current = new Set(filtered.map(n => n.id));

    filtered.forEach(node => {
      const selected = ui.selectedNodeIds.has(node.id);
      ctx.save();
      ctx.translate(node.x, node.y);
      ctx.textBaseline = 'top';
      const scale = 1 / ui.view.zoom;
      const paddingX = NODE_PADDING_X * scale;
      const paddingY = NODE_PADDING_Y * scale;
      const lineHeight = LINE_HEIGHT * scale;
      const checkboxSize = TASK_CHECKBOX_SIZE * scale;
      const checkboxMargin = TASK_CHECKBOX_MARGIN * scale;
      const lineWidth = 2 / (ui.view.zoom * DPR);
      const baseFill = node.type === 'task'
        ? statusFill[(node.status ?? 'todo') as TaskStatus]
        : selected
          ? '#0ea5e988'
          : node.type === 'journal'
            ? '#1e1b4b'
            : '#1f2937';
      ctx.fillStyle = baseFill;
      ctx.strokeStyle = selected ? '#06b6d4' : '#334155';
      ctx.lineWidth = lineWidth;
      ctx.fillRect(0, 0, node.width, node.height);
      ctx.strokeRect(0, 0, node.width, node.height);

      ctx.fillStyle = '#e5e7eb';
      ctx.font = `${14 * scale}px "Inter", sans-serif`;
      let textY = paddingY;
      let textX = paddingX;

      if (node.type === 'task') {
        ctx.strokeStyle = statusAccent[(node.status ?? 'todo') as TaskStatus];
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(checkboxMargin, checkboxMargin, checkboxSize, checkboxSize);
        if ((node.status ?? 'todo') === 'done') {
          ctx.beginPath();
          const startX = checkboxMargin + checkboxSize * 0.2;
          const startY = checkboxMargin + checkboxSize * 0.55;
          ctx.moveTo(startX, startY);
          ctx.lineTo(checkboxMargin + checkboxSize * 0.45, checkboxMargin + checkboxSize * 0.8);
          ctx.lineTo(checkboxMargin + checkboxSize * 0.8, checkboxMargin + checkboxSize * 0.25);
          ctx.strokeStyle = '#4ade80';
          ctx.lineWidth = 3 / (ui.view.zoom * DPR);
          ctx.stroke();
        } else if ((node.status ?? 'todo') === 'in-progress') {
          ctx.fillStyle = statusAccent['in-progress'];
          ctx.fillRect(
            checkboxMargin + checkboxSize * 0.15,
            checkboxMargin + checkboxSize * 0.15,
            checkboxSize * 0.7,
            checkboxSize * 0.7,
          );
        }
        textX = checkboxMargin + checkboxSize + paddingX / 2;
      }

      ctx.fillStyle = '#f9fafb';
      ctx.fillText(node.title || 'Untitled', textX, textY);
      textY += lineHeight;

      if (node.type === 'journal') {
        ctx.fillStyle = '#a855f7';
        ctx.font = `${12 * scale}px "Inter", sans-serif`;
        ctx.fillText(formatJournalTimestamp(node.journaled_at), paddingX, textY);
        textY += lineHeight;
        ctx.font = `${13 * scale}px "Inter", sans-serif`;
        ctx.fillStyle = '#e0f2fe';
      } else {
        ctx.font = `${13 * scale}px "Inter", sans-serif`;
        ctx.fillStyle = '#cbd5f5';
      }

      const lines = buildContentLines(node.content, node.type === 'note' ? 48 : 36, node.type === 'journal' ? 4 : 3);
      lines.forEach(line => {
        ctx.fillText(line, paddingX, textY);
        textY += lineHeight;
      });

      if (node.tags?.length) {
        let tagX = paddingX;
        const chipHeight = 18 * scale;
        const chipPadding = 6 * scale;
        const tagY = node.height - paddingY - chipHeight;
        ctx.font = `${11 * scale}px "Inter", sans-serif`;
        node.tags.forEach(tag => {
          const labelWidth = ctx.measureText(tag).width + chipPadding * 2;
          if (tagX + labelWidth > node.width - paddingX) return;
          ctx.fillStyle = '#0ea5e9';
          ctx.globalAlpha = 0.16;
          ctx.fillRect(tagX, tagY, labelWidth, chipHeight);
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#bae6fd';
          ctx.fillText(tag, tagX + chipPadding, tagY + chipHeight / 4);
          tagX += labelWidth + TAG_GAP * scale;
        });
      }

      ctx.restore();
    });

    // draw handles after nodes
    filtered.forEach(node => {
      const hx = node.x + node.width + 8;
      const hy = node.y + node.height / 2;
      ctx.beginPath();
      ctx.fillStyle = hoverNodeId === node.id ? '#60a5fa' : '#9ca3af';
      ctx.arc(hx, hy, 8 / (ui.view.zoom * DPR), 0, Math.PI * 2);
      ctx.fill();
    });

    const selectedNodes = nodes.filter(
      n => ui.selectedNodeIds.has(n.id) && visibleNodeIdsRef.current.has(n.id),
    );
    if (selectedNodes.length > 1) {
      const minX = Math.min(...selectedNodes.map(n => n.x));
      const minY = Math.min(...selectedNodes.map(n => n.y));
      const maxX = Math.max(...selectedNodes.map(n => n.x + n.width));
      const maxY = Math.max(...selectedNodes.map(n => n.y + n.height));
      const scale = 1 / ui.view.zoom;
      const handles: Array<{ key: ResizeHandle; x: number; y: number }> = [
        { key: 'nw', x: minX, y: minY },
        { key: 'n', x: (minX + maxX) / 2, y: minY },
        { key: 'ne', x: maxX, y: minY },
        { key: 'e', x: maxX, y: (minY + maxY) / 2 },
        { key: 'se', x: maxX, y: maxY },
        { key: 's', x: (minX + maxX) / 2, y: maxY },
        { key: 'sw', x: minX, y: maxY },
        { key: 'w', x: minX, y: (minY + maxY) / 2 },
      ];
      selectionBoundsRef.current = { minX, minY, maxX, maxY, handles };
      const handleSize = 12 * scale;
      ctx.save();
      ctx.lineWidth = 1.5 / (ui.view.zoom * DPR);
      ctx.strokeStyle = '#38bdf8';
      ctx.setLineDash([8 * scale, 5 * scale]);
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      ctx.setLineDash([]);
      handles.forEach(handle => {
        ctx.fillStyle = hoverHandle === handle.key ? '#38bdf8' : '#1d4ed8';
        ctx.strokeStyle = '#0ea5e9';
        ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
      });
      ctx.restore();
    } else {
      selectionBoundsRef.current = null;
    }

    const marquee = marqueeRef.current;
    if (marquee) {
      const { start, current } = marquee;
      const minX = Math.min(start.x, current.x);
      const minY = Math.min(start.y, current.y);
      const maxX = Math.max(start.x, current.x);
      const maxY = Math.max(start.y, current.y);
      ctx.save();
      ctx.fillStyle = '#38bdf8';
      ctx.globalAlpha = 0.12;
      ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1 / (ui.view.zoom * DPR);
      ctx.setLineDash([6 / ui.view.zoom, 4 / ui.view.zoom]);
      ctx.strokeStyle = '#38bdf8';
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      ctx.setLineDash([]);
      ctx.restore();
    }

  }, [
    ui.view.x,
    ui.view.y,
    ui.view.zoom,
    ui.searchTerm,
    ui.statusFilter,
    ui.tagFilters,
    nodes,
    edges,
    size.w,
    size.h,
    ui.selectedNodeIds,
    hoverHandle,
  ]);

  useEffect(() => {
    const loop = () => {
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [draw]);

  // Helpers to convert between screen and world coords
  const screenToWorld = (sx: number, sy: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const DPR = window.devicePixelRatio || 1;
    const x = (sx - rect.left - canvas.width / (2 * DPR)) / ui.view.zoom + ui.view.x;
    const y = (sy - rect.top - canvas.height / (2 * DPR)) / ui.view.zoom + ui.view.y;
    return { x, y };
  };

  // Pointer events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let lastPointerId: number | null = null;

    const hitResizeHandle = (point: { x: number; y: number }): ResizeHandle | null => {
      const bounds = selectionBoundsRef.current;
      if (!bounds) return null;
      const size = 12 * (1 / ui.view.zoom);
      const half = size / 2;
      for (const handle of bounds.handles) {
        if (Math.abs(point.x - handle.x) <= half && Math.abs(point.y - handle.y) <= half) {
          return handle.key;
        }
      }
      return null;
    };

    const applyGroupResize = (pointer: { x: number; y: number }) => {
      const state = groupResizeRef.current;
      if (!state) return;
      const bounds = state.startBounds;
      let newMinX = bounds.minX;
      let newMaxX = bounds.maxX;
      let newMinY = bounds.minY;
      let newMaxY = bounds.maxY;

      if (state.handle.includes('w')) {
        newMinX = Math.min(pointer.x, bounds.maxX - MIN_GROUP_DIMENSION);
      }
      if (state.handle.includes('e')) {
        newMaxX = Math.max(pointer.x, bounds.minX + MIN_GROUP_DIMENSION);
      }
      if (state.handle.includes('n')) {
        newMinY = Math.min(pointer.y, bounds.maxY - MIN_GROUP_DIMENSION);
      }
      if (state.handle.includes('s')) {
        newMaxY = Math.max(pointer.y, bounds.minY + MIN_GROUP_DIMENSION);
      }

      const affectsX = state.handle.includes('w') || state.handle.includes('e');
      const affectsY = state.handle.includes('n') || state.handle.includes('s');

      if (!affectsX) {
        newMinX = bounds.minX;
        newMaxX = bounds.maxX;
      }
      if (!affectsY) {
        newMinY = bounds.minY;
        newMaxY = bounds.maxY;
      }

      const startWidth = Math.max(bounds.maxX - bounds.minX, 1);
      const startHeight = Math.max(bounds.maxY - bounds.minY, 1);
      const newWidth = Math.max(newMaxX - newMinX, MIN_GROUP_DIMENSION);
      const newHeight = Math.max(newMaxY - newMinY, MIN_GROUP_DIMENSION);

      const scaleX = affectsX ? newWidth / startWidth : 1;
      const scaleY = affectsY ? newHeight / startHeight : 1;

      const updates = new Map<number, { x: number; y: number; width: number; height: number }>();
      state.startSnapshot.forEach((snapshot, id) => {
        const relX = (snapshot.x - bounds.minX) / startWidth;
        const relY = (snapshot.y - bounds.minY) / startHeight;
        const nextWidth = affectsX ? Math.max(40, snapshot.width * scaleX) : snapshot.width;
        const nextHeight = affectsY ? Math.max(40, snapshot.height * scaleY) : snapshot.height;
        const nextX = affectsX ? newMinX + relX * newWidth : snapshot.x;
        const nextY = affectsY ? newMinY + relY * newHeight : snapshot.y;
        updates.set(id, { x: nextX, y: nextY, width: nextWidth, height: nextHeight });
      });

      queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) =>
        (old || []).map(node => (updates.has(node.id) ? { ...node, ...updates.get(node.id)! } : node)),
      );
      state.lastApplied = updates;
    };

    const commitGroupResize = () => {
      const state = groupResizeRef.current;
      if (!state) return;
      const updates = state.lastApplied;
      if (!updates || updates.size === 0) {
        groupResizeRef.current = null;
        return;
      }
      const prev = state.startSnapshot;
      queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) =>
        (old || []).map(node => (prev.has(node.id) ? { ...node, ...prev.get(node.id)! } : node)),
      );
      commandStack.execute({
        redo: () => {
          queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) =>
            (old || []).map(node => (updates.has(node.id) ? { ...node, ...updates.get(node.id)! } : node)),
          );
          updates.forEach((val, id) => updateNode(boardId, id, val).catch(() => {}));
        },
        undo: () => {
          queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) =>
            (old || []).map(node => (prev.has(node.id) ? { ...node, ...prev.get(node.id)! } : node)),
          );
          prev.forEach((val, id) => updateNode(boardId, id, val).catch(() => {}));
        },
      });
      groupResizeRef.current = null;
    };

    const onPointerDown = (e: PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      lastPointerId = e.pointerId;
      const p = screenToWorld(e.clientX, e.clientY);
      // check edge hit first
      const hitEdge = pointerEdgeHitTest(e.clientX, e.clientY);
      if (hitEdge != null) {
        setSelectedEdgeId(hitEdge);
        ui.clearNodeSelection();
        return;
      } else {
        setSelectedEdgeId(null);
      }
      if (ui.mode === 'panning' || e.button === 1) {
        panRef.current = { isPanning: true, startX: e.clientX, startY: e.clientY };
        return;
      }

      // linking start
      if (ui.mode === 'linking') {
        for (let i = nodes.length - 1; i >= 0; i--) {
          const n = nodes[i];
          if (!visibleNodeIdsRef.current.has(n.id)) continue;
          if (isPointInNode(p.x, p.y, n)) {
            linkingRef.current = { fromId: n.id, toX: p.x, toY: p.y };
            return;
          }
        }
        return;
      }

      const bounds = selectionBoundsRef.current;
      if (ui.mode === 'select' && bounds) {
        const handleHit = hitResizeHandle(p);
        if (handleHit) {
          const selectedIds = Array.from(ui.selectedNodeIds);
          if (selectedIds.length > 1) {
            const snapshot = new Map<number, { x: number; y: number; width: number; height: number }>();
            const currentNodes = queryClient.getQueryData<Node[]>(['nodes', boardId]) || nodes;
            selectedIds.forEach(id => {
              const target = currentNodes.find(node => node.id === id) || nodes.find(node => node.id === id);
              if (target && visibleNodeIdsRef.current.has(target.id)) {
                snapshot.set(id, { x: target.x, y: target.y, width: target.width, height: target.height });
              }
            });
            groupResizeRef.current = {
              handle: handleHit,
              startPointer: p,
              startBounds: bounds,
              startSnapshot: snapshot,
              lastApplied: null,
            };
            setHoverHandle(handleHit);
            marqueeRef.current = null;
            return;
          }
        }
      }

      // detect handle hit (small circle on right side of node) to start linking regardless of mode
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (!visibleNodeIdsRef.current.has(n.id)) continue;
        const hx = n.x + n.width + 8;
        const hy = n.y + n.height / 2;
        const rworld = 8 / ui.view.zoom;
        if (Math.hypot(p.x - hx, p.y - hy) <= rworld) {
          linkingRef.current = { fromId: n.id, toX: p.x, toY: p.y };
          return;
        }
      }

      // detect edge endpoint hit (to start reconnecting)
      for (let ei = edges.length - 1; ei >= 0; ei--) {
        const edge = edges[ei];
        const s = nodes.find(n => n.id === edge.source_node_id);
        const t = nodes.find(n => n.id === edge.target_node_id);
        if (!s || !t) continue;
        if (!visibleNodeIdsRef.current.has(s.id) || !visibleNodeIdsRef.current.has(t.id)) continue;
        const sx = s.x + s.width / 2;
        const sy = s.y + s.height / 2;
        const tx = t.x + t.width / 2;
        const ty = t.y + t.height / 2;
        const rworld = 10 / ui.view.zoom;
        if (Math.hypot(p.x - sx, p.y - sy) <= rworld) {
          edgeDragRef.current = { edgeId: edge.id, which: 'source', toX: sx, toY: sy, originalNodeId: edge.source_node_id };
          return;
        }
        if (Math.hypot(p.x - tx, p.y - ty) <= rworld) {
          edgeDragRef.current = { edgeId: edge.id, which: 'target', toX: tx, toY: ty, originalNodeId: edge.target_node_id };
          return;
        }
      }

      // hit test nodes (top-most)
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (!visibleNodeIdsRef.current.has(n.id)) continue;
        if (isPointInNode(p.x, p.y, n)) {
          marqueeRef.current = null;
          if (n.type === 'task') {
            const checkboxX = n.x + TASK_CHECKBOX_MARGIN;
            const checkboxY = n.y + TASK_CHECKBOX_MARGIN;
            if (
              p.x >= checkboxX &&
              p.x <= checkboxX + TASK_CHECKBOX_SIZE &&
              p.y >= checkboxY &&
              p.y <= checkboxY + TASK_CHECKBOX_SIZE
            ) {
              const currentNodes = queryClient.getQueryData<Node[]>(['nodes', boardId]) || [];
              const target = currentNodes.find(node => node.id === n.id) || n;
              const prevStatus = target.status ?? 'todo';
              const nextStatus = cycleTaskStatus(prevStatus);
              commandStack.execute({
                redo: () => {
                  queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) =>
                    (old || []).map(node =>
                      node.id === target.id ? { ...node, status: nextStatus } : node,
                    ),
                  );
                  updateNode(boardId, target.id, { status: nextStatus }).catch(() => {});
                },
                undo: () => {
                  queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) =>
                    (old || []).map(node =>
                      node.id === target.id ? { ...node, status: prevStatus } : node,
                    ),
                  );
                  updateNode(boardId, target.id, { status: prevStatus }).catch(() => {});
                },
              });
              return;
            }
          }
          ui.selectNode(n.id, e.shiftKey);
          // setup group drag snapshot if multiple selected
          const selected = Array.from(ui.selectedNodeIds);
          if (selected.length > 1 && ui.selectedNodeIds.has(n.id)) {
            const snap = new Map<number, { x: number; y: number }>();
            const all = queryClient.getQueryData<Node[]>(['nodes', boardId]) || [];
            selected.forEach(id => {
              const nn = all.find(x => x.id === id);
              if (nn) snap.set(id, { x: nn.x, y: nn.y });
            });
            groupDragRef.current = snap;
            moveSnapshotRef.current = snap;
          }
          draggingRef.current = { nodeId: n.id, offsetX: p.x - n.x, offsetY: p.y - n.y };
          // if single node drag, capture its original position
          if (!moveSnapshotRef.current) {
            const current = queryClient.getQueryData<Node[]>(['nodes', boardId]) || [];
            const nn = current.find(x => x.id === n.id);
            const map = new Map<number, { x: number; y: number }>();
            if (nn) map.set(nn.id, { x: nn.x, y: nn.y });
            moveSnapshotRef.current = map;
          }
          return;
        }
      }
      // clicked empty space
      if (!e.shiftKey) ui.clearNodeSelection();
      setSelectedEdgeId(null);
      marqueeRef.current = { start: p, current: p, additive: e.shiftKey };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (lastPointerId !== null && e.pointerId !== lastPointerId) return;
      if (panRef.current?.isPanning) {
        const dx = (panRef.current.startX - e.clientX) / ui.view.zoom;
        const dy = (panRef.current.startY - e.clientY) / ui.view.zoom;
        ui.setView({ x: ui.view.x + dx, y: ui.view.y + dy });
        panRef.current.startX = e.clientX;
        panRef.current.startY = e.clientY;
        return;
      }
      const worldPoint = screenToWorld(e.clientX, e.clientY);
      if (groupResizeRef.current) {
        applyGroupResize(worldPoint);
        return;
      }
      if (marqueeRef.current) {
        marqueeRef.current.current = worldPoint;
        return;
      }
      if (linkingRef.current && linkingRef.current.fromId != null) {
        linkingRef.current.toX = worldPoint.x;
        linkingRef.current.toY = worldPoint.y;
        return;
      }

      // edge endpoint drag preview
      if (edgeDragRef.current) {
        edgeDragRef.current.toX = worldPoint.x;
        edgeDragRef.current.toY = worldPoint.y;
        return;
      }

      const resizeHover = hitResizeHandle(worldPoint);
      if (resizeHover !== hoverHandle) setHoverHandle(resizeHover);

      // hover handle detection for node link handles
      let foundHover: number | null = null;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (!visibleNodeIdsRef.current.has(n.id)) continue;
        const hx = n.x + n.width + 8;
        const hy = n.y + n.height / 2;
        const rworld = 8 / ui.view.zoom;
        if (Math.hypot(worldPoint.x - hx, worldPoint.y - hy) <= rworld) { foundHover = n.id; break; }
      }
      if (foundHover !== hoverNodeId) setHoverNodeId(foundHover);

      if (draggingRef.current && draggingRef.current.nodeId != null) {
        const nodeId = draggingRef.current.nodeId;
        const nx = worldPoint.x - draggingRef.current.offsetX;
        const ny = worldPoint.y - draggingRef.current.offsetY;
        const selected = Array.from(ui.selectedNodeIds);
        if (selected.length > 1 && ui.selectedNodeIds.has(nodeId) && groupDragRef.current) {
          const original = groupDragRef.current.get(nodeId);
          if (original) {
            const dx = nx - original.x;
            const dy = ny - original.y;
            queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) => (old || []).map(n => selected.includes(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n));
          }
        } else {
          // optimistic local update single
          queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) => old.map(n => n.id === nodeId ? { ...n, x: nx, y: ny } : n));
        }
        return;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (lastPointerId !== null && e.pointerId !== lastPointerId) return;
      if (panRef.current?.isPanning) {
        panRef.current = null;
      }
      if (groupResizeRef.current) {
        commitGroupResize();
        setHoverHandle(null);
        marqueeRef.current = null;
        lastPointerId = null;
        return;
      }
      if (marqueeRef.current) {
        const { start, current, additive } = marqueeRef.current;
        marqueeRef.current = null;
        const minX = Math.min(start.x, current.x);
        const minY = Math.min(start.y, current.y);
        const maxX = Math.max(start.x, current.x);
        const maxY = Math.max(start.y, current.y);
        const selectedIds = nodes
          .filter(n => n.x + n.width >= minX && n.x <= maxX && n.y + n.height >= minY && n.y <= maxY)
          .map(n => n.id);
        if (selectedIds.length > 0) {
          ui.selectNodes(selectedIds, additive);
        } else if (!additive) {
          ui.clearNodeSelection();
        }
        setHoverHandle(null);
        lastPointerId = null;
        return;
      }
      if (draggingRef.current && draggingRef.current.nodeId != null) {
        const nodeId = draggingRef.current.nodeId;
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          // build previous and next position maps for command
          const prevMap = moveSnapshotRef.current || new Map<number, { x: number; y: number }>();
          const cached = queryClient.getQueryData<Node[]>(['nodes', boardId]) || [];
          const nextMap = new Map<number, { x: number; y: number }>();
          const selected = Array.from(ui.selectedNodeIds);
          if (selected.length > 1 && ui.selectedNodeIds.has(nodeId)) {
            for (const id of selected) {
              const nn = cached.find(x => x.id === id);
              if (nn) nextMap.set(id, { x: nn.x, y: nn.y });
            }
          } else {
            const nn = cached.find(x => x.id === nodeId);
            if (nn) nextMap.set(nodeId, { x: nn.x, y: nn.y });
          }

          const redo = () => {
            queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) => (old || []).map(n => nextMap.has(n.id) ? { ...n, x: nextMap.get(n.id)!.x, y: nextMap.get(n.id)!.y } : n));
            // persist to server in background
            nextMap.forEach((pos, id) => { updateNode(boardId, id, pos).catch(()=>{}); });
          };
          const undo = () => {
            queryClient.setQueryData<Node[]>(['nodes', boardId], (old = []) => (old || []).map(n => prevMap.has(n.id) ? { ...n, x: prevMap.get(n.id)!.x, y: prevMap.get(n.id)!.y } : n));
            prevMap.forEach((pos, id) => { updateNode(boardId, id, pos).catch(()=>{}); });
          };
          commandStack.execute({ redo, undo });
          moveSnapshotRef.current = null;
        }
      }
      // finalize linking if any
      if (linkingRef.current && linkingRef.current.fromId != null) {
        const p = screenToWorld(e.clientX, e.clientY);
        for (let i = nodes.length - 1; i >= 0; i--) {
          const n = nodes[i];
          if (!visibleNodeIdsRef.current.has(n.id)) continue;
          if (isPointInNode(p.x, p.y, n) && n.id !== linkingRef.current.fromId) {
            const payload = { source_node_id: linkingRef.current.fromId, target_node_id: n.id };
            const tempEdge = { ...payload, id: -Date.now(), board_id: boardId } as Edge;
            const redo = () => {
              queryClient.setQueryData<Edge[]>(['edges', boardId], [...(queryClient.getQueryData<Edge[]>(['edges', boardId]) || []), tempEdge]);
              // fire background create (server will broadcast)
              createEdge(boardId, payload).catch(() => {});
            };
            const undo = () => {
              queryClient.setQueryData<Edge[]>(['edges', boardId], (queryClient.getQueryData<Edge[]>(['edges', boardId]) || []).filter(x => x.id !== tempEdge.id));
            };
            commandStack.execute({ redo, undo });
            break;
          }
        }
      }
      // finalize edge reconnect if any
      if (edgeDragRef.current) {
        const ed = edgeDragRef.current;
        const p = screenToWorld(e.clientX, e.clientY);
        // find node under release (if any)
        let targetNode: Node | null = null;
        for (let i = nodes.length - 1; i >= 0; i--) {
          const n = nodes[i];
          if (!visibleNodeIdsRef.current.has(n.id)) continue;
          if (isPointInNode(p.x, p.y, n) && n.id !== ed.originalNodeId) { targetNode = n; break; }
        }
        if (targetNode) {
          const prev = edges.find(x => x.id === ed.edgeId) as Edge | undefined;
          if (prev) {
            const payload: EdgeWritePayload = ed.which === 'source' ? { source_node_id: targetNode.id } : { target_node_id: targetNode.id };
            const redo = () => {
              queryClient.setQueryData<Edge[]>(['edges', boardId], (old = []) => (old || []).map(x => x.id === ed.edgeId ? { ...x, ...payload } : x));
              updateEdge(boardId, ed.edgeId, payload).catch(()=>{});
            };
            const undo = () => {
              queryClient.setQueryData<Edge[]>(['edges', boardId], (old = []) => (old || []).map(x => x.id === ed.edgeId ? prev : x));
              const revertPayload: EdgeWritePayload = ed.which === 'source'
                ? { source_node_id: ed.originalNodeId }
                : { target_node_id: ed.originalNodeId };
              updateEdge(boardId, ed.edgeId, revertPayload).catch(()=>{});
            };
            commandStack.execute({ redo, undo });
          }
        }
        edgeDragRef.current = null;
      }
      draggingRef.current = null;
      lastPointerId = null;
      groupDragRef.current = null;
      linkingRef.current = null;
    };

    const onDoubleClick = (e: MouseEvent) => {
      const pe = e as unknown as PointerEvent;
      const p = screenToWorld(pe.clientX, pe.clientY);
      // hit test
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (!visibleNodeIdsRef.current.has(n.id)) continue;
        if (isPointInNode(p.x, p.y, n)) {
          onNodeDoubleClick(n.id);
          return;
        }
      }
      // create a new node centered at click
      const payload = {
        board_id: boardId,
        flow_id: flows[0]?.id || null,
        type: 'note' as const,
        title: 'New note',
        content: '',
        tags: [],
        status: null,
        journaled_at: null,
        x: p.x - 80,
        y: p.y - 32,
        width: 200,
        height: 120,
      };
      // optimistic create: insert a temporary node id (-timestamp)
      const tempId = -Date.now();
      const optimistic = { ...payload, id: tempId } as Node;
      const previous = queryClient.getQueryData<Node[]>(['nodes', boardId]) || [];
      queryClient.setQueryData<Node[]>(['nodes', boardId], [...previous, optimistic]);
      (async () => {
        try {
          await createNode(boardId, payload);
          queryClient.invalidateQueries({ queryKey: ['nodes', boardId] });
        } catch {
          queryClient.setQueryData<Node[]>(['nodes', boardId], previous);
        }
      })();
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // allow browser zoom
      e.preventDefault();
      const delta = -e.deltaY;
      const zoomFactor = Math.exp(delta * 0.001);
      const rect = canvas.getBoundingClientRect();
      const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY);
      const newZoom = Math.max(0.2, Math.min(3, ui.view.zoom * zoomFactor));
      // adjust view so the point under cursor remains stable
      const nx = wx - (e.clientX - rect.left - rect.width / 2) / newZoom;
      const ny = wy - (e.clientY - rect.top - rect.height / 2) / newZoom;
      ui.setView({ zoom: newZoom, x: nx, y: ny });
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('dblclick', onDoubleClick);
    const wheelListener: EventListener = onWheel as EventListener;
    const contextListener: EventListener = onContext as EventListener;
    canvas.addEventListener('wheel', onWheel, { passive: false });
    // contextmenu for right-click actions
    const isPointNearBezier = (x1:number,y1:number,cp1x:number,cp1y:number,cp2x:number,cp2y:number,x2:number,y2:number, px:number, py:number) => {
      const steps = 30;
      const DPR_local = window.devicePixelRatio || 1;
      const threshold = 8 / (ui.view.zoom * DPR_local);
      for (let i=0;i<=steps;i++){
        const t = i/steps;
        const u = 1 - t;
        const bx = u*u*u*x1 + 3*u*u*t*cp1x + 3*u*t*t*cp2x + t*t*t*x2;
        const by = u*u*u*y1 + 3*u*u*t*cp1y + 3*u*t*t*cp2y + t*t*t*y2;
        const dx = bx - px; const dy = by - py;
        if (Math.sqrt(dx*dx+dy*dy) <= threshold) return true;
      }
      return false;
    };

    const onContext = (ev: MouseEvent) => {
      ev.preventDefault();
      const p = screenToWorld(ev.clientX, ev.clientY);
      // build DOM context menu
      const container = canvas.parentElement || document.body;
      const menu = document.createElement('div');
      menu.style.position = 'absolute';
      menu.style.left = ev.clientX + 'px';
      menu.style.top = ev.clientY + 'px';
      menu.style.background = '#0f172a';
      menu.style.color = 'white';
      menu.style.padding = '6px';
      menu.style.border = '1px solid #374151';
      menu.style.borderRadius = '6px';
      menu.style.zIndex = '9999';

      const removeMenu = () => { menu.remove(); window.removeEventListener('click', removeMenu); };

      // edge actions
      for (let ei = edges.length - 1; ei >= 0; ei--) {
        const e = edges[ei];
        const s = nodes.find(n => n.id === e.source_node_id);
        const t = nodes.find(n => n.id === e.target_node_id);
        if (!s || !t) continue;
        if (!visibleNodeIdsRef.current.has(s.id) || !visibleNodeIdsRef.current.has(t.id)) continue;
        const x1 = s.x + s.width / 2;
        const y1 = s.y + s.height / 2;
        const x2 = t.x + t.width / 2;
        const y2 = t.y + t.height / 2;
        const dx = Math.abs(x2 - x1);
        const dir = x2 > x1 ? 1 : -1;
        const cp1x = x1 + dir * dx * 0.25;
        const cp1y = y1 + ((y2 - y1) * 0.12);
        const cp2x = x2 - dir * dx * 0.25;
        const cp2y = y2 - ((y2 - y1) * 0.12);
        if (isPointNearBezier(x1,y1,cp1x,cp1y,cp2x,cp2y,x2,y2,p.x,p.y)){
          const del = document.createElement('div');
          del.textContent = 'Delete edge';
          del.style.padding = '6px 10px';
          del.style.cursor = 'pointer';
          del.onclick = () => {
            const current = queryClient.getQueryData<Edge[]>(['edges', boardId]) || [];
            const redo = () => queryClient.setQueryData<Edge[]>(['edges', boardId], (queryClient.getQueryData<Edge[]>(['edges', boardId]) || []).filter(x => x.id !== e.id));
            const undo = () => queryClient.setQueryData<Edge[]>(['edges', boardId], current);
            commandStack.execute({ redo: () => { redo(); deleteEdge(boardId, e.id).catch(()=>{}); }, undo });
            removeMenu();
          };
          menu.appendChild(del);
          container.appendChild(menu);
          window.addEventListener('click', removeMenu);
          return;
        }
      }

      // hit test nodes
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (!visibleNodeIdsRef.current.has(n.id)) continue;
        if (isPointInNode(p.x, p.y, n)) {
          const dup = document.createElement('div');
          dup.textContent = 'Duplicate node';
          dup.style.padding = '6px 10px';
          dup.style.cursor = 'pointer';
          dup.onclick = () => {
            const payload = { board_id: boardId, flow_id: n.flow_id, type: n.type, title: n.title + ' (copy)', x: n.x + 20, y: n.y + 20, width: n.width, height: n.height };
            const temp = { ...payload, id: -Date.now() } as Node;
            const redo = () => queryClient.setQueryData<Node[]>(['nodes', boardId], [...(queryClient.getQueryData<Node[]>(['nodes', boardId]) || []), temp]);
            const undo = () => queryClient.setQueryData<Node[]>(['nodes', boardId], (queryClient.getQueryData<Node[]>(['nodes', boardId]) || []).filter(x => x.id !== temp.id));
            commandStack.execute({ redo: () => { redo(); createNode(boardId, payload).catch(()=>{}); }, undo });
            removeMenu();
          };
          const del = document.createElement('div');
          del.textContent = 'Delete node';
          del.style.padding = '6px 10px';
          del.style.cursor = 'pointer';
          del.onclick = () => {
            const current = queryClient.getQueryData<Node[]>(['nodes', boardId]) || [];
            const redo = () => queryClient.setQueryData<Node[]>(['nodes', boardId], (queryClient.getQueryData<Node[]>(['nodes', boardId]) || []).filter(x => x.id !== n.id));
            const undo = () => queryClient.setQueryData<Node[]>(['nodes', boardId], current);
            commandStack.execute({ redo: () => { redo(); deleteNode(boardId, n.id).catch(()=>{}); }, undo });
            removeMenu();
          };
          menu.appendChild(dup);
          menu.appendChild(del);
          container.appendChild(menu);
          window.addEventListener('click', removeMenu);
          return;
        }
      }
    };
    // add pointerdown edge hit-testing to allow selecting edges
    const pointerEdgeHitTest = (clientX: number, clientY: number) => {
      const p = screenToWorld(clientX, clientY);
      for (let ei = edges.length - 1; ei >= 0; ei--) {
        const e = edges[ei];
        const s = nodes.find(n => n.id === e.source_node_id);
        const t = nodes.find(n => n.id === e.target_node_id);
        if (!s || !t) continue;
        const x1 = s.x + s.width / 2;
        const y1 = s.y + s.height / 2;
        const x2 = t.x + t.width / 2;
        const y2 = t.y + t.height / 2;
        const dx = Math.abs(x2 - x1);
        const dir = x2 > x1 ? 1 : -1;
        const cp1x = x1 + dir * dx * 0.25;
        const cp1y = y1;
        const cp2x = x2 - dir * dx * 0.25;
        const cp2y = y2;
        if (isPointNearBezier(x1,y1,cp1x,cp1y,cp2x,cp2y,x2,y2,p.x,p.y)){
          return e.id;
        }
      }
      return null;
    };
    canvas.addEventListener('contextmenu', onContext);


    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('dblclick', onDoubleClick);
      canvas.removeEventListener('wheel', wheelListener);
      canvas.removeEventListener('contextmenu', contextListener);
    };
  }, [nodes, edges, ui.mode, ui.view.zoom, ui.view.x, ui.view.y, boardId, flows, onNodeDoubleClick, queryClient, ui]);

  return (
    <div style={{ flex: 1, position: 'relative', background: '#0f172a', height: '600px' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
};

export default InfiniteCanvas;
