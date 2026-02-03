import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PencilIcon, TextIcon, UndoIcon, TrimIcon } from '../constants';

interface VideoEditorProps {
    videoFile: File;
    onSend: (blob: Blob, mimeType: string) => void;
    onCancel: () => void;
    darkMode: boolean;
}

type Tool = 'trim' | 'draw' | 'text';
interface Point { x: number; y: number; }
interface Path { points: Point[]; color: string; size: number; }
interface TextItem { text: string; x: number; y: number; color: string; size: number; id: number; }

const COLORS = ['#ffffff', '#ef4444', '#facc15', '#22c55e', '#3b82f6', '#000000'];

const PlayIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-12 h-12"} fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
);
const PauseIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-12 h-12"} fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
);

const getSupportedMimeType = (): { mimeType: string; extension: string } => {
    if (MediaRecorder.isTypeSupported('video/mp4')) {
        return { mimeType: 'video/mp4', extension: '.mp4' };
    }
    if (MediaRecorder.isTypeSupported('video/webm')) {
        return { mimeType: 'video/webm', extension: '.webm' };
    }
    // Fallback, aunque es poco probable que se necesite en navegadores modernos
    return { mimeType: '', extension: '' };
};


const VideoEditor: React.FC<VideoEditorProps> = ({ videoFile, onSend, onCancel, darkMode }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const animationFrameRef = useRef<number>();
    
    const [tool, setTool] = useState<Tool>('trim');
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    // Editing states
    const [startTime, setStartTime] = useState(0);
    const [endTime, setEndTime] = useState(0);
    const [drawColor, setDrawColor] = useState('#ef4444');
    const [drawSize, setDrawSize] = useState(5);
    const [paths, setPaths] = useState<Path[]>([]);
    const [texts, setTexts] = useState<TextItem[]>([]);
    
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentPath, setCurrentPath] = useState<Path | null>(null);
    const [draggingText, setDraggingText] = useState<number | null>(null);
    const dragOffset = useRef<Point>({ x: 0, y: 0 });
    const [draggingTrimHandle, setDraggingTrimHandle] = useState<'start' | 'end' | null>(null);
    
    const [isProcessing, setIsProcessing] = useState(false);

    const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent): Point => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    };

    const drawFrame = useCallback(() => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        [...paths, currentPath].forEach(path => {
            if(!path) return;
            ctx.strokeStyle = path.color;
            ctx.lineWidth = path.size;
            ctx.beginPath();
            if(path.points.length > 0) ctx.moveTo(path.points[0].x, path.points[0].y);
            path.points.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.stroke();
        });

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

        animationFrameRef.current = requestAnimationFrame(drawFrame);
    }, [paths, texts, currentPath]);
    
    useEffect(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        const url = URL.createObjectURL(videoFile);
        video.src = url;

        const onLoadedData = () => {
            setDuration(video.duration);
            setEndTime(video.duration);
            const container = canvas.parentElement;
            if (container) {
                const { width: cW, height: cH } = container.getBoundingClientRect();
                const vAR = video.videoWidth / video.videoHeight;
                const cAR = cW / cH;
                let finalW, finalH;
                if(vAR > cAR) {
                    finalW = cW;
                    finalH = cW / vAR;
                } else {
                    finalH = cH;
                    finalW = cH * vAR;
                }
                canvas.width = finalW;
                canvas.height = finalH;
            }
            video.currentTime = 0;
            startDrawingLoop();
        };

        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onTimeUpdate = () => {
            if (video.currentTime >= endTime) {
                video.pause();
                video.currentTime = startTime;
            }
            setCurrentTime(video.currentTime);
        };

        video.addEventListener('loadedmetadata', onLoadedData);
        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('timeupdate', onTimeUpdate);
        return () => {
            URL.revokeObjectURL(url);
            video.removeEventListener('loadedmetadata', onLoadedData);
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('timeupdate', onTimeUpdate);
            stopDrawingLoop();
        };
    }, [videoFile, startTime, endTime]);

    useEffect(() => {
        const video = videoRef.current;
        if (!draggingTrimHandle || !video) return;

        const handleMove = (e: MouseEvent | TouchEvent) => {
            const rect = timelineRef.current!.getBoundingClientRect();
            const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
            const pos = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
            const newTime = pos * duration;
            if (draggingTrimHandle === 'start') {
                const newStartTime = Math.min(newTime, endTime - 0.1);
                setStartTime(newStartTime);
                video.currentTime = newStartTime;
            } else {
                const newEndTime = Math.max(newTime, startTime + 0.1);
                setEndTime(newEndTime);
                video.currentTime = newEndTime;
            }
        };
        const handleUp = () => setDraggingTrimHandle(null);

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('touchmove', handleMove);
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('touchend', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('touchend', handleUp);
        };
    }, [draggingTrimHandle, duration, startTime, endTime]);

    const startDrawingLoop = () => {
        stopDrawingLoop();
        animationFrameRef.current = requestAnimationFrame(drawFrame);
    };

    const stopDrawingLoop = () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };

    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;
        if (isPlaying) video.pause();
        else {
            if (video.currentTime < startTime) video.currentTime = startTime;
            video.play();
        }
    };

    const handleInteractionStart = (e: React.MouseEvent | React.TouchEvent) => {
        const point = getCanvasPoint(e);
        if (tool === 'draw') {
            setIsDrawing(true);
            setCurrentPath({ points: [point], color: drawColor, size: drawSize });
        } else if (tool === 'text') {
            const clickedText = texts.find(t => Math.abs(t.x - point.x) < t.size && Math.abs(t.y - point.y) < t.size);
            if (clickedText) {
                setDraggingText(clickedText.id);
                dragOffset.current = { x: clickedText.x - point.x, y: clickedText.y - point.y };
            }
        }
    };

    const handleInteractionMove = (e: React.MouseEvent | React.TouchEvent) => {
        const point = getCanvasPoint(e);
        if (tool === 'draw' && isDrawing) {
            setCurrentPath(prev => prev ? { ...prev, points: [...prev.points, point] } : null);
        } else if (tool === 'text' && draggingText !== null) {
            setTexts(prev => prev.map(t => 
                t.id === draggingText ? { ...t, x: point.x + dragOffset.current.x, y: point.y + dragOffset.current.y } : t
            ));
        }
    };

    const handleInteractionEnd = () => {
        if (tool === 'draw' && isDrawing) {
            if (currentPath) setPaths(prev => [...prev, currentPath]);
            setCurrentPath(null);
            setIsDrawing(false);
        } else if (tool === 'text') {
            setDraggingText(null);
        }
    };

    const handleAddText = () => {
        const text = prompt("Escribe tu texto:");
        if (text && canvasRef.current) {
            setTexts(prev => [...prev, { text, x: canvasRef.current!.width / 2, y: canvasRef.current!.height / 2, color: '#ffffff', size: 32, id: Date.now() }]);
        }
    };
    
    const handleSend = async () => {
        const video = videoRef.current;
        if (!video) return;
        setIsProcessing(true);
        stopDrawingLoop();
        try {
            const { mimeType } = getSupportedMimeType();
            if (!mimeType) {
                throw new Error("No supported video format found for recording.");
            }

            const options = {
                mimeType,
                videoBitsPerSecond: 1000000, // 1 Mbps for compression
            };

            const canvasStream = (canvasRef.current as any).captureStream(30);
            const audioContext = new AudioContext();
            const sourceNode = audioContext.createMediaElementSource(video);
            const destinationNode = audioContext.createMediaStreamDestination();
            sourceNode.connect(destinationNode);
            const [audioTrack] = destinationNode.stream.getAudioTracks();
            if (audioTrack) canvasStream.addTrack(audioTrack);

            const recorder = new MediaRecorder(canvasStream, options);
            const chunks: Blob[] = [];
            recorder.ondataavailable = e => chunks.push(e.data);
            recorder.onstop = () => {
                const finalBlob = new Blob(chunks, { type: mimeType });
                onSend(finalBlob, mimeType);
                audioContext.close();
                setIsProcessing(false);
            };

            recorder.start();
            video.currentTime = startTime;
            video.muted = true;
            video.play();
            const checkTime = setInterval(() => {
                if (video.currentTime >= endTime) {
                    video.pause();
                    recorder.stop();
                    clearInterval(checkTime);
                }
            }, 1000 / 30);
        } catch (error) {
            console.error("Video processing failed:", error);
            alert("Hubo un error al procesar el video.");
            setIsProcessing(false);
            startDrawingLoop();
        }
    };

    const startPercent = (startTime / duration) * 100 || 0;
    const endPercent = (endTime / duration) * 100 || 100;

    return (
        <div className="fixed inset-0 z-[400] bg-black flex flex-col animate-in fade-in duration-200">
            {isProcessing && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <p className="mt-4 text-sm font-bold text-white">Procesando video...</p>
                </div>
            )}
            <video ref={videoRef} className="hidden" playsInline crossOrigin="anonymous" />
            <div className="flex-1 flex items-center justify-center w-full h-full p-4 relative" onClick={togglePlay}>
                <canvas 
                    ref={canvasRef} 
                    className="max-w-full max-h-full object-contain"
                    onMouseDown={handleInteractionStart} onMouseMove={handleInteractionMove} onMouseUp={handleInteractionEnd} onMouseLeave={handleInteractionEnd}
                    onTouchStart={handleInteractionStart} onTouchMove={handleInteractionMove} onTouchEnd={handleInteractionEnd}
                />
                {!isPlaying && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center text-white">
                            <PlayIcon />
                        </div>
                    </div>
                )}
            </div>
            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 p-4 pt-12 flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent">
                <button onClick={onCancel} className="bg-black/50 text-white w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg></button>
                <div className="flex gap-2">
                    <button onClick={() => setPaths(p => p.slice(0, -1))} disabled={paths.length === 0} className="bg-black/50 text-white w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30"><UndoIcon className="w-5 h-5" /></button>
                </div>
            </div>
            {/* Bottom Bar */}
            <div className="w-full p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-black/70 to-transparent">
                {tool === 'trim' && (
                    <div ref={timelineRef} className="relative h-12 flex items-center mb-4 cursor-pointer">
                        <div className="w-full h-1 bg-white/20 rounded-full">
                           <div className="absolute top-1/2 -translate-y-1/2 h-1 bg-misionero-amarillo" style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}></div>
                           <div className="absolute top-1/2 -translate-y-1/2 h-4 w-1 bg-white" style={{ left: `${(currentTime/duration)*100 || 0}%`}}></div>
                        </div>
                        <div onMouseDown={() => setDraggingTrimHandle('start')} onTouchStart={() => setDraggingTrimHandle('start')} className="absolute top-1/2 -translate-y-1/2 w-4 h-6 bg-white rounded-md shadow-lg cursor-pointer" style={{ left: `calc(${startPercent}% - 8px)` }}></div>
                        <div onMouseDown={() => setDraggingTrimHandle('end')} onTouchStart={() => setDraggingTrimHandle('end')} className="absolute top-1/2 -translate-y-1/2 w-4 h-6 bg-white rounded-md shadow-lg cursor-pointer" style={{ left: `calc(${endPercent}% - 8px)` }}></div>
                    </div>
                )}
                 {tool === 'draw' && (
                    <div className="bg-black/50 p-2 rounded-2xl mb-4 space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="flex justify-around">{COLORS.map(c => <button key={c} onClick={() => setDrawColor(c)} className={`w-8 h-8 rounded-full transition-transform ${drawColor === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-transparent' : 'scale-90'}`} style={{ backgroundColor: c }} />)}</div>
                        <div className="flex items-center gap-2 px-2"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: drawColor }}></div><input type="range" min="2" max="20" value={drawSize} onChange={e => setDrawSize(Number(e.target.value))} className="w-full h-1 bg-white/30 rounded-full appearance-none accent-misionero-azul" /><div className="w-5 h-5 rounded-full" style={{ backgroundColor: drawColor }}></div></div>
                    </div>
                )}
                {tool === 'text' && (
                    <div className="bg-black/50 p-2 rounded-2xl mb-4 flex justify-around animate-in fade-in slide-in-from-bottom-4 duration-300">
                        {COLORS.map(c => <button key={c} onClick={() => {}} className={`w-8 h-8 rounded-full transition-transform scale-90`} style={{ backgroundColor: c }} />)}
                    </div>
                )}
                <div className="flex items-center justify-between">
                    <div className="flex gap-1 p-1 bg-black/50 rounded-full">
                        <button onClick={() => setTool('trim')} className={`p-3 rounded-full transition-colors ${tool === 'trim' ? 'bg-white text-black' : 'bg-transparent text-white'}`}><TrimIcon /></button>
                        <button onClick={() => setTool('draw')} className={`p-3 rounded-full transition-colors ${tool === 'draw' ? 'bg-white text-black' : 'bg-transparent text-white'}`}><PencilIcon className="w-5 h-5" /></button>
                        <button onClick={() => setTool('text')} className={`p-3 rounded-full transition-colors ${tool === 'text' ? 'bg-white text-black' : 'bg-transparent text-white'}`}><TextIcon className="w-5 h-5" /></button>
                    </div>
                    {tool === 'text' && <button onClick={handleAddText} className="bg-white/90 text-black font-black text-[10px] uppercase px-4 py-3 rounded-full shadow-lg">Añadir Texto</button>}
                    <button onClick={handleSend} className="bg-misionero-verde text-white font-black px-6 py-4 rounded-full shadow-lg text-sm uppercase">Enviar</button>
                </div>
            </div>
        </div>
    );
};

export default VideoEditor;