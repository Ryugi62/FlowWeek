import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Flow, Node, Edge } from '../App';
import { useUiStore } from '../stores';
import { useQueryClient } from '@tanstack/react-query';
import { updateNode, createNode, createEdge, deleteNode } from '../api';

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

const InfiniteCanvas: React.FC<CanvasProps> = ({ flows, nodes, edges, boardId, onNodeDoubleClick }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const draggingRef = useRef<{ nodeId: number | null; offsetX: number; offsetY: number } | null>(null);
  const groupDragRef = useRef<Map<number, { x: number; y: number }> | null>(null);
  const linkingRef = useRef<{ fromId: number | null; toX: number; toY: number } | null>(null);
  const panRef = useRef<{ isPanning: boolean; startX: number; startY: number } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const ui = useUiStore();
  const queryClient = useQueryClient();

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

    // render edges (simple straight lines)
    ctx.lineWidth = 2 / (ui.view.zoom * DPR);
    ctx.strokeStyle = '#9ca3af88';
    edges.forEach(e => {
      const s = nodes.find(n => n.id === e.source_node_id);
      const t = nodes.find(n => n.id === e.target_node_id);
      if (!s || !t) return;
      ctx.beginPath();
      ctx.moveTo(s.x + s.width / 2, s.y + s.height / 2);
      ctx.lineTo(t.x + t.width / 2, t.y + t.height / 2);
      ctx.stroke();
    });

    // render nodes
    // apply search filter if present
    const filtered = ui.searchTerm ? nodes.filter(n => (n.title || '').toLowerCase().includes((ui.searchTerm || '').toLowerCase())) : nodes;

    filtered.forEach(node => {
      const selected = ui.selectedNodeIds.has(node.id);
      ctx.save();
      ctx.translate(node.x, node.y);
      // node box
      ctx.fillStyle = selected ? '#0ea5e988' : '#1f2937';
      ctx.strokeStyle = selected ? '#06b6d4' : '#374151';
      ctx.lineWidth = 2 / (ui.view.zoom * DPR);
      ctx.fillRect(0, 0, node.width, node.height);
      ctx.strokeRect(0, 0, node.width, node.height);
      // title
      ctx.fillStyle = '#e5e7eb';
      ctx.font = `${14 / (ui.view.zoom)}px sans-serif`;
      ctx.fillText(node.title || 'Untitled', 8, 18 / (ui.view.zoom));
      ctx.restore();
  });

  }, [ui.view.x, ui.view.y, ui.view.zoom, nodes, edges, size.w, size.h, ui.selectedNodeIds]);

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

    const onPointerDown = (e: PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      lastPointerId = e.pointerId;
      const p = screenToWorld(e.clientX, e.clientY);
      if (ui.mode === 'panning' || e.button === 1) {
        panRef.current = { isPanning: true, startX: e.clientX, startY: e.clientY };
        return;
      }

      // linking start
      if (ui.mode === 'linking') {
        for (let i = nodes.length - 1; i >= 0; i--) {
          const n = nodes[i];
          if (isPointInNode(p.x, p.y, n)) {
            linkingRef.current = { fromId: n.id, toX: p.x, toY: p.y };
            return;
          }
        }
        return;
      }

      // hit test nodes (top-most)
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (isPointInNode(p.x, p.y, n)) {
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
          }
          draggingRef.current = { nodeId: n.id, offsetX: p.x - n.x, offsetY: p.y - n.y };
          return;
        }
      }
      // clicked empty space
      ui.clearNodeSelection();
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
      if (linkingRef.current && linkingRef.current.fromId != null) {
        const p = screenToWorld(e.clientX, e.clientY);
        linkingRef.current.toX = p.x;
        linkingRef.current.toY = p.y;
        return;
      }

      if (draggingRef.current && draggingRef.current.nodeId != null) {
        const p = screenToWorld(e.clientX, e.clientY);
        const nodeId = draggingRef.current.nodeId;
        const nx = p.x - draggingRef.current.offsetX;
        const ny = p.y - draggingRef.current.offsetY;
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
      if (draggingRef.current && draggingRef.current.nodeId != null) {
        const nodeId = draggingRef.current.nodeId;
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          // find current cached node and send PATCH
          const current = (queryClient.getQueryData<Node[]>(['nodes', boardId]) || []).find(n => n.id === nodeId);
          if (current) {
            // optimistic: already set in cache during drag; ensure backend is updated
            (async () => {
              const previous = queryClient.getQueryData<Node[]>(['nodes', boardId]);
              try {
                const selected = Array.from(ui.selectedNodeIds);
                if (selected.length > 1 && selected.includes(nodeId)) {
                  const all = queryClient.getQueryData<Node[]>(['nodes', boardId]) || [];
                  for (const id of selected) {
                    const n = all.find(x => x.id === id);
                    if (n) await updateNode(boardId, id, { x: n.x, y: n.y });
                  }
                } else {
                  await updateNode(boardId, nodeId, { x: current.x, y: current.y });
                }
                queryClient.invalidateQueries({ queryKey: ['nodes', boardId] });
              } catch (err) {
                // revert
                if (previous) queryClient.setQueryData(['nodes', boardId], previous);
              }
            })();
          }
        }
      }
      // finalize linking if any
      if (linkingRef.current && linkingRef.current.fromId != null) {
        const p = screenToWorld(e.clientX, e.clientY);
        for (let i = nodes.length - 1; i >= 0; i--) {
          const n = nodes[i];
          if (isPointInNode(p.x, p.y, n) && n.id !== linkingRef.current.fromId) {
            const payload = { source_node_id: linkingRef.current.fromId, target_node_id: n.id };
            const previous = queryClient.getQueryData<Edge[]>(['edges', boardId]) || [];
            queryClient.setQueryData<Edge[]>(['edges', boardId], [...previous, { ...payload, id: -Date.now(), board_id: boardId } as Edge]);
            (async () => {
              try {
                await createEdge(boardId, payload);
                queryClient.invalidateQueries({ queryKey: ['edges', boardId] });
              } catch (err) {
                queryClient.setQueryData<Edge[]>(['edges', boardId], previous);
              }
            })();
            break;
          }
        }
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
        if (isPointInNode(p.x, p.y, n)) {
          onNodeDoubleClick(n.id);
          return;
        }
      }
      // create a new node centered at click
      const payload = { board_id: boardId, flow_id: flows[0]?.id || null, type: 'note', title: 'New note', x: p.x - 80, y: p.y - 32, width: 160, height: 64 };
      // optimistic create: insert a temporary node id (-timestamp)
      const tempId = -Date.now();
      const optimistic = { ...payload, id: tempId } as Node;
      const previous = queryClient.getQueryData<Node[]>(['nodes', boardId]) || [];
      queryClient.setQueryData<Node[]>(['nodes', boardId], [...previous, optimistic]);
      (async () => {
          try {
            await createNode(boardId, payload);
            queryClient.invalidateQueries({ queryKey: ['nodes', boardId] });
        } catch (err) {
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
    canvas.addEventListener('wheel', onWheel, { passive: false });
    // contextmenu for right-click actions
    const onContext = (ev: MouseEvent) => {
      ev.preventDefault();
      const p = screenToWorld(ev.clientX, ev.clientY);
      // hit test
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (isPointInNode(p.x, p.y, n)) {
          // show a simple native menu via prompt (quick implementation)
          const action = window.prompt('Context action for node ' + n.id + ' (duplicate/delete/cancel)');
          if (action === 'duplicate') {
            const payload = { board_id: boardId, flow_id: n.flow_id, type: n.type, title: n.title + ' (copy)', x: n.x + 20, y: n.y + 20, width: n.width, height: n.height };
            const previous = queryClient.getQueryData<Node[]>(['nodes', boardId]) || [];
            queryClient.setQueryData<Node[]>(['nodes', boardId], [...previous, { ...payload, id: -Date.now() } as Node]);
            (async () => {
              try {
                await createNode(boardId, payload);
                queryClient.invalidateQueries({ queryKey: ['nodes', boardId] });
              } catch (err) {
                queryClient.setQueryData<Node[]>(['nodes', boardId], previous);
              }
            })();
          } else if (action === 'delete') {
            const previous = queryClient.getQueryData<Node[]>(['nodes', boardId]) || [];
            queryClient.setQueryData<Node[]>(['nodes', boardId], previous.filter(x => x.id !== n.id));
            (async () => {
              try {
                await deleteNode(boardId, n.id);
                queryClient.invalidateQueries({ queryKey: ['nodes', boardId] });
              } catch (err) {
                queryClient.setQueryData<Node[]>(['nodes', boardId], previous);
              }
            })();
          }
          return;
        }
      }
    };
    canvas.addEventListener('contextmenu', onContext);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('dblclick', onDoubleClick);
      canvas.removeEventListener('wheel', onWheel as any);
      canvas.removeEventListener('contextmenu', onContext as any);
    };
  }, [nodes, edges, ui.mode, ui.view.zoom, ui.view.x, ui.view.y, boardId, flows, onNodeDoubleClick, queryClient, ui]);

  return (
    <div style={{ flex: 1, position: 'relative', background: '#0f172a', height: '600px' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
};

export default InfiniteCanvas;