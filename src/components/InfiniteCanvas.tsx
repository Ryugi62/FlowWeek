
import { useRef, useEffect, useState, useCallback } from 'react';
import { Node, Edge } from '../App';

// --- Drawing Functions ---
const drawGrid = (ctx: CanvasRenderingContext2D, view: { x: number, y: number, zoom: number }, canvas: HTMLCanvasElement) => {
    ctx.save();
    const dpr = window.devicePixelRatio || 1;
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 1 / view.zoom;
    for (let i = 0; i < 7; i++) {
        const x = i * 500;
        ctx.beginPath();
        ctx.moveTo(x, view.y);
        ctx.lineTo(x, canvas.height / dpr / view.zoom + view.y);
        ctx.stroke();
    }
    ctx.restore();
};

const drawNodes = (ctx: CanvasRenderingContext2D, nodes: Node[]) => {
    ctx.save();
    nodes.forEach(node => {
        ctx.fillStyle = '#2d3748';
        ctx.fillRect(node.x, node.y, node.width, node.height);
        ctx.strokeStyle = '#a0aec0';
        ctx.lineWidth = 2 / ctx.getTransform().a; // Adjust line width based on zoom
        ctx.strokeRect(node.x, node.y, node.width, node.height);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '14px system-ui';
        ctx.fillText(node.title, node.x + 10, node.y + 20);
    });
    ctx.restore();
};

const drawEdges = (ctx: CanvasRenderingContext2D, nodes: Node[], edges: Edge[]) => {
    ctx.save();
    ctx.strokeStyle = '#a0aec0';
    ctx.lineWidth = 2 / ctx.getTransform().a;
    edges.forEach(edge => {
        const sourceNode = nodes.find(n => n.id === edge.source_node_id);
        const targetNode = nodes.find(n => n.id === edge.target_node_id);
        if (sourceNode && targetNode) {
            ctx.beginPath();
            ctx.moveTo(sourceNode.x + sourceNode.width / 2, sourceNode.y + sourceNode.height / 2);
            ctx.lineTo(targetNode.x + targetNode.width / 2, targetNode.y + targetNode.height / 2);
            ctx.stroke();
        }
    });
    ctx.restore();
};

// --- Component & Props ---
interface CanvasProps { nodes: Node[]; edges: Edge[]; onNodeCreate: (data: any) => void; onNodeDoubleClick: (id: number) => void; onNodeDragStop: (id: number, pos: any) => void; onEdgeCreate: (src: number, tgt: number) => void; }

const InfiniteCanvas = ({ nodes, edges, onNodeCreate, onNodeDoubleClick, onNodeDragStop, onEdgeCreate }: CanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [internalNodes, setInternalNodes] = useState<Node[]>(nodes);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [mode, setMode] = useState('select');
  const [interaction, setInteraction] = useState({ type: 'idle' });
  const [dragInfo, setDragInfo] = useState<{node: Node, offset: any} | null>(null);
  const [linkStart, setLinkStart] = useState<Node | null>(null);
  const mousePos = useRef({ x: 0, y: 0 });
  const lastPanPos = useRef({ x: 0, y: 0 });

  useEffect(() => { setInternalNodes(nodes); }, [nodes]);

  const screenToWorld = useCallback((sx, sy) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return { x: view.x + (sx - rect.left) / view.zoom, y: view.y + (sy - rect.top) / view.zoom };
  }, [view]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'l') setMode(m => m === 'linking' ? 'select' : 'linking');
        if (e.key === 'h') setMode('panning');
        if (e.key === 'v') setMode('select');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    const hitNode = [...internalNodes].reverse().find(n => worldPos.x >= n.x && worldPos.x <= n.x + n.width && worldPos.y >= n.y && worldPos.y <= n.y + n.height);
    if (mode === 'linking') {
        if (hitNode) {
            if (!linkStart) setLinkStart(hitNode);
            else if (linkStart.id !== hitNode.id) {
                onEdgeCreate(linkStart.id, hitNode.id);
                setLinkStart(null);
                setMode('select');
            }
        }
    } else if (mode === 'select' && hitNode) {
        setInteraction({ type: 'dragging' });
        setDragInfo({ node: hitNode, offset: { x: worldPos.x - hitNode.x, y: worldPos.y - hitNode.y } });
    } else {
        setInteraction({ type: 'panning' });
        lastPanPos.current = { x: e.clientX, y: e.clientY };
    }
  }, [mode, internalNodes, screenToWorld, linkStart, onEdgeCreate]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    mousePos.current = worldPos;
    if (interaction.type === 'panning') {
        const dx = e.clientX - lastPanPos.current.x;
        const dy = e.clientY - lastPanPos.current.y;
        lastPanPos.current = { x: e.clientX, y: e.clientY };
        setView(v => ({ ...v, x: v.x - dx / v.zoom, y: v.y - dy / v.zoom }));
    } else if (interaction.type === 'dragging' && dragInfo) {
        const newX = worldPos.x - dragInfo.offset.x;
        const newY = worldPos.y - dragInfo.offset.y;
        setInternalNodes(current => current.map(n => n.id === dragInfo.node.id ? { ...n, x: newX, y: newY } : n));
    }
  }, [interaction.type, view.zoom, dragInfo, screenToWorld]);

  const handleMouseUp = useCallback(() => {
    if (interaction.type === 'dragging' && dragInfo) {
        const finalNode = internalNodes.find(n => n.id === dragInfo.node.id);
        if (finalNode) onNodeDragStop(finalNode.id, { x: finalNode.x, y: finalNode.y });
    }
    setInteraction({ type: 'idle' });
    setDragInfo(null);
  }, [interaction.type, dragInfo, internalNodes, onNodeDragStop]);

  const handleDoubleClick = useCallback((e: MouseEvent) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    const hitNode = [...internalNodes].reverse().find(n => worldPos.x >= n.x && worldPos.x <= n.x + n.width && worldPos.y >= n.y && worldPos.y <= n.y + n.height);
    if (hitNode) onNodeDoubleClick(hitNode.id);
    else onNodeCreate({ type: 'note', x: worldPos.x, y: worldPos.y, width: 200, height: 100, title: 'New Note' });
  }, [internalNodes, screenToWorld, onNodeDoubleClick, onNodeCreate]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setView(v => ({ ...v, zoom: Math.max(0.2, Math.min(4, v.zoom * (1 - e.deltaY * 0.001))) }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('dblclick', handleDoubleClick);
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('dblclick', handleDoubleClick);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp, handleWheel, handleDoubleClick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const resizeCanvas = () => {
        const dpr = window.devicePixelRatio || 1;
        const parent = canvas.parentElement;
        if (parent) { canvas.width = parent.clientWidth * dpr; canvas.height = parent.clientHeight * dpr; }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    let animId: number;
    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(-view.x * view.zoom, -view.y * view.zoom);
      ctx.scale(view.zoom, view.zoom);
      drawGrid(ctx, view, canvas);
      drawNodes(ctx, internalNodes);
      drawEdges(ctx, internalNodes, edges);
      if (mode === 'linking' && linkStart) {
          ctx.save();
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2 / view.zoom;
          ctx.beginPath();
          ctx.moveTo(linkStart.x + linkStart.width / 2, linkStart.y + linkStart.height / 2);
          ctx.lineTo(mousePos.current.x, mousePos.current.y);
          ctx.stroke();
          ctx.restore();
      }
      ctx.restore();
      animId = requestAnimationFrame(render);
    };
    render();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resizeCanvas); };
  }, [internalNodes, edges, view, mode, linkStart]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', cursor: mode === 'linking' ? 'crosshair' : (interaction.type === 'panning' ? 'grabbing' : 'grab') }} />;
};

export default InfiniteCanvas;
