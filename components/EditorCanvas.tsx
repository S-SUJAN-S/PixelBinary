
import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback, useState } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT, Point, Rect, ClipboardData } from '../types';

interface EditorCanvasProps {
  pixels: Uint8Array;
  setPixels: React.Dispatch<React.SetStateAction<Uint8Array>>;
  zoom: number;
  setZoom: (z: number) => void;
  pan: Point;
  setPan: (p: Point) => void;
  tool: 'pencil' | 'selection';
  setTool: (t: 'pencil' | 'selection') => void;
  selection: Rect | null;
  setSelection: (r: Rect | null) => void;
  pushToUndo: (p: Uint8Array) => void;
  applyAction: (p: Uint8Array) => void;
  clipboard: ClipboardData | null;
  setClipboard: (c: ClipboardData | null) => void;
}

export const EditorCanvas = forwardRef<{ fitToScreen: () => void; commitFloating: () => void }, EditorCanvasProps>(({ 
  pixels, 
  setPixels, 
  zoom, 
  setZoom, 
  pan, 
  setPan,
  tool,
  selection,
  setSelection,
  pushToUndo,
  applyAction,
  clipboard,
  setClipboard
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const isDrawing = useRef(false);
  const isPanning = useRef(false);
  const isSelecting = useRef(false);
  const isMovingSelection = useRef(false);
  
  const lastMousePos = useRef<Point>({ x: 0, y: 0 });
  const touchedInCurrentStroke = useRef<Set<number>>(new Set());
  const selectionStart = useRef<Point | null>(null);
  const snapshotAtStart = useRef<Uint8Array | null>(null);

  const [floatingData, setFloatingData] = useState<{ x: number, y: number, w: number, h: number, data: Uint8Array } | null>(null);
  const [dashOffset, setDashOffset] = useState(0);

  // Clear internal state if selection is cleared externally
  useEffect(() => {
    if (selection === null) {
      setFloatingData(null);
      snapshotAtStart.current = null;
    }
  }, [selection]);

  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const padding = 100;
    const newZoom = Math.max(1, Math.min((container.clientWidth - padding) / CANVAS_WIDTH, (container.clientHeight - padding) / CANVAS_HEIGHT));
    setZoom(newZoom);
    setPan({
      x: (container.clientWidth - CANVAS_WIDTH * newZoom) / 2,
      y: (container.clientHeight - CANVAS_HEIGHT * newZoom) / 2
    });
  }, [setZoom, setPan]);

  const commitFloating = useCallback(() => {
    if (!floatingData) return;
    const next = new Uint8Array(pixels);
    for (let iy = 0; iy < floatingData.h; iy++) {
      for (let ix = 0; ix < floatingData.w; ix++) {
        const targetX = floatingData.x + ix;
        const targetY = floatingData.y + iy;
        if (targetX >= 0 && targetX < CANVAS_WIDTH && targetY >= 0 && targetY < CANVAS_HEIGHT) {
          next[targetY * CANVAS_WIDTH + targetX] = floatingData.data[iy * floatingData.w + ix];
        }
      }
    }
    if (snapshotAtStart.current) {
        pushToUndo(snapshotAtStart.current);
        snapshotAtStart.current = null;
    }
    setPixels(next);
    setFloatingData(null);
    setSelection(null);
  }, [floatingData, pixels, pushToUndo, setPixels, setSelection]);

  useImperativeHandle(ref, () => ({ fitToScreen, commitFloating }));

  useEffect(() => { fitToScreen(); }, [fitToScreen]);

  // Main Canvas Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    ctx.fillStyle = '#0f172a'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    const showGrid = zoom >= 6;
    const gap = showGrid ? Math.max(0.5, zoom * 0.04) : 0;
    for (let y = 0; y < CANVAS_HEIGHT; y++) {
      for (let x = 0; x < CANVAS_WIDTH; x++) {
        const idx = y * CANVAS_WIDTH + x;
        const isOn = pixels[idx] === 1;
        ctx.fillStyle = isOn ? '#f8fafc' : '#1e293b';
        const px = x * zoom;
        const py = y * zoom;
        const drawSize = zoom - gap;
        if (drawSize > 0) ctx.fillRect(px, py, drawSize, drawSize);
      }
    }
  }, [pixels, zoom]);

  // Overlay Rendering (Selection and Previews)
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (floatingData) {
      ctx.fillStyle = 'rgba(248, 250, 252, 0.4)';
      for (let iy = 0; iy < floatingData.h; iy++) {
        for (let ix = 0; ix < floatingData.w; ix++) {
          if (floatingData.data[iy * floatingData.w + ix] === 1) {
            ctx.fillRect((floatingData.x + ix) * zoom, (floatingData.y + iy) * zoom, zoom, zoom);
          }
        }
      }
    }
    
    if (selection) {
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = dashOffset;
      ctx.strokeRect(selection.x * zoom, selection.y * zoom, selection.w * zoom, selection.h * zoom);
      ctx.fillStyle = 'rgba(99, 102, 241, 0.1)';
      ctx.fillRect(selection.x * zoom, selection.y * zoom, selection.w * zoom, selection.h * zoom);
    }
  }, [selection, zoom, floatingData, dashOffset]);

  // Dash animation loop
  useEffect(() => {
    let frame: number;
    const animate = () => {
      setDashOffset(prev => (prev - 0.2) % 8);
      frame = requestAnimationFrame(animate);
    };
    if (selection) {
      frame = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(frame);
  }, [selection]);

  const getPixelCoord = (clientX: number, clientY: number): Point | null => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / zoom);
    const y = Math.floor((clientY - rect.top) / zoom);
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const coord = getPixelCoord(e.clientX, e.clientY);
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
      isPanning.current = true;
      e.preventDefault();
      return;
    }

    if (e.button === 0) {
      if (selection && coord && 
          coord.x >= selection.x && coord.x < selection.x + selection.w &&
          coord.y >= selection.y && coord.y < selection.y + selection.h) {
        
        isMovingSelection.current = true;
        if (!floatingData) {
          snapshotAtStart.current = new Uint8Array(pixels);
          const w = selection.w, h = selection.h;
          const data = new Uint8Array(w * h);
          const next = new Uint8Array(pixels);
          for (let iy = 0; iy < h; iy++) {
            for (let ix = 0; ix < w; ix++) {
              const sx = selection.x + ix, sy = selection.y + iy;
              if (sx >= 0 && sx < CANVAS_WIDTH && sy >= 0 && sy < CANVAS_HEIGHT) {
                const idx = sy * CANVAS_WIDTH + sx;
                data[iy * w + ix] = pixels[idx];
                if (!e.altKey) next[idx] = 0;
              }
            }
          }
          if (!e.altKey) setPixels(next);
          setFloatingData({ ...selection, data });
        }
        return;
      }

      if (floatingData) commitFloating();

      if (tool === 'pencil' && !e.shiftKey) {
        isDrawing.current = true;
        snapshotAtStart.current = new Uint8Array(pixels);
        touchedInCurrentStroke.current.clear();
        if (coord && coord.x >= 0 && coord.x < CANVAS_WIDTH && coord.y >= 0 && coord.y < CANVAS_HEIGHT) {
          togglePixel(coord.x, coord.y);
        }
      } else {
        isSelecting.current = true;
        selectionStart.current = coord;
        setSelection(null); 
      }
    }
  };

  const togglePixel = (x: number, y: number) => {
    const idx = y * CANVAS_WIDTH + x;
    if (touchedInCurrentStroke.current.has(idx)) return;
    touchedInCurrentStroke.current.add(idx);
    setPixels(prev => {
      const next = new Uint8Array(prev);
      next[idx] = next[idx] === 1 ? 0 : 1;
      return next;
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    if (isPanning.current) {
      setPan({ x: pan.x + dx, y: pan.y + dy });
      return;
    }

    const coord = getPixelCoord(e.clientX, e.clientY);

    if (isMovingSelection.current && floatingData && selection) {
      const pxDx = Math.round(dx / zoom);
      const pxDy = Math.round(dy / zoom);
      if (pxDx !== 0 || pxDy !== 0) {
        const newX = floatingData.x + pxDx;
        const newY = floatingData.y + pxDy;
        setFloatingData({ ...floatingData, x: newX, y: newY });
        setSelection({ ...selection, x: newX, y: newY });
        lastMousePos.current.x -= (dx - pxDx * zoom);
        lastMousePos.current.y -= (dy - pxDy * zoom);
      }
      return;
    }

    if (isSelecting.current && selectionStart.current && coord) {
      const x = Math.min(selectionStart.current.x, coord.x);
      const y = Math.min(selectionStart.current.y, coord.y);
      const w = Math.max(1, Math.abs(selectionStart.current.x - coord.x) + 1);
      const h = Math.max(1, Math.abs(selectionStart.current.y - coord.y) + 1);
      setSelection({ x, y, w, h });
      return;
    }

    if (isDrawing.current && coord) {
      if (coord.x >= 0 && coord.x < CANVAS_WIDTH && coord.y >= 0 && coord.y < CANVAS_HEIGHT) {
        togglePixel(coord.x, coord.y);
      }
    }
  };

  const handleMouseUp = () => {
    if (isDrawing.current && touchedInCurrentStroke.current.size > 0 && snapshotAtStart.current) {
        pushToUndo(snapshotAtStart.current);
    }
    isDrawing.current = false;
    isPanning.current = false;
    isSelecting.current = false;
    isMovingSelection.current = false;
    snapshotAtStart.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = -e.deltaY > 0 ? 1.15 : 0.85;
    const newZoom = Math.max(0.1, Math.min(zoom * factor, 200));
    const mouseX = e.clientX, mouseY = e.clientY;
    setPan({
      x: mouseX - (mouseX - pan.x) * (newZoom / zoom),
      y: mouseY - (mouseY - pan.y) * (newZoom / zoom)
    });
    setZoom(newZoom);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Logic for commands that work WITHOUT selection (Paste)
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'v' && clipboard) {
          e.preventDefault();
          if (floatingData) commitFloating();
          snapshotAtStart.current = new Uint8Array(pixels);
          setFloatingData({ x: 0, y: 0, ...clipboard });
          setSelection({ x: 0, y: 0, w: clipboard.w, h: clipboard.h });
          return;
        }
      }

      if (!selection) return;

      const step = e.shiftKey ? 8 : 1;
      let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      if (e.key === 'ArrowRight') dx = step;
      if (e.key === 'ArrowUp') dy = -step;
      if (e.key === 'ArrowDown') dy = step;

      if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        if (!snapshotAtStart.current) snapshotAtStart.current = new Uint8Array(pixels);
        
        if (!floatingData) {
          const w = selection.w, h = selection.h;
          const data = new Uint8Array(w * h);
          const next = new Uint8Array(pixels);
          for (let iy = 0; iy < h; iy++) {
            for (let ix = 0; ix < w; ix++) {
              const sx = selection.x + ix, sy = selection.y + iy;
              if (sx >= 0 && sx < CANVAS_WIDTH && sy >= 0 && sy < CANVAS_HEIGHT) {
                const idx = sy * CANVAS_WIDTH + sx;
                data[iy * w + ix] = pixels[idx];
                next[idx] = 0;
              }
            }
          }
          setPixels(next);
          setFloatingData({ ...selection, x: selection.x + dx, y: selection.y + dy, data });
          setSelection({ ...selection, x: selection.x + dx, y: selection.y + dy });
        } else {
          setFloatingData({ ...floatingData, x: floatingData.x + dx, y: floatingData.y + dy });
          setSelection({ ...selection, x: selection.x + dx, y: selection.y + dy });
        }
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'c') {
          e.preventDefault();
          const data = new Uint8Array(selection.w * selection.h);
          for (let iy = 0; iy < selection.h; iy++) {
            for (let ix = 0; ix < selection.w; ix++) {
              const sx = selection.x + ix, sy = selection.y + iy;
              if (sx >= 0 && sx < CANVAS_WIDTH && sy >= 0 && sy < CANVAS_HEIGHT) {
                data[iy * selection.w + ix] = pixels[sy * CANVAS_WIDTH + sx];
              }
            }
          }
          setClipboard({ w: selection.w, h: selection.h, data });
        }
        if (e.key === 'x') {
          e.preventDefault();
          const data = new Uint8Array(selection.w * selection.h);
          const next = new Uint8Array(pixels);
          for (let iy = 0; iy < selection.h; iy++) {
            for (let ix = 0; ix < selection.w; ix++) {
              const sx = selection.x + ix, sy = selection.y + iy;
              if (sx >= 0 && sx < CANVAS_WIDTH && sy >= 0 && sy < CANVAS_HEIGHT) {
                const idx = sy * CANVAS_WIDTH + sx;
                data[iy * selection.w + ix] = pixels[idx];
                next[idx] = 0;
              }
            }
          }
          setClipboard({ w: selection.w, h: selection.h, data });
          applyAction(next);
          setSelection(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection, floatingData, pixels, clipboard, setClipboard, setPixels, applyAction, pushToUndo]);

  return (
    <div ref={containerRef} className="absolute inset-0 bg-transparent overflow-hidden touch-none" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={handleWheel}>
      <div className="absolute" style={{ transform: `translate(${pan.x}px, ${pan.y}px)`, width: CANVAS_WIDTH * zoom, height: CANVAS_HEIGHT * zoom }}>
        <canvas ref={canvasRef} width={CANVAS_WIDTH * zoom} height={CANVAS_HEIGHT * zoom} className="block pointer-events-none" />
        <canvas ref={overlayCanvasRef} width={CANVAS_WIDTH * zoom} height={CANVAS_HEIGHT * zoom} className="absolute inset-0 pointer-events-none" />
      </div>
    </div>
  );
});

EditorCanvas.displayName = 'EditorCanvas';
