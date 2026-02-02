import React, { createContext, useState, useCallback, ReactNode, useContext, useEffect } from 'react';

interface AudioPlayerContextType {
    currentlyPlaying: HTMLAudioElement | null;
    playAudio: (audio: HTMLAudioElement) => void;
    stopAudio: () => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType>({
    currentlyPlaying: null,
    playAudio: () => {},
    stopAudio: () => {},
});

export const useAudioPlayer = () => useContext(AudioPlayerContext);

// FIX: Refactored to use React.FC to resolve typing error with the children prop.
export const AudioPlayerProvider: React.FC = ({ children }) => {
    const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

    const playAudio = useCallback((newAudioEl: HTMLAudioElement) => {
        if (audioEl && audioEl !== newAudioEl) {
            audioEl.pause();
        }
        newAudioEl.play().catch(e => console.error("Playback failed", e));
        setAudioEl(newAudioEl);
    }, [audioEl]);

    const stopAudio = useCallback(() => {
        if (audioEl) {
            audioEl.pause();
            setAudioEl(null);
        }
    }, [audioEl]);
    
    useEffect(() => {
        const currentAudio = audioEl;
        if (currentAudio) {
            const handleEnded = () => setAudioEl(null);
            const handlePause = () => {
                // If the pause was initiated externally (not by stopAudio), update state
                setAudioEl(current => current === currentAudio ? null : current);
            };

            currentAudio.addEventListener('ended', handleEnded);
            currentAudio.addEventListener('pause', handlePause);

            return () => {
                currentAudio.removeEventListener('ended', handleEnded);
                currentAudio.removeEventListener('pause', handlePause);
            };
        }
    }, [audioEl]);

    const value = { 
        currentlyPlaying: audioEl, 
        playAudio, 
        stopAudio 
    };

    return (
        <AudioPlayerContext.Provider value={value}>
            {children}
        </AudioPlayerContext.Provider>
    );
};
