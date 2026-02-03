import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PencilIcon, TextIcon, UndoIcon, TrimIcon } from '../constants';

interface VideoEditorProps {
    videoFile: File;
    onSend: (blob: Blob) => void;
    onCancel: () => void;
    darkMode: boolean;
}

type Tool = 'trim' | 'draw' | 'text';
interface Point { x: number; y: number; }
interface Path { points: Point[]; color: string; size: number; }
interface TextItem { text: string; x: number; y: number; color: string; size: number; id: number; }

const COLORS = ['#ffffff', '#ef4444', '#facc15', '#22c55e', '#3b82f6', '#000000'];

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
    
    const [isProcessing, setIsProcessing] = useState(false);

    // Main drawing loop
    const drawFrame = useCallback(() => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Draw overlays (paths and text)
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        paths.forEach(path => {
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
    }, [paths, texts]);
    
    // Setup video and canvas
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

            video.currentTime = 0; // Ensure it starts at the beginning
            startDrawingLoop();
        };

        video.addEventListener('loadedmetadata', onLoadedData);
        return () => {
            URL.revokeObjectURL(url);
            video.removeEventListener('loadedmetadata', onLoadedData);
            stopDrawingLoop();
        };
    }, [videoFile]);

    // Playback loop and time update
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onTimeUpdate = () => {
            if (video.currentTime >= endTime) {
                video.pause();
                setIsPlaying(false);
                video.currentTime = startTime;
            }
            setCurrentTime(video.currentTime);
        };
        video.addEventListener('timeupdate', onTimeUpdate);
        return () => video.removeEventListener('timeupdate', onTimeUpdate);
    }, [startTime, endTime]);

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
        if (isPlaying) {
            video.pause();
        } else {
            if (video.currentTime < startTime) video.currentTime = startTime;
            video.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleTimelineScrub = (e: React.MouseEvent | React.TouchEvent) => {
        const video = videoRef.current;
        if (!timelineRef.current || !video) return;
        const rect = timelineRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const pos = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        const newTime = pos * duration;
        video.currentTime = newTime;
    };
    
    // -- Canvas drawing logic --
    const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent): Point => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const handleDrawStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (tool !== 'draw') return;
        setIsDrawing(true);
        const point = getCanvasPoint(e);
        setPaths(prev => [...prev, { points: [point], color: drawColor, size: drawSize }]);
    };

    const handleDrawMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (tool !== 'draw' || !isDrawing) return;
        const point = getCanvasPoint(e);
        setPaths(prev => {
            const newPaths = [...prev];
            const lastPath = newPaths[newPaths.length - 1];
            if (lastPath) lastPath.points.push(point);
            return newPaths;
        });
    };

    const handleDrawEnd = () => setIsDrawing(false);

    // -- Text logic --
    const handleAddText = () => {
        const text = prompt("Escribe tu texto:");
        if (text && canvasRef.current) {
            setTexts(prev => [...prev, { text, x: canvasRef.current!.width / 2, y: canvasRef.current!.height / 2, color: '#ffffff', size: 32, id: Date.now() }]);
        }
    };
    
    // -- Final Send/Processing logic --
    const handleSend = async () => {
        const video = videoRef.current;
        if (!video) return;
        
        setIsProcessing(true);
        stopDrawingLoop();
        
        try {
            // 1. Setup streams
            const canvasStream = (canvasRef.current as any).captureStream(30); // 30 FPS
            const audioContext = new AudioContext();
            const sourceNode = audioContext.createMediaElementSource(video);
            const destinationNode = audioContext.createMediaStreamDestination();
            sourceNode.connect(destinationNode);
            
            const [audioTrack] = destinationNode.stream.getAudioTracks();
            canvasStream.addTrack(audioTrack);

            // 2. Setup recorder
            const recorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm' });
            const chunks: Blob[] = [];
            recorder.ondataavailable = e => chunks.push(e.data);
            
            recorder.onstop = () => {
                const finalBlob = new Blob(chunks, { type: 'video/webm' });
                onSend(finalBlob);
                // Cleanup
                audioContext.close();
                setIsProcessing(false);
            };

            // 3. Start processing
            recorder.start();
            video.currentTime = startTime;
            video.muted = true;
            await video.play();

            // 4. Monitor progress and stop
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
            startDrawingLoop(); // Restart preview loop on failure
        }
    };

    const startPercent = (startTime / duration) * 100;
    const endPercent = (endTime / duration) * 100;

    return (
        <div className="fixed inset-0 z-[400] bg-black flex flex-col animate-in fade-in duration-200">
            {isProcessing && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <p className="mt-4 text-sm font-bold text-white">Procesando video...</p>
                </div>
            )}
            <video ref={videoRef} className="hidden" crossOrigin="anonymous" />
            <div className="flex-1 flex items-center justify-center w-full h-full p-4 relative">
                <canvas 
                    ref={canvasRef} 
                    className="max-w-full max-h-full object-contain"
                    onMouseDown={handleDrawStart} onMouseMove={handleDrawMove} onMouseUp={handleDrawEnd}
                    onTouchStart={handleDrawStart} onTouchMove={handleDrawMove} onTouchEnd={handleDrawEnd}
                />
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
                {/* Trimmer */}
                {tool === 'trim' && (
                    <div className="relative h-12 flex items-center mb-4">
                        <div ref={timelineRef} onClick={handleTimelineScrub} className="w-full h-1 bg-white/20 rounded-full">
                           <div className="absolute top-1/2 -translate-y-1/2 h-1 bg-misionero-amarillo" style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}></div>
                        </div>
                        {/* Start Handle */}
                        <div className="absolute top-1/2 -translate-y-1/2 w-4 h-6 bg-white rounded-md shadow-lg cursor-pointer" style={{ left: `${startPercent}%` }}></div>
                        {/* End Handle */}
                        <div className="absolute top-1/2 -translate-y-1/2 w-4 h-6 bg-white rounded-md shadow-lg cursor-pointer" style={{ left: `${endPercent}%` }}></div>
                    </div>
                )}
                 {tool === 'draw' && (
                    <div className="bg-black/50 p-2 rounded-2xl mb-4 space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="flex justify-around">{COLORS.map(c => <button key={c} onClick={() => setDrawColor(c)} className={`w-8 h-8 rounded-full transition-transform ${drawColor === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-transparent' : 'scale-90'}`} style={{ backgroundColor: c }} />)}</div>
                        <div className="flex items-center gap-2 px-2"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: drawColor }}></div><input type="range" min="2" max="20" value={drawSize} onChange={e => setDrawSize(Number(e.target.value))} className="w-full h-1 bg-white/30 rounded-full appearance-none accent-misionero-azul" /><div className="w-5 h-5 rounded-full" style={{ backgroundColor: drawColor }}></div></div>
                    </div>
                )}
                {/* Toolbar */}
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
