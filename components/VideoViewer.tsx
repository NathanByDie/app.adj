import React from 'react';

interface VideoViewerProps {
    videoUrl: string;
    onClose: () => void;
    darkMode: boolean;
}

const VideoViewer: React.FC<VideoViewerProps> = ({ videoUrl, onClose, darkMode }) => {
    return (
        <div className="fixed inset-0 z-[300] flex flex-col bg-black/90 backdrop-blur-lg animate-in fade-in duration-300" onClick={onClose}>
            <header className="px-4 pt-12 pb-3 flex items-center justify-between shrink-0 z-10" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="p-2 rounded-full text-white bg-white/10 active:bg-white/20 transition-colors">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </header>
            <div className="flex-1 flex items-center justify-center p-4 min-h-0" onClick={e => e.stopPropagation()}>
                <video 
                    src={videoUrl} 
                    controls 
                    autoPlay
                    playsInline
                    className="max-w-full max-h-full object-contain animate-in zoom-in-75 duration-300" 
                />
            </div>
        </div>
    );
};

export default VideoViewer;
