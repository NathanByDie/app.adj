import React, { useState, useRef, useEffect } from 'react';

interface ImageViewerProps {
    imageUrl: string;
    onClose: () => void;
    onDelete: () => void;
    fileName?: string;
    darkMode: boolean;
}

const ImageViewer: React.FC<ImageViewerProps> = ({ imageUrl, onClose, onDelete, fileName, darkMode }) => {
    const [showOptions, setShowOptions] = useState(false);
    const optionsMenuRef = useRef<HTMLDivElement>(null);
    const optionsButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                optionsMenuRef.current &&
                // Fix: Corrected typo from `optionsMenu` to `optionsMenuRef`.
                !optionsMenuRef.current.contains(event.target as Node) &&
                optionsButtonRef.current &&
                !optionsButtonRef.current.contains(event.target as Node)
            ) {
                setShowOptions(false);
            }
        };

        if (showOptions) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showOptions]);

    const handleDownload = async () => {
        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fileName || 'imagen.jpg';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error("Error al descargar la imagen:", error);
            alert("No se pudo descargar la imagen.");
        } finally {
            setShowOptions(false);
        }
    };

    const handleDelete = () => {
        setShowOptions(false);
        onDelete();
    };

    return (
        <div className="fixed inset-0 z-[300] flex flex-col bg-black/80 backdrop-blur-lg animate-in fade-in duration-300" onClick={onClose}>
            <header className="px-4 pt-12 pb-3 flex items-center justify-between shrink-0 z-10" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="p-2 rounded-full text-white bg-white/10 active:bg-white/20 transition-colors">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                <div className="relative">
                    <button ref={optionsButtonRef} onClick={() => setShowOptions(prev => !prev)} className="p-2 rounded-full text-white bg-white/10 active:bg-white/20 transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 5v.01M12 12v.01M12 19v.01"/></svg>
                    </button>

                    {showOptions && (
                        <div ref={optionsMenuRef} className={`absolute right-0 top-full mt-2 w-56 p-2 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 origin-top-right ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-100'}`}>
                            <ul className="space-y-1">
                                <li>
                                    <button onClick={handleDownload} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors ${darkMode ? 'text-white hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-100'}`}>
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                                        <span>Guardar en dispositivo</span>
                                    </button>
                                </li>
                                <li>
                                    <button onClick={handleDelete} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors ${darkMode ? 'text-red-400 hover:bg-red-500/10' : 'text-red-500 hover:bg-red-500/5'}`}>
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        <span>Eliminar</span>
                                    </button>
                                </li>
                            </ul>
                        </div>
                    )}
                </div>
            </header>

            <div className="flex-1 flex items-center justify-center p-4 min-h-0" onClick={e => e.stopPropagation()}>
                <img src={imageUrl} alt="Vista ampliada" className="max-w-full max-h-full object-contain animate-in zoom-in-75 duration-300" />
            </div>
        </div>
    );
};

export default ImageViewer;
