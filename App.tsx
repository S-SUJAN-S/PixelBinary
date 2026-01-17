
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { EditorCanvas } from './components/EditorCanvas';
import { CANVAS_WIDTH, CANVAS_HEIGHT, ClipboardData, Rect } from './types';

const App: React.FC = () => {
  const [pixels, setPixels] = useState<Uint8Array>(new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<'pencil' | 'selection'>('pencil');
  const [selection, setSelection] = useState<Rect | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);
  
  const undoStack = useRef<Uint8Array[]>([]);
  const redoStack = useRef<Uint8Array[]>([]);
  const editorRef = useRef<{ fitToScreen: () => void; commitFloating: () => void } | null>(null);

  const pushToUndo = useCallback((stateBeforeAction: Uint8Array) => {
    undoStack.current.push(new Uint8Array(stateBeforeAction));
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = []; 
  }, []);

  const applyAction = useCallback((newState: Uint8Array) => {
    pushToUndo(pixels);
    setPixels(newState);
  }, [pixels, pushToUndo]);

  const undo = useCallback(() => {
    if (selection) {
      setSelection(null);
      return;
    }
    if (undoStack.current.length === 0) return;
    const prevState = undoStack.current.pop()!;
    redoStack.current.push(new Uint8Array(pixels));
    setPixels(prevState);
  }, [pixels, selection]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const nextState = redoStack.current.pop()!;
    undoStack.current.push(new Uint8Array(pixels));
    setPixels(nextState);
    setSelection(null); // Clear selection on redo to avoid data/selection mismatch
  }, [pixels]);

  const clearCanvas = useCallback(() => {
    setSelection(null);
    setPixels(prev => {
      const stateToSave = new Uint8Array(prev);
      // Only push to undo if the canvas isn't already empty
      const isEmpty = stateToSave.every(p => p === 0);
      if (!isEmpty) {
        undoStack.current.push(stateToSave);
        if (undoStack.current.length > 100) undoStack.current.shift();
        redoStack.current = [];
      }
      return new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
    });
  }, []);

  const handleFitToScreen = () => {
    editorRef.current?.fitToScreen();
  };

  const exportPNG = useCallback(() => {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);
    for (let i = 0; i < pixels.length; i++) {
      const val = pixels[i] === 1 ? 255 : 0;
      const idx = i * 4;
      imageData.data[idx] = val;
      imageData.data[idx + 1] = val;
      imageData.data[idx + 2] = val;
      imageData.data[idx + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    const link = document.createElement('a');
    link.download = `pixel-binary-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  }, [pixels]);

  const exportCSV = useCallback(() => {
    let rows = [];
    for (let y = 0; y < CANVAS_HEIGHT; y++) {
      let row = [];
      for (let x = 0; x < CANVAS_WIDTH; x++) {
        row.push(pixels[y * CANVAS_WIDTH + x]);
      }
      rows.push(row.join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const link = document.createElement('a');
    link.download = `pixel-binary-${Date.now()}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
  }, [pixels]);

  const importCSV = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.trim().split('\n');
      const newPixels = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
      lines.forEach((line, y) => {
        if (y >= CANVAS_HEIGHT) return;
        const values = line.split(',');
        values.forEach((val, x) => {
          if (x >= CANVAS_WIDTH) return;
          newPixels[y * CANVAS_WIDTH + x] = parseInt(val) === 1 ? 1 : 0;
        });
      });
      applyAction(newPixels);
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [applyAction]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrl = isMac ? e.metaKey : e.ctrlKey;

      if (ctrl) {
        if (e.key === 'z') { e.preventDefault(); undo(); }
        if (e.key === 'y') { e.preventDefault(); redo(); }
      }
      
      if (e.key === 's') setTool('selection');
      if (e.key === 'p') setTool('pencil');
      if (e.key === 'Escape') setSelection(null);
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection) {
          const next = new Uint8Array(pixels);
          for (let y = selection.y; y < selection.y + selection.h; y++) {
            for (let x = selection.x; x < selection.x + selection.w; x++) {
              if (x >= 0 && x < CANVAS_WIDTH && y >= 0 && y < CANVAS_HEIGHT) {
                next[y * CANVAS_WIDTH + x] = 0;
              }
            }
          }
          applyAction(next);
          setSelection(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, pixels, selection, applyAction]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0a0f1d] select-none text-slate-200 font-sans">
      <header className="z-20 flex items-center justify-between px-6 py-3 bg-[#111827] border-b border-slate-800 shadow-xl">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3 group cursor-pointer" onClick={handleFitToScreen}>
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-indigo-500/30 shadow-lg transform group-hover:scale-110 transition-transform">
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="currentColor"><path d="M3 3h6v6H3V3zm12 0h6v6h-6V3zM3 15h6v6H3v-6zm12 0h6v6h-6v-6z" /></svg>
            </div>
            <h1 className="text-xl font-black tracking-tight uppercase bg-clip-text text-transparent bg-gradient-to-r from-white to-indigo-300">Pixel<span className="text-indigo-400">Binary</span></h1>
          </div>
          
          <div className="flex items-center bg-slate-800/50 p-1 rounded-xl border border-slate-700/50 backdrop-blur-sm">
            <button onClick={() => setTool('pencil')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${tool === 'pencil' ? 'bg-indigo-600 text-white shadow-lg ring-1 ring-indigo-400/50' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}>PENCIL (P)</button>
            <button onClick={() => setTool('selection')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${tool === 'selection' ? 'bg-indigo-600 text-white shadow-lg ring-1 ring-indigo-400/50' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}>SELECT (S)</button>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1 mr-2 border-r border-slate-800 pr-3">
            <button onClick={undo} className="p-2.5 hover:bg-slate-800 rounded-lg text-slate-400 disabled:opacity-20 transition-all hover:text-indigo-400" title="Undo (Ctrl+Z)" disabled={undoStack.current.length === 0}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
            </button>
            <button onClick={redo} className="p-2.5 hover:bg-slate-800 rounded-lg text-slate-400 disabled:opacity-20 transition-all hover:text-indigo-400" title="Redo (Ctrl+Y)" disabled={redoStack.current.length === 0}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" /></svg>
            </button>
          </div>

          <div className="relative group">
            <button className="px-5 py-2 text-sm font-bold bg-slate-800 hover:bg-slate-700 rounded-xl transition-all border border-slate-700 flex items-center gap-2 shadow-inner">
              Export/Import
              <svg className="w-4 h-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div className="absolute right-0 top-full pt-2 hidden group-hover:block z-30">
              <div className="w-52 bg-[#1f2937] border border-slate-700 rounded-xl shadow-2xl p-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                <button onClick={exportPNG} className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-indigo-600 rounded-lg transition-colors flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  Export PNG
                </button>
                <button onClick={exportCSV} className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-indigo-600 rounded-lg transition-colors flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Export CSV
                </button>
                <div className="h-px bg-slate-700 my-1 mx-2"></div>
                <label className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-indigo-600 rounded-lg transition-colors cursor-pointer flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  Import CSV
                  <input type="file" accept=".csv" className="hidden" onChange={importCSV} />
                </label>
              </div>
            </div>
          </div>

          <button onClick={handleFitToScreen} className="px-5 py-2 text-sm font-bold bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-all hover:border-slate-500 active:scale-95 shadow-inner">Fit</button>
          <button onClick={clearCanvas} className="px-5 py-2 text-sm font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition-all shadow-lg shadow-rose-900/30 active:scale-95 border border-rose-400/20">Clear All</button>
        </div>
      </header>

      <main className="flex-1 relative bg-[#0a0f1d] overflow-hidden cursor-crosshair">
        <EditorCanvas 
          ref={editorRef}
          pixels={pixels} 
          setPixels={setPixels}
          zoom={zoom}
          setZoom={setZoom}
          pan={pan}
          setPan={setPan}
          tool={tool}
          setTool={setTool}
          selection={selection}
          setSelection={setSelection}
          pushToUndo={pushToUndo}
          applyAction={applyAction}
          clipboard={clipboard}
          setClipboard={setClipboard}
        />
      </main>

      <footer className="z-20 bg-[#111827] border-t border-slate-800 px-6 py-2 flex items-center justify-between text-[11px] text-slate-500 font-mono uppercase tracking-widest">
        <div className="flex space-x-10 items-center">
          <div className="flex items-center gap-2">
            <span className="text-slate-600 font-bold tracking-tight">Zoom</span>
            <span className="text-indigo-400 font-bold">{(zoom * 100).toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-600 font-bold tracking-tight">History</span>
            <span className="text-slate-300 font-bold">{undoStack.current.length}</span>
          </div>
          {selection && (
            <div className="flex items-center gap-2 text-indigo-400 animate-pulse font-bold">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M5 4a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2H5zm0 2h10v6H5V6z" /></svg>
              {selection.w}x{selection.h} Active
            </div>
          )}
        </div>
        <div className="hidden lg:flex items-center space-x-6 opacity-40">
          <span className="flex items-center gap-1.5 hover:opacity-100 transition-opacity"><kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300 shadow-sm">Ctrl+Z</kbd> Undo</span>
          <span className="flex items-center gap-1.5 hover:opacity-100 transition-opacity"><kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300 shadow-sm">S</kbd> Selection</span>
          <span className="flex items-center gap-1.5 hover:opacity-100 transition-opacity"><kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300 shadow-sm">P</kbd> Pencil</span>
          <span className="flex items-center gap-1.5 hover:opacity-100 transition-opacity"><kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300 shadow-sm">Del</kbd> Clear</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
