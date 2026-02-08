import React, { useState, useRef, useEffect, useMemo } from 'react';
import { saveMediaToCache, getMediaFromCache } from '../services/cache';
import { analyzeAudioLocal, LocalAnalysisResult, extractMetadata } from '../services/localAudioAnalyzer';
import { transposeChord } from '../services/musicUtils';

// --- TIPOS ---
interface ChordEvent {
  timestamp: number;
  chord: string;
}

interface AudioAnalysis {
  id: string; 
  title: string;
  artist: string;
  key: string;
  bpm: number;
  timeSignature: string;
  chords: ChordEvent[];
  audioUrlKey: string;
  duration: number;
  offset: number;
  createdAt: number;
}

// Estructura estricta para la visualización tipo Yamaha
interface GridMeasure {
  index: number;
  startTime: number;
  endTime: number;
  beats: string[]; // Array fijo de acordes por beat (ej: [F#, F#, F#, F#])
}

interface TempAnalysisData extends Omit<AudioAnalysis, 'title' | 'artist'> {
    suggestedTitle?: string;
    suggestedArtist?: string;
}

// --- UTILIDADES ---
const formatTime = (time: number) => {
    if (!time || isNaN(time) || time === Infinity) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// --- COMPONENTES UI ---

const NOTE_TO_INDEX: { [key: string]: number } = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

const PianoVisualizer: React.FC<{ activeChord: string | null }> = ({ activeChord }) => {
    const keys = useMemo(() => {
        const keyData = [];
        for (let octave = 3; octave <= 4; octave++) {
            ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].forEach(note => {
                keyData.push({ note, type: note.includes('#') ? 'black' : 'white', octave });
            });
        }
        return keyData;
    }, []);

    const activeNotes = useMemo(() => {
        if (!activeChord || activeChord === 'N.C.' || activeChord === '.') return new Set();
        const rootMatch = activeChord.match(/^[A-G]#?/);
        if (!rootMatch) return new Set();
        
        const root = rootMatch[0];
        const isMinor = activeChord.includes('m');
        const rootIndex = NOTE_TO_INDEX[root];

        if (rootIndex === undefined) return new Set();

        const thirdIndex = (rootIndex + (isMinor ? 3 : 4)) % 12;
        const fifthIndex = (rootIndex + 7) % 12;
        
        const notes = new Set<string>();
        notes.add(Object.keys(NOTE_TO_INDEX).find(key => NOTE_TO_INDEX[key] === rootIndex)!);
        notes.add(Object.keys(NOTE_TO_INDEX).find(key => NOTE_TO_INDEX[key] === thirdIndex)!);
        notes.add(Object.keys(NOTE_TO_INDEX).find(key => NOTE_TO_INDEX[key] === fifthIndex)!);
        
        return notes;
    }, [activeChord]);

    return (
        <div className="h-24 w-full bg-[#1a1a1a] flex justify-center items-start px-2 py-2 overflow-hidden relative border-t-2 border-amber-600/50">
            <div className="flex relative h-full">
                {/* White keys */}
                {keys.filter(k => k.type === 'white').map((k, i) => (
                    <div key={`w-${k.octave}-${k.note}`} className={`w-6 h-full border border-gray-800 rounded-b-md mx-[1px] ${activeNotes.has(k.note) ? 'bg-amber-400' : 'bg-white'}`} />
                ))}
                {/* Black keys */}
                <div className="absolute top-0 left-0 right-0 flex h-2/3 pointer-events-none">
                    {keys.filter(k => k.type === 'white').map((k, i, arr) => (
                        <React.Fragment key={`b-container-${k.octave}-${k.note}`}>
                            <div className="w-6 mx-[1px] relative">
                                {k.note !== 'E' && k.note !== 'B' && (
                                    <div className={`absolute top-0 left-full -translate-x-1/2 w-4 h-full border border-black rounded-b-md z-10 ${activeNotes.has(keys[keys.findIndex(key => key.note === k.note && key.octave === k.octave) + 1].note) ? 'bg-amber-600' : 'bg-black'}`} />
                                )}
                            </div>
                        </React.Fragment>
                    ))}
                </div>
            </div>
             {activeChord && activeChord !== 'N.C.' && activeChord !== '.' && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 text-4xl font-black text-white drop-shadow-md pointer-events-none">
                    {activeChord}
                </div>
            )}
        </div>
    );
};

const CHORD_SHAPES: { [key: string]: (number | 'x')[] } = {
  'C': ['x', 3, 2, 0, 1, 0],  'G': [3, 2, 0, 0, 0, 3],  'Am': ['x', 0, 2, 2, 1, 0], 'F': [1, 3, 3, 2, 1, 1],
  'D': ['x', 'x', 0, 2, 3, 2],'A': ['x', 0, 2, 2, 2, 0], 'E': [0, 2, 2, 1, 0, 0],   'Em': [0, 2, 2, 0, 0, 0],
  'Dm': ['x', 'x', 0, 2, 3, 1],'Bm': ['x', 2, 4, 4, 3, 2],'C#m': ['x', 4, 6, 6, 5, 4],'F#m': [2, 4, 4, 2, 2, 2],
  'G#m': [4, 6, 6, 4, 4, 4], 'D#m': ['x', 6, 8, 8, 7, 6],'A#m': [6, 8, 8, 6, 6, 6],
};

const GuitarChordDiagram: React.FC<{ activeChord: string | null }> = ({ activeChord }) => {
    const chordName = activeChord?.replace('7', '').replace('sus4', '').replace('add9', '') || '';
    const fingering = CHORD_SHAPES[chordName];

    return (
        <div className="h-24 w-full bg-[#1a1a1a] flex flex-col justify-center items-center px-2 py-2 relative border-t-2 border-amber-600/50">
             {activeChord && activeChord !== 'N.C.' && activeChord !== '.' && (
                <div className="absolute top-2 right-4 text-2xl font-black text-white drop-shadow-md">
                    {activeChord}
                </div>
            )}
            <svg width="100" height="80" viewBox="0 0 100 80">
                <g stroke="#888" strokeWidth="1">
                    {[10, 25, 40, 55, 70].map(y => <line key={y} x1="10" y1={y} x2="90" y2={y} />)}
                    {[10, 26, 42, 58, 74, 90].map(x => <line key={x} x1={x} y1="10" x2={x} y2="70" />)}
                </g>
                {fingering && fingering.map((fret, string) => {
                    if (fret === 'x') {
                        return <text key={string} x={10 + string * 16} y="8" fill="#888" fontSize="10">x</text>;
                    }
                    if (fret === 0) {
                        return <circle key={string} cx={10 + string * 16} cy="5" r="3" stroke="#888" strokeWidth="1" fill="none" />;
                    }
                    return <circle key={string} cx={10 + string * 16} cy={10 + (fret * 15) - 7.5} r="6" fill="#fff" />;
                })}
            </svg>
        </div>
    );
};

const FileListItem: React.FC<{ item: AudioAnalysis, onClick: () => void, onDelete: (e: React.MouseEvent) => void, darkMode: boolean }> = ({ item, onClick, onDelete, darkMode }) => (
    <div 
        onClick={onClick} 
        className={`flex items-center gap-4 p-4 border-b transition-colors cursor-pointer active:bg-amber-500/10 ${darkMode ? 'border-slate-800 hover:bg-slate-900 text-white' : 'border-slate-100 hover:bg-slate-50 text-slate-900'}`}
    >
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${darkMode ? 'bg-slate-800' : 'bg-amber-50'}`}>
            <svg className="w-6 h-6 text-amber-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        </div>
        <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm truncate">{item.title}</h3>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                <span className="truncate max-w-[120px]">{item.artist || 'Desconocido'}</span>
                <span>•</span>
                <span>{item.bpm} BPM</span>
            </div>
        </div>
        <button onClick={onDelete} className="p-2 text-slate-400 hover:text-red-500"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
    </div>
);

const AnalysisLoadingView: React.FC<{ progressMessage: string }> = ({ progressMessage }) => {
    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black text-white">
            <div className="w-20 h-20 relative mb-8">
                <div className="absolute inset-0 border-4 border-amber-600/30 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-t-amber-500 rounded-full animate-spin"></div>
            </div>
            <h2 className="text-xl font-bold uppercase tracking-widest text-amber-500 mb-2">Analizando</h2>
            <p className="text-sm text-slate-400 font-mono animate-pulse">{progressMessage}</p>
            <p className="text-[10px] text-slate-600 font-bold mt-4 max-w-xs text-center uppercase">Creando Grid de Acordes...</p>
        </div>
    );
};

const MetadataForm: React.FC<{ 
    onSubmit: (title: string, artist: string) => void, 
    onCancel: () => void,
    initialTitle?: string,
    initialArtist?: string
}> = ({ onSubmit, onCancel, initialTitle, initialArtist }) => {
    const [title, setTitle] = useState(initialTitle || '');
    const [artist, setArtist] = useState(initialArtist || '');
    
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-in zoom-in-95">
                <h3 className="text-white font-bold text-lg mb-4 text-center">Guardar Canción</h3>
                <div className="space-y-4">
                    <input autoFocus value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-slate-800 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-amber-500" placeholder="Título" />
                    <input value={artist} onChange={e => setArtist(e.target.value)} className="w-full bg-slate-800 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-amber-500" placeholder="Artista" />
                    <div className="flex gap-3 pt-2">
                        <button onClick={onCancel} className="flex-1 py-3 bg-slate-800 text-slate-300 rounded-xl font-bold text-sm">Cancelar</button>
                        <button disabled={!title} onClick={() => onSubmit(title, artist)} className="flex-1 py-3 bg-amber-600 text-white rounded-xl font-bold text-sm disabled:opacity-50">Guardar</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- SETTINGS PANEL ---
const TrackerSettingsPanel: React.FC<{
    onClose: () => void;
    transpose: number;
    setTranspose: (val: number) => void;
    playbackRate: number;
    setPlaybackRate: (val: number) => void;
    timeSignature: string;
    setTimeSignature: (val: string) => void;
    syncOffset: number;
    setSyncOffset: (val: number | ((prev: number) => number)) => void;
}> = ({ onClose, transpose, setTranspose, playbackRate, setPlaybackRate, timeSignature, setTimeSignature, syncOffset, setSyncOffset }) => {
    return (
        <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-200" onClick={onClose}>
            <div className="w-full max-w-md bg-[#1a1a1a] border-t border-[#333] rounded-t-[2rem] p-6 space-y-6 animate-in slide-in-from-bottom duration-300" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center border-b border-[#333] pb-4">
                    <h3 className="text-white font-black text-lg uppercase tracking-tight">Ajustes de Pista</h3>
                    <button onClick={onClose} className="text-[#888] hover:text-white"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg></button>
                </div>

                {/* Transpose */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-[#888] uppercase tracking-widest">Tono (Transponer)</label>
                        <span className={`text-sm font-black ${transpose === 0 ? 'text-[#666]' : 'text-amber-500'}`}>{transpose > 0 ? `+${transpose}` : transpose} Semitonos</span>
                    </div>
                    <div className="flex items-center justify-between bg-[#222] rounded-xl p-2">
                        <button onClick={() => setTranspose(transpose - 1)} className="w-12 h-12 bg-[#333] rounded-lg text-white font-bold active:scale-95 transition-transform text-xl">-</button>
                        <div className="flex gap-1">
                            {[-2, -1, 0, 1, 2].map(t => (
                                <div key={t} className={`w-2 h-2 rounded-full ${t === 0 ? 'bg-[#555]' : 'bg-[#333]'} ${transpose === t ? 'bg-amber-500 scale-125' : ''}`}></div>
                            ))}
                        </div>
                        <button onClick={() => setTranspose(transpose + 1)} className="w-12 h-12 bg-[#333] rounded-lg text-white font-bold active:scale-95 transition-transform text-xl">+</button>
                    </div>
                </div>

                {/* Grid Sync */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-[#888] uppercase tracking-widest">Ajuste de Inicio (Offset)</label>
                        <span className={`text-sm font-black ${syncOffset === 0 ? 'text-[#666]' : 'text-amber-500'}`}>{syncOffset > 0 ? `+${syncOffset}` : syncOffset} ms</span>
                    </div>
                    <div className="flex items-center justify-between bg-[#222] rounded-xl p-2">
                        <button onClick={() => setSyncOffset(prev => prev - 50)} className="w-12 h-12 bg-[#333] rounded-lg text-white font-bold active:scale-95 transition-transform text-xl"><svg className="w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg></button>
                        <span className="text-[10px] text-slate-400">Mover Grid</span>
                        <button onClick={() => setSyncOffset(prev => prev + 50)} className="w-12 h-12 bg-[#333] rounded-lg text-white font-bold active:scale-95 transition-transform text-xl"><svg className="w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg></button>
                    </div>
                </div>

                {/* Playback Speed */}
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-[#888] uppercase tracking-widest">Velocidad</label>
                        <span className="text-sm font-black text-white">{playbackRate.toFixed(2)}x</span>
                    </div>
                    <input 
                        type="range" 
                        min="0.5" 
                        max="1.5" 
                        step="0.05" 
                        value={playbackRate} 
                        onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                        className="w-full h-2 bg-[#333] rounded-full appearance-none accent-amber-600" 
                    />
                    <div className="flex justify-between text-[10px] text-[#555] font-bold">
                        <span>0.5x</span>
                        <span className="text-[#888]">1.0x</span>
                        <span>1.5x</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- COMPONENTE PRINCIPAL ---

const ChordTrackerView: React.FC<{ darkMode: boolean }> = ({ darkMode }) => {
    const [viewMode, setViewMode] = useState<'library' | 'player'>('library');
    const [library, setLibrary] = useState<AudioAnalysis[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [progressMsg, setProgressMsg] = useState('');
    const [tempAnalysis, setTempAnalysis] = useState<TempAnalysisData | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Player State
    const [currentSong, setCurrentSong] = useState<AudioAnalysis | null>(null);
    const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const measureRefs = useRef<(HTMLDivElement | null)[]>([]);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [instrumentView, setInstrumentView] = useState<'keyboard' | 'guitar'>('keyboard');

    // Settings State
    const [showSettings, setShowSettings] = useState(false);
    const [transpose, setTranspose] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1.0);
    const [customTimeSignature, setCustomTimeSignature] = useState<string | null>(null);
    const [syncOffset, setSyncOffset] = useState(0);

    // --- CARGA INICIAL ---
    useEffect(() => {
        const saved = localStorage.getItem('chordTrackerLibrary');
        if (saved) {
            try {
                const parsed = JSON.parse(saved).sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
                setLibrary(parsed);
            } catch (e) { console.error(e); }
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('chordTrackerLibrary', JSON.stringify(library));
    }, [library]);

    useEffect(() => {
        return () => { if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl); };
    }, [audioBlobUrl]);

    // --- LÓGICA DE AUDIO ---
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        audio.playbackRate = playbackRate;

        let animationFrameId: number;

        const tick = () => {
            setCurrentTime(audio.currentTime);
            if (!audio.paused) {
                animationFrameId = requestAnimationFrame(tick);
            }
        };

        const handlePlay = () => {
            setIsPlaying(true);
            animationFrameId = requestAnimationFrame(tick);
        };

        const handlePause = () => {
            setIsPlaying(false);
            cancelAnimationFrame(animationFrameId);
            setCurrentTime(audio.currentTime); 
        };

        const handleEnded = () => {
            setIsPlaying(false);
            cancelAnimationFrame(animationFrameId);
            audio.currentTime = 0;
            setCurrentTime(0);
        };
        
        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('ended', handleEnded);

        return () => {
            cancelAnimationFrame(animationFrameId);
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('ended', handleEnded);
        };
    }, [audioBlobUrl, playbackRate]);

    // --- GRID GENERATION ALGORITHM (Strict Grid Logic) ---
    // This creates fixed boxes for each beat, regardless of what the "raw" chords say.
    const measures = useMemo<GridMeasure[]>(() => {
        if (!currentSong) return [];
        const { bpm, duration, chords, offset = 0, timeSignature: originalTS } = currentSong;
        if (!bpm || bpm === 0) return [];
        
        const finalOffset = offset + (syncOffset / 1000);
        const activeTS = customTimeSignature || originalTS || "4/4";
        const beatsPerMeasure = parseInt(activeTS.split('/')[0]);
        
        const beatDuration = 60 / bpm;
        const measureDuration = beatDuration * beatsPerMeasure;
        
        // Calculate strict grid
        const totalMeasures = Math.ceil((duration - Math.max(0, finalOffset)) / measureDuration) + 1;
        const result: GridMeasure[] = [];

        for (let i = 0; i < totalMeasures; i++) {
            const mStart = Math.max(0, finalOffset) + (i * measureDuration);
            const mEnd = mStart + measureDuration;
            
            const beats: string[] = [];
            
            for (let b = 0; b < beatsPerMeasure; b++) {
                // Sample exactly at the middle of the beat to avoid edge-case noise
                const sampleTime = mStart + (b * beatDuration) + (beatDuration * 0.5); 
                
                // Find dominant chord at this exact moment
                let activeChord = 'N.C.';
                for (let c = chords.length - 1; c >= 0; c--) {
                    if (chords[c].timestamp <= sampleTime) {
                        activeChord = chords[c].chord;
                        break;
                    }
                }
                
                // Only show chord if it's different from previous in the measure, OR if it's the first beat
                // This mimics Yamaha's style where sustained chords are blank spaces or dots
                beats.push(transposeChord(activeChord, transpose));
            }

            result.push({ index: i, startTime: mStart, endTime: mEnd, beats });
        }
        return result;
    }, [currentSong, transpose, customTimeSignature, syncOffset]);

    // --- SYNC ENGINE (Zero Lag Math) ---
    // Instead of finding index in array (O(N)), we calculate it (O(1)).
    const { activeMeasureIndex, playheadLeft, currentBeatIndex } = useMemo(() => {
        if (!currentSong || measures.length === 0) return { activeMeasureIndex: 0, playheadLeft: 0, currentBeatIndex: 0 };
        
        const { bpm, offset = 0, timeSignature: originalTS } = currentSong;
        const finalOffset = offset + (syncOffset / 1000);
        const activeTS = customTimeSignature || originalTS || "4/4";
        const beatsPerMeasure = parseInt(activeTS.split('/')[0]);
        const beatDuration = 60 / bpm;
        const measureDuration = beatDuration * beatsPerMeasure;

        // Calculate exact time relative to the musical grid start
        const timeInGrid = currentTime - finalOffset;
        
        // If before start, show at 0 of first measure
        if (timeInGrid < 0) return { activeMeasureIndex: 0, playheadLeft: 0, currentBeatIndex: 0 };

        const activeIndex = Math.floor(timeInGrid / measureDuration);
        const timeInMeasure = timeInGrid % measureDuration;
        const pLeft = (timeInMeasure / measureDuration) * 100;
        const beatIndex = Math.floor(timeInMeasure / beatDuration);

        return { activeMeasureIndex: activeIndex, playheadLeft: pLeft, currentBeatIndex: beatIndex };
    }, [currentTime, currentSong, measures.length, syncOffset, customTimeSignature]);

    // Auto-Scroll
    useEffect(() => {
        if (activeMeasureIndex > -1 && measureRefs.current[activeMeasureIndex] && isPlaying) {
            measureRefs.current[activeMeasureIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [activeMeasureIndex, isPlaying]);

    const currentActiveChord = useMemo(() => {
        if (activeMeasureIndex === -1 || !measures[activeMeasureIndex]) return 'N.C.';
        const measure = measures[activeMeasureIndex];
        // Use the calculated beat index for instant update
        const beatIndex = Math.min(measure.beats.length - 1, Math.max(0, currentBeatIndex));
        
        // Return actual chord for instrument view
        return measure.beats[beatIndex] === '.' ? 'N.C.' : measure.beats[beatIndex];
    }, [activeMeasureIndex, currentBeatIndex, measures]);


    // --- HANDLERS ---
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) analyzeAudio(file);
        e.target.value = '';
    };

    const analyzeAudio = async (file: File) => {
        setIsAnalyzing(true);
        try {
            const metadataPromise = extractMetadata(file);
            const analysisPromise = analyzeAudioLocal(file, (msg) => setProgressMsg(msg));
            const [metadata, result] = await Promise.all([metadataPromise, analysisPromise]);
            const fileKey = `song_${Date.now()}`;
            await saveMediaToCache(fileKey, file);
            setTempAnalysis({
                id: fileKey, audioUrlKey: fileKey, key: result.key, bpm: result.bpm,
                timeSignature: result.timeSignature, chords: result.chords, duration: result.duration,
                offset: result.offset || 0, createdAt: Date.now(),
                suggestedTitle: metadata.title || file.name.replace(/\.[^/.]+$/, ""),
                suggestedArtist: metadata.artist || "Desconocido"
            });
        } catch (e) {
            console.error(e);
            alert("Error al analizar el audio.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleSaveSong = (title: string, artist: string) => {
        if (tempAnalysis) {
            const { suggestedTitle, suggestedArtist, ...cleanAnalysis } = tempAnalysis;
            const newSong: AudioAnalysis = { ...cleanAnalysis, title, artist };
            setLibrary(prev => [newSong, ...prev]);
            setTempAnalysis(null);
        }
    };

    const handleOpenSong = async (song: AudioAnalysis) => {
        const blob = await getMediaFromCache(song.audioUrlKey);
        if (blob) {
            if(audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
            const url = URL.createObjectURL(blob);
            setAudioBlobUrl(url);
            setCurrentSong(song);
            
            setTranspose(0);
            setPlaybackRate(1.0);
            setCustomTimeSignature(null);
            setSyncOffset(0);
            
            setViewMode('player');
        } else {
            alert("Archivo no encontrado en caché.");
        }
    };

    const handleBack = () => {
        if(audioRef.current) audioRef.current.pause();
        setIsPlaying(false);
        setViewMode('library');
        setCurrentSong(null);
        if (audioBlobUrl) {
            URL.revokeObjectURL(audioBlobUrl);
            setAudioBlobUrl(null);
        }
    };

    // --- RENDER ---

    if (isAnalyzing) return <AnalysisLoadingView progressMessage={progressMsg} />;
    if (tempAnalysis) return <MetadataForm onSubmit={handleSaveSong} onCancel={() => setTempAnalysis(null)} initialTitle={tempAnalysis.suggestedTitle} initialArtist={tempAnalysis.suggestedArtist} />;

    if (viewMode === 'library') {
        return (
            <div 
                className={`w-full h-full flex flex-col ${darkMode ? 'bg-black text-white' : 'bg-slate-50 text-slate-900'}`}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={e => setIsDragging(false)}
                onDrop={e => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files[0];
                    if (file && file.type.startsWith('audio/')) analyzeAudio(file);
                }}
            >
                {isDragging && <div className="fixed inset-0 z-50 bg-amber-500/90 flex items-center justify-center text-white"><h2 className="text-2xl font-black">SOLTAR ARCHIVO</h2></div>}
                <header className="px-6 pt-12 pb-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center sticky top-0 z-10 bg-inherit">
                    <h2 className="text-xl font-black uppercase">Biblioteca</h2>
                    <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2 py-1 rounded">{library.length}</span>
                </header>
                <div className="flex-1 overflow-y-auto custom-scroll pb-24">
                    {library.length === 0 ? <div className="p-8 text-center text-slate-500">No hay canciones. Sube una.</div> : library.map(s => (
                        <FileListItem key={s.id} item={s} onClick={() => handleOpenSong(s)} onDelete={(e) => { e.stopPropagation(); setLibrary(prev => prev.filter(x => x.id !== s.id)); }} darkMode={darkMode} />
                    ))}
                </div>
                <button onClick={() => fileInputRef.current?.click()} className="fixed bottom-24 right-6 w-14 h-14 bg-amber-600 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 border-4 border-white dark:border-black z-40"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg></button>
                <input type="file" ref={fileInputRef} accept="audio/*" className="hidden" onChange={handleFileSelect} />
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col font-sans select-none">
            {/* Header / Transport */}
            <div className="bg-[#1a1a1a] border-b border-[#333] px-4 pt-12 pb-2 flex flex-col gap-3 shrink-0">
                <div className="flex justify-between items-start">
                    <div className="min-w-0 flex-1"><h1 className="text-white font-bold text-sm truncate">{currentSong?.title}</h1><p className="text-[#888] text-xs truncate">{currentSong?.artist}</p></div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleBack} className="text-amber-500 font-bold text-sm px-2">Salir</button>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[#888] text-[10px] font-mono w-8">{formatTime(currentTime)}</span>
                    <input type="range" min="0" max={currentSong?.duration || 100} value={currentTime} onChange={e => { const t = Number(e.target.value); if(audioRef.current) audioRef.current.currentTime = t; setCurrentTime(t); }} className="flex-1 h-1 bg-[#333] rounded-full appearance-none cursor-pointer accent-white" />
                    <span className="text-[#888] text-[10px] font-mono w-8">{formatTime(currentSong?.duration || 0)}</span>
                </div>
                <div className="flex justify-between items-center px-4 pb-1">
                    <button onClick={() => { if(audioRef.current) audioRef.current.currentTime -= 5; }} className="text-white active:text-amber-500"><svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg></button>
                    <button onClick={() => isPlaying ? audioRef.current?.pause() : audioRef.current?.play()} className="w-14 h-14 flex items-center justify-center bg-red-600 rounded-full text-white shadow-lg active:scale-95 border-2 border-red-500/50">
                        {isPlaying ? <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
                    </button>
                    <button onClick={() => { if(audioRef.current) audioRef.current.currentTime += 5; }} className="text-white active:text-amber-500"><svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg></button>
                </div>
            </div>

            {/* Grid Visualizer */}
            <div className="flex-1 overflow-y-auto bg-[#0a0a0a] relative custom-scroll" ref={scrollContainerRef}>
                <div className="pb-32 pt-2 px-2 flex flex-col gap-1">
                    {measures.map((measure, index) => {
                        const isActiveMeasure = index === activeMeasureIndex;
                        // Determine grid columns based on beat count
                        const gridCols = `grid-cols-${measure.beats.length}`;

                        return (
                            <div key={index} ref={el => measureRefs.current[index] = el} className={`relative w-full h-16 bg-[#181818] rounded border border-[#2a2a2a] overflow-hidden ${isActiveMeasure ? 'ring-1 ring-white/20' : ''}`}>
                                {/* Measure Number */}
                                <div className="absolute top-0.5 left-1 text-[8px] font-mono text-[#555] z-10 select-none">{index + 1}</div>
                                
                                {/* Active Playhead Line (Logic-based position) */}
                                {isActiveMeasure && (
                                    <div 
                                        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 shadow-[0_0_8px_rgba(239,68,68,0.8)] transition-none will-change-transform"
                                        style={{ left: `${playheadLeft}%` }}
                                    ></div>
                                )}

                                {/* Beat Grid */}
                                <div className={`grid ${gridCols} w-full h-full divide-x divide-[#2a2a2a]`}>
                                    {measure.beats.map((chord, bIdx) => {
                                        // Visual logic: if it's the same chord as previous in the same measure, make it dimmer or a dot
                                        const isSameAsPrev = bIdx > 0 && measure.beats[bIdx - 1] === chord;
                                        
                                        // Highlight current beat
                                        const isCurrentBeat = isActiveMeasure && currentBeatIndex === bIdx;

                                        return (
                                            <div key={bIdx} className={`relative flex items-center justify-center ${isCurrentBeat ? 'bg-[#222]' : ''}`}>
                                                {!isSameAsPrev && chord !== 'N.C.' ? (
                                                    <span className="text-white font-bold text-lg drop-shadow-md z-10">{chord}</span>
                                                ) : (
                                                    // Dot for sustained/same chord
                                                    <div className="w-1 h-1 rounded-full bg-[#333]"></div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Instruments & Footer */}
            <div className="bg-[#121212] shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                {instrumentView === 'keyboard' 
                    ? <PianoVisualizer activeChord={currentActiveChord} /> 
                    : <GuitarChordDiagram activeChord={currentActiveChord} />
                }
                <div className="flex justify-between items-center px-6 py-3 text-[#888] border-t border-[#333]">
                     {[{id: 'keyboard', label: 'Teclado', icon: <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M20 5H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V7a2 2 0 00-2-2zM5 15V9h2v6H5zm4 0V9h2v6H9zm4 0V9h2v6h-2zm4 0V9h2v6h-2z"/></svg> },
                      {id: 'guitar', label: 'Guitarra', icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg> },
                      {id: 'settings', label: 'Ajustes', icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg> },
                     ].map(item => (
                        <div key={item.id} onClick={() => {
                            if (item.id === 'settings') setShowSettings(true);
                            else if (item.id === 'guitar' || item.id === 'keyboard') setInstrumentView(item.id as any);
                        }} className={`flex flex-col items-center gap-1 cursor-pointer transition-colors ${instrumentView === item.id || (item.id === 'settings' && showSettings) ? 'text-amber-500' : 'opacity-60 hover:opacity-100'}`}>
                           {item.icon}
                           <span className="text-[10px] font-bold uppercase">{item.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {audioBlobUrl && <audio ref={audioRef} src={audioBlobUrl} />}
            
            {showSettings && (
                <TrackerSettingsPanel 
                    onClose={() => setShowSettings(false)}
                    transpose={transpose}
                    setTranspose={setTranspose}
                    playbackRate={playbackRate}
                    setPlaybackRate={setPlaybackRate}
                    timeSignature={customTimeSignature || currentSong?.timeSignature || '4/4'}
                    setTimeSignature={setCustomTimeSignature}
                    syncOffset={syncOffset}
                    setSyncOffset={setSyncOffset}
                />
            )}
        </div>
    );
};

export default ChordTrackerView;