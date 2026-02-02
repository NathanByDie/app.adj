import React, { useState, useRef, useEffect } from 'react';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';

interface CustomAudioPlayerProps {
    src: string;
    darkMode: boolean;
    isSender?: boolean;
    compact?: boolean;
}

const formatTime = (time: number) => {
    if (!time || isNaN(time) || time === Infinity) {
        return '0:00';
    }
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const CustomAudioPlayer: React.FC<CustomAudioPlayerProps> = ({ src, darkMode, isSender = false, compact = false }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);
    const hasFixedDurationRef = useRef(false);
    
    const { currentlyPlaying, playAudio, stopAudio } = useAudioPlayer();
    const isThisPlayerPlaying = currentlyPlaying === audioRef.current;

    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    // Evitar división por cero
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    // Reset state when src changes
    useEffect(() => {
        setDuration(0);
        setCurrentTime(0);
        hasFixedDurationRef.current = false;
        if (audioRef.current) {
            audioRef.current.load();
        }
    }, [src]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateDuration = () => {
            const d = audio.duration;
            
            // Fix crítico para WebM/Blobs que reportan Infinity
            if (d === Infinity && !hasFixedDurationRef.current) {
                hasFixedDurationRef.current = true;
                audio.currentTime = 1e9; // Forzar salto al final para calcular duración
                
                // Listener de una sola vez para volver al inicio
                const restoreTime = () => {
                    audio.currentTime = 0;
                    audio.removeEventListener('timeupdate', restoreTime);
                };
                audio.addEventListener('timeupdate', restoreTime);
                return;
            }

            if (!isNaN(d) && d !== Infinity && d > 0) {
                setDuration(d);
            }
        };

        const updateTime = () => {
            setCurrentTime(audio.currentTime);
            // Fallback: Si la duración aún es 0 (falló loadedmetadata), intentamos leerla de nuevo mientras reproduce
            if (duration === 0) updateDuration();
        };

        const handleEnded = () => {
            stopAudio(); 
            setCurrentTime(0);
        };

        // Attach listeners
        audio.addEventListener('timeupdate', updateTime);
        audio.addEventListener('loadedmetadata', updateDuration);
        audio.addEventListener('durationchange', updateDuration);
        audio.addEventListener('ended', handleEnded);

        // Check immediate state
        if (audio.readyState >= 1) {
            updateDuration();
        }

        return () => {
            audio.removeEventListener('timeupdate', updateTime);
            audio.removeEventListener('loadedmetadata', updateDuration);
            audio.removeEventListener('durationchange', updateDuration);
            audio.removeEventListener('ended', handleEnded);
        };
    }, [src, stopAudio, duration]);


    const togglePlayPause = () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isThisPlayerPlaying) {
            stopAudio();
        } else {
            // Si el audio terminó, reiniciar
            if (currentTime >= duration - 0.5 && duration > 0) {
                audio.currentTime = 0;
            }
            playAudio(audio);
        }
    };

    const handleProgressChange = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!progressBarRef.current || !audioRef.current) return;
        
        // Si no tenemos duración, no permitimos buscar (evita errores visuales)
        const effectiveDuration = duration || audioRef.current.duration;
        if (!isFinite(effectiveDuration) || effectiveDuration === 0) return;

        const rect = progressBarRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, clickX / rect.width));
        const newTime = ratio * effectiveDuration;
        
        audioRef.current.currentTime = newTime;
        setCurrentTime(newTime);
        
        // Si no teníamos duración guardada, la guardamos ahora
        if (duration === 0) setDuration(effectiveDuration);
    };

    const containerClasses = compact ? "flex items-center gap-3 w-full" : "flex items-center gap-3 w-60 sm:w-64";
    const buttonSize = compact ? "w-8 h-8" : "w-10 h-10";
    const iconSize = compact ? "w-4 h-4" : "w-5 h-5";
    const progressThumbSize = compact ? "w-2.5 h-2.5" : "w-3 h-3";

    const playButtonBg = isSender ? 'bg-white' : (darkMode ? 'bg-slate-700' : 'bg-slate-200');
    const playButtonIconColor = isSender ? 'text-misionero-azul' : (darkMode ? 'text-slate-300' : 'text-slate-600');
    const progressTrackBg = isSender ? 'bg-white/30' : (darkMode ? 'bg-slate-700' : 'bg-slate-200');
    const progressFillBg = isSender ? 'bg-white' : 'bg-misionero-azul';
    const textColor = isSender ? 'text-white/80' : (darkMode ? 'text-slate-400' : 'text-slate-500');

    return (
        <div className={containerClasses} draggable={false}>
            {/* preload="auto" ayuda a obtener la duración más rápido en algunos navegadores */}
            <audio ref={audioRef} src={src} preload="auto" />
            <button
                onClick={togglePlayPause}
                className={`${buttonSize} rounded-full flex items-center justify-center shrink-0 active:scale-90 transition-transform shadow-sm ${playButtonBg}`}
                aria-label={isThisPlayerPlaying ? 'Pausar audio' : 'Reproducir audio'}
            >
                {isThisPlayerPlaying ? (
                    <svg className={`${iconSize} ${playButtonIconColor}`} viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                ) : (
                    <svg className={`${iconSize} ml-0.5 ${playButtonIconColor}`} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                )}
            </button>
            <div className={`flex-1 flex flex-col justify-center ${compact ? 'gap-0' : 'gap-1'}`}>
                <div 
                    ref={progressBarRef}
                    onClick={handleProgressChange}
                    className={`h-1.5 w-full rounded-full cursor-pointer ${progressTrackBg}`}
                >
                    <div 
                        className={`h-full rounded-full relative ${progressFillBg} transition-all duration-100 ease-linear`}
                        style={{ width: `${progress}%` }}
                    >
                        <div className={`absolute right-0 top-1/2 -translate-y-1/2 rounded-full ${progressFillBg} shadow ${progressThumbSize}`}></div>
                    </div>
                </div>
                {!compact && (
                    <div className={`flex justify-between text-[10px] font-bold ${textColor}`}>
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CustomAudioPlayer;
