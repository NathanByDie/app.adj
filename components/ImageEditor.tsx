import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PencilIcon, TextIcon, UndoIcon, CropIcon } from '../constants';

interface ImageEditorProps {
    imageFile: File;
    onSend: (blob: Blob) => void;
    onCancel: () => void;
    darkMode: boolean;
}

type Tool = 'pan' | 'draw' | 'text' | 'crop';
interface Point { x: number; y: number; }
interface Path { points: Point[]; color: string; size: number; }
interface TextItem { text: string; x: number; y: number; color: string; size: number; id: number; }
type CropRect = { x: number; y: number; width: number; height: number; };
type DragHandle = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'move';

const COLORS = ['#ffffff', '#ef4444', '#facc15', '#22c55e', '#3b82f6', '#000000'];
const HANDLE_SIZE = 24; // Pixel size for grab handles on canvas

const ImageEditor: React.FC<ImageEditorProps> = ({ imageFile, onSend, onCancel, darkMode }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    
    const [tool, setTool] = useState<Tool>('draw');
    const [drawColor, setDrawColor] = useState('#ef4444');
    const [drawSize, setDrawSize] = useState(5);
    const [textColor, setTextColor] = useState('#ffffff');
    const [textSize, setTextSize] = useState(32);
    
    const [paths, setPaths] = useState<Path[]>([]);
    const [texts, setTexts] = useState<TextItem[]>([]);
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentPath, setCurrentPath] = useState<Path | null>(null);

    const [draggingText, setDraggingText] = useState<number | null>(null);
    const dragOffset = useRef<Point>({ x: 0, y: 0 });

    const [cropRect, setCropRect] = useState<CropRect | null>(null);
    const [draggingHandle, setDraggingHandle] = useState<DragHandle | null>(null);

    const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent): Point => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        // SCALING FIX: Adjust coordinates based on the ratio between the element's
        // display size (rect) and its internal resolution (canvas.width/height).
        // This solves the drawing offset issue.
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return { 
            x: (clientX - rect.left) * scaleX, 
            y: (clientY - rect.top) * scaleY 
        };
    };

    const redrawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const img = imageRef.current;
        if (!canvas || !ctx || !img) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        paths.forEach(path => {
            ctx.strokeStyle = path.color;
            ctx.lineWidth = path.size;
            ctx.beginPath();
            if (path.points.length > 0) {
                ctx.moveTo(path.points[0].x, path.points[0].y);
                path.points.forEach(point => ctx.lineTo(point.x, point.y));
            }
            ctx.stroke();
        });

        if (currentPath) {
            ctx.strokeStyle = currentPath.color;
            ctx.lineWidth = currentPath.size;
            ctx.beginPath();
            if (currentPath.points.length > 0) {
                ctx.moveTo(currentPath.points[0].x, currentPath.points[0].y);
                currentPath.points.forEach(point => ctx.lineTo(point.x, point.y));
            }
            ctx.stroke();
        }

        texts.forEach(text => {
            ctx.fillStyle = text.color;
            ctx.font = `bold ${text.size}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 5;
            ctx.fillText(text.text, text.x, text.y);
            ctx.shadowColor = 'transparent';
        });

        if (tool === 'crop' && cropRect) {
            // Overlay
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            // Clear inside crop rect
            ctx.clearRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
            // Draw handles
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.lineWidth = 1;
            const handles = {
                topLeft: { x: cropRect.x, y: cropRect.y },
                topRight: { x: cropRect.x + cropRect.width, y: cropRect.y },
                bottomLeft: { x: cropRect.x, y: cropRect.y + cropRect.height },
                bottomRight: { x: cropRect.x + cropRect.width, y: cropRect.y + cropRect.height },
            };
            Object.values(handles).forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, HANDLE_SIZE / 2, 0, 2 * Math.PI);
                ctx.fill();
                ctx.stroke();
            });
        }
    }, [paths, texts, currentPath, tool, cropRect]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const img = new Image();
        imageRef.current = img;
        const url = URL.createObjectURL(imageFile);
        img.src = url;

        img.onload = () => {
            const container = canvas.parentElement;
            if (container) {
                const { width: containerWidth, height: containerHeight } = container.getBoundingClientRect();
                const imgAspectRatio = img.width / img.height;
                const containerAspectRatio = containerWidth / containerHeight;

                let canvasWidth, canvasHeight;
                if (imgAspectRatio > containerAspectRatio) {
                    canvasWidth = containerWidth;
                    canvasHeight = containerWidth / imgAspectRatio;
                } else {
                    canvasHeight = containerHeight;
                    canvasWidth = containerHeight * imgAspectRatio;
                }
                
                canvas.width = canvasWidth;
                canvas.height = canvasHeight;
                canvas.style.width = `${canvasWidth}px`;
                canvas.style.height = `${canvasHeight}px`;

                redrawCanvas();
            }
        };

        return () => URL.revokeObjectURL(url);
    }, [imageFile, redrawCanvas]);

    useEffect(() => {
        redrawCanvas();
    }, [redrawCanvas]);

    const getHandleAtPoint = (point: Point): DragHandle | null => {
        if (!cropRect) return null;
        const { x, y, width, height } = cropRect;
        const handles = {
            topLeft: { x: x, y: y },
            topRight: { x: x + width, y: y },
            bottomLeft: { x: x, y: y + height },
            bottomRight: { x: x + width, y: y + height },
        };
        for (const [name, pos] of Object.entries(handles)) {
            if (Math.sqrt((point.x - pos.x) ** 2 + (point.y - pos.y) ** 2) < HANDLE_SIZE) {
                return name as DragHandle;
            }
        }
        if (point.x > x && point.x < x + width && point.y > y && point.y < y + height) {
            return 'move';
        }
        return null;
    };

    const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        const point = getCanvasPoint(e);
        
        switch (tool) {
            case 'draw':
                setIsDrawing(true);
                setCurrentPath({ points: [point], color: drawColor, size: drawSize });
                break;
            case 'text':
                const clickedText = texts.find(t => Math.abs(t.x - point.x) < t.size * t.text.length * 0.4 && Math.abs(t.y - point.y) < t.size);
                if (clickedText) {
                    setDraggingText(clickedText.id);
                    dragOffset.current = { x: clickedText.x - point.x, y: clickedText.y - point.y };
                }
                break;
            case 'crop':
                const handle = getHandleAtPoint(point);
                if (handle) {
                    setDraggingHandle(handle);
                    dragOffset.current = { x: cropRect!.x - point.x, y: cropRect!.y - point.y };
                }
                break;
        }
    };

    const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        const point = getCanvasPoint(e);

        switch (tool) {
            case 'draw':
                if (isDrawing) {
                    setCurrentPath(prev => prev ? { ...prev, points: [...prev.points, point] } : null);
                }
                break;
            case 'text':
                if (draggingText !== null) {
                    setTexts(prev => prev.map(t => 
                        t.id === draggingText ? { ...t, x: point.x + dragOffset.current.x, y: point.y + dragOffset.current.y } : t
                    ));
                }
                break;
            case 'crop':
                if (draggingHandle && cropRect) {
                    let { x, y, width, height } = cropRect;
                    switch (draggingHandle) {
                        case 'move':
                            x = point.x + dragOffset.current.x;
                            y = point.y + dragOffset.current.y;
                            break;
                        case 'topLeft':
                            width += x - point.x;
                            height += y - point.y;
                            x = point.x;
                            y = point.y;
                            break;
                        case 'topRight':
                            width = point.x - x;
                            height += y - point.y;
                            y = point.y;
                            break;
                        case 'bottomLeft':
                            width += x - point.x;
                            height = point.y - y;
                            x = point.x;
                            break;
                        case 'bottomRight':
                            width = point.x - x;
                            height = point.y - y;
                            break;
                    }
                    if (width < HANDLE_SIZE * 2) width = HANDLE_SIZE * 2;
                    if (height < HANDLE_SIZE * 2) height = HANDLE_SIZE * 2;
                    setCropRect({ x, y, width, height });
                }
                break;
        }
    };

    const handleEnd = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        switch (tool) {
            case 'draw':
                if (isDrawing) {
                    if (currentPath) setPaths(prev => [...prev, currentPath]);
                    setCurrentPath(null);
                    setIsDrawing(false);
                }
                break;
            case 'text':
                setDraggingText(null);
                break;
            case 'crop':
                setDraggingHandle(null);
                break;
        }
    };

    const startCropping = () => {
        setTool('crop');
        const canvas = canvasRef.current;
        if (canvas) {
            setCropRect({
                x: canvas.width * 0.1,
                y: canvas.height * 0.1,
                width: canvas.width * 0.8,
                height: canvas.height * 0.8,
            });
        }
    };

    const applyCrop = () => {
        const canvas = canvasRef.current;
        if (!canvas || !cropRect) return;

        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = cropRect.width;
        offscreenCanvas.height = cropRect.height;
        const offscreenCtx = offscreenCanvas.getContext('2d');
        if (!offscreenCtx) return;
        
        offscreenCtx.drawImage(canvas, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 0, 0, cropRect.width, cropRect.height);

        const newImg = new Image();
        newImg.src = offscreenCanvas.toDataURL();
        newImg.onload = () => {
            imageRef.current = newImg;
            
            const newPaths = paths.map(p => ({ ...p, points: p.points.map(pt => ({ x: pt.x - cropRect.x, y: pt.y - cropRect.y })) }));
            const newTexts = texts.map(t => ({ ...t, x: t.x - cropRect.x, y: t.y - cropRect.y }));
            setPaths(newPaths);
            setTexts(newTexts);

            canvas.width = newImg.width;
            canvas.height = newImg.height;
            canvas.style.width = `${newImg.width}px`;
            canvas.style.height = `${newImg.height}px`;

            setTool('draw');
            setCropRect(null);
        };
    };

    const handleAddText = () => {
        const text = prompt("Escribe tu texto:");
        if (text && canvasRef.current) {
            setTexts(prev => [...prev, { text, x: canvasRef.current!.width / 2, y: canvasRef.current!.height / 2, color: textColor, size: textSize, id: Date.now() }]);
        }
    };

    const handleUndo = () => setPaths(prev => prev.slice(0, -1));

    const handleSend = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.toBlob(blob => { if (blob) onSend(blob); }, 'image/jpeg', 0.9);
    };

    return (
        <div className="fixed inset-0 z-[400] bg-black flex flex-col justify-center items-center animate-in fade-in duration-200">
            <canvas ref={canvasRef}
                onMouseDown={handleStart} onMouseMove={handleMove} onMouseUp={handleEnd} onMouseLeave={handleEnd}
                onTouchStart={handleStart} onTouchMove={handleMove} onTouchEnd={handleEnd}
            />
            <div className="absolute top-0 left-0 right-0 p-4 pt-12 flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent">
                <button onClick={onCancel} className="bg-black/50 text-white w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
                {tool !== 'crop' && (
                    <div className="flex gap-2">
                        <button onClick={handleUndo} disabled={paths.length === 0} className="bg-black/50 text-white w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30"><UndoIcon className="w-5 h-5" /></button>
                    </div>
                )}
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-black/50 to-transparent">
                {tool === 'draw' && (
                    <div className="bg-black/50 p-2 rounded-2xl mb-4 space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="flex justify-around">{COLORS.map(c => <button key={c} onClick={() => setDrawColor(c)} className={`w-8 h-8 rounded-full transition-transform ${drawColor === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-transparent' : 'scale-90'}`} style={{ backgroundColor: c }} />)}</div>
                        <div className="flex items-center gap-2 px-2"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: drawColor }}></div><input type="range" min="2" max="20" value={drawSize} onChange={e => setDrawSize(Number(e.target.value))} className="w-full h-1 bg-white/30 rounded-full appearance-none accent-misionero-azul" /><div className="w-5 h-5 rounded-full" style={{ backgroundColor: drawColor }}></div></div>
                    </div>
                )}
                 {tool === 'text' && (
                    <div className="bg-black/50 p-2 rounded-2xl mb-4 space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="flex justify-around">{COLORS.map(c => <button key={c} onClick={() => setTextColor(c)} className={`w-8 h-8 rounded-full transition-transform ${textColor === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-transparent' : 'scale-90'}`} style={{ backgroundColor: c }} />)}</div>
                    </div>
                )}
                {tool === 'crop' ? (
                     <div className="flex items-center justify-between">
                        <button onClick={() => { setTool('draw'); setCropRect(null); }} className="bg-white/20 text-white font-black text-sm uppercase px-6 py-4 rounded-full">Cancelar</button>
                        <button onClick={applyCrop} className="bg-misionero-verde text-white font-black text-sm uppercase px-6 py-4 rounded-full">Aplicar</button>
                    </div>
                ) : (
                    <div className="flex items-center justify-between">
                        <div className="flex gap-1 p-1 bg-black/50 rounded-full">
                            <button onClick={() => setTool('draw')} className={`p-3 rounded-full transition-colors ${tool === 'draw' ? 'bg-white text-black' : 'bg-transparent text-white'}`}><PencilIcon className="w-5 h-5" /></button>
                            <button onClick={() => setTool('text')} className={`p-3 rounded-full transition-colors ${tool === 'text' ? 'bg-white text-black' : 'bg-transparent text-white'}`}><TextIcon className="w-5 h-5" /></button>
                            <button onClick={startCropping} className={`p-3 rounded-full transition-colors ${tool === 'crop' ? 'bg-white text-black' : 'bg-transparent text-white'}`}><CropIcon className="w-5 h-5" /></button>
                        </div>
                         {tool === 'text' && <button onClick={handleAddText} className="bg-white/90 text-black font-black text-[10px] uppercase px-4 py-3 rounded-full shadow-lg">Añadir Texto</button>}
                        <button onClick={handleSend} className="bg-misionero-verde text-white font-black px-6 py-4 rounded-full shadow-lg text-sm uppercase">Enviar</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ImageEditor;