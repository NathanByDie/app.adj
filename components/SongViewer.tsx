import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Song } from '../types';
import { isChordLine, transposeSong } from '../services/musicUtils';

interface SongViewerProps {
  song: Song;
  onBack: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  externalTranspose?: number;
  onTransposeChange?: (val: number) => void;
  darkMode?: boolean;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  isChatVisible?: boolean;
  transposedContent?: string;
}

const SongViewer: React.FC<SongViewerProps> = ({ 
  song, 
  onBack, 
  onEdit, 
  onDelete, 
  externalTranspose, 
  onTransposeChange,
  darkMode = false,
  onNext,
  onPrev,
  hasNext = false,
  hasPrev = false,
  isChatVisible = false,
  transposedContent
}) => {
  const [internalTranspose, setInternalTranspose] = useState(0);
  const [fontSize, setFontSize] = useState(11);
  const [showOptions, setShowOptions] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  const [isControlPanelOpen, setIsControlPanelOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const minSwipeDistance = 50;

  const isTransposeLocked = externalTranspose !== undefined && onTransposeChange === undefined;
  
  const currentTranspose = externalTranspose !== undefined ? externalTranspose : internalTranspose;

  const handleTransposeChange = (delta: number) => {
    if (isTransposeLocked) return;
    const newVal = currentTranspose + delta;
    if (onTransposeChange) onTransposeChange(newVal);
    else setInternalTranspose(newVal);
  };

  const adjustFontSize = (delta: number) => {
    setFontSize(prev => Math.max(8, Math.min(24, prev + delta)));
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchStartY.current = e.targetTouches[0].clientY;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    
    const dx = touchStartX.current - touchEndX;
    const dy = touchStartY.current - touchEndY;

    if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > minSwipeDistance) {
      if (dx > 0 && onNext) onNext(); 
      else if (dx < 0 && onPrev) onPrev();
    }
    
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const handleShare = async () => {
    const webUrl = `${window.location.origin}${window.location.pathname}?song=${song.id}`;
    const scheme = window.location.protocol.replace(':', '');
    const host = window.location.host;
    const path = window.location.pathname;
    const query = `?song=${song.id}`;
    const androidIntentUrl = `intent://${host}${path}${query}#Intent;scheme=${scheme};package=com.adj.adjstudios;S.browser_fallback_url=${encodeURIComponent(webUrl)};end`;

    const shareData = { title: song.title, text: `Mira esta música en ADJStudios: ${song.title}`, url: androidIntentUrl };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      await navigator.share(shareData).catch(err => console.error("Error sharing:", err));
    } else {
      try {
        await navigator.clipboard.writeText(androidIntentUrl);
        setShowShareToast(true);
        setTimeout(() => setShowShareToast(false), 2000);
      } catch (err) {
        console.error("Could not copy text:", err);
      }
    }
    setShowOptions(false);
  };

  const downloadAsPDF = () => {
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const margin = 20;
    let y = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(30, 41, 59);
    doc.text(song.title.toUpperCase(), margin, y);
    y += 10;
    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(0.8);
    doc.line(margin, y, 190, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 116, 139);
    const transposedContentForPDF = transposeSong(song.content, currentTranspose);
    doc.text(`TONO ORIGINAL: ${song.key}`, margin, y);
    doc.text(`TONO ACTUAL: (${currentTranspose >= 0 ? '+' : ''}${currentTranspose})`, 80, y);
    doc.text(`CATEGORÍA: ${song.category.toUpperCase()}`, 140, y);
    y += 12;
    const lines = transposedContentForPDF.split('\n');
    doc.setFontSize(11);
    lines.forEach((line) => {
      if (y > 275) { doc.addPage(); y = margin; }
      if (isChordLine(line)) { doc.setFont("courier", "bold"); doc.setTextColor(59, 130, 246); }
      else { doc.setFont("courier", "normal"); doc.setTextColor(51, 65, 85); }
      doc.text(line || ' ', margin, y);
      y += 6;
    });

    const sanitizedTitle = song.title.replace(/[\/\\?%*:|"<>]/g, '_').trim();
    const fileName = `${sanitizedTitle}.pdf`;

    try {
      const pdfBlob = doc.output('blob');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdfBlob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error("Manual PDF download failed, falling back:", error);
      doc.save(fileName);
    }

    setShowOptions(false);
  };

  const processedContent = useMemo(() => {
    const contentToProcess = transposedContent !== undefined 
      ? transposedContent 
      : transposeSong(song.content, currentTranspose);
      
    const lines = contentToProcess.split('\n');
    return lines.map((line, idx) => (
      <div 
        key={idx} 
        style={{ fontSize: `${fontSize}px` }}
        className={`${isChordLine(line) ? (darkMode ? 'text-misionero-amarillo' : 'text-misionero-azul') : (darkMode ? 'text-slate-300' : 'text-slate-700')} chord-font font-black transition-colors duration-500 leading-tight mb-0.5 whitespace-pre`}
      >
        {line || '\u00A0'}
      </div>
    ));
  }, [song.content, currentTranspose, fontSize, darkMode, transposedContent]);

  return (
    <div 
      className={`flex flex-col h-full ${darkMode ? 'bg-slate-950 text-white' : 'bg-white text-slate-900'} z-[70] fixed inset-0 animate-in slide-in-from-bottom-2 duration-200 transition-colors duration-500`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <header className={`px-4 pt-12 pb-2 border-b ${darkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-white'} flex items-center justify-between sticky top-0 z-10 shadow-sm transition-colors duration-500`}>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onBack} className={`w-10 h-10 flex items-center justify-center ${darkMode ? 'text-slate-400' : 'text-slate-500'} active:scale-90`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center min-w-0 px-2 gap-2">
            {onPrev && (
                <button 
                  onClick={onPrev} 
                  disabled={!hasPrev} 
                  className={`w-8 h-8 flex items-center justify-center rounded-full shrink-0 transition-colors ${darkMode ? 'text-slate-400 disabled:text-slate-800 hover:bg-slate-800' : 'text-slate-500 disabled:text-slate-200 hover:bg-slate-100'} disabled:cursor-not-allowed`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18 17l-5-5 5-5m-7 10l-5-5 5-5" /></svg>
                </button>
            )}

            <div className="text-center truncate flex-1 min-w-0">
              <h1 className={`text-[11px] font-black uppercase truncate transition-colors duration-500 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{song.title}</h1>
              <div className="flex items-center justify-center gap-2">
                <span className="text-[7px] font-bold text-misionero-verde uppercase tracking-widest">{song.category}</span>
                <span className="text-[7px] font-black text-misionero-rojo uppercase">Tono: {song.key}</span>
              </div>
            </div>

            {onNext && (
                <button 
                  onClick={onNext} 
                  disabled={!hasNext} 
                  className={`w-8 h-8 flex items-center justify-center rounded-full shrink-0 transition-colors ${darkMode ? 'text-slate-400 disabled:text-slate-800 hover:bg-slate-800' : 'text-slate-500 disabled:text-slate-200 hover:bg-slate-100'} disabled:cursor-not-allowed`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5-5 5M6 7l5 5-5 5" /></svg>
                </button>
            )}
        </div>
        
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={handleShare} className="w-10 h-10 flex items-center justify-center text-misionero-verde active:scale-90">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
          </button>
          <button onClick={() => setShowOptions(!showOptions)} className={`w-10 h-10 flex items-center justify-center ${darkMode ? 'text-slate-500 active:bg-slate-800' : 'text-slate-400 active:bg-slate-50'} rounded-full transition-colors`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 5v.01M12 12v.01M12 19v.01"/></svg>
          </button>
          
          {showOptions && (
            <div className={`absolute right-4 top-12 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'} shadow-2xl rounded-2xl border w-44 overflow-hidden z-20 animate-in fade-in zoom-in duration-150 origin-top-right transition-colors duration-500`}>
              <button onClick={handleShare} className={`w-full px-4 py-3.5 text-left text-[9px] font-black uppercase ${darkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50'} border-b ${darkMode ? 'border-slate-800' : 'border-slate-50'} flex items-center gap-3`}><svg className="w-4 h-4 text-misionero-verde" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>Copiar Enlace App</button>
              <button onClick={downloadAsPDF} className={`w-full px-4 py-3.5 text-left text-[9px] font-black uppercase ${darkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50'} border-b ${darkMode ? 'border-slate-800' : 'border-slate-50'} flex items-center gap-3`}><svg className="w-4 h-4 text-misionero-rojo" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>Guardar PDF</button>
              {onEdit && (<button onClick={() => { onEdit(); setShowOptions(false); }} className={`w-full px-4 py-3.5 text-left text-[9px] font-black uppercase ${darkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50'} border-b ${darkMode ? 'border-slate-800' : 'border-slate-50'} flex items-center gap-3`}><svg className="w-4 h-4 text-misionero-azul" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>Editar música</button>)}
              {onDelete && (<button onClick={() => { onDelete(); setShowOptions(false); }} className={`w-full px-4 py-3.5 text-left text-[9px] font-black uppercase text-misionero-rojo ${darkMode ? 'hover:bg-red-500/10' : 'hover:bg-red-50'} flex items-center gap-3`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>Eliminar</button>)}
            </div>
          )}
        </div>
      </header>

      <div ref={scrollContainerRef} className={`flex-1 overflow-y-auto p-5 transition-colors duration-500 ${darkMode ? 'bg-slate-950' : 'bg-white'} custom-scroll no-pull relative`}>
        {showShareToast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-misionero-verde text-white px-6 py-2 rounded-full text-[10px] font-black uppercase shadow-2xl z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
            ¡Enlace App copiado!
          </div>
        )}
        <div className={`leading-relaxed ${isChatVisible ? 'pb-40' : 'pb-24'}`}>{processedContent}</div>
      </div>
      
      {/* --- Controles Flotantes --- */}
      <button 
        onClick={() => setIsControlPanelOpen(prev => !prev)} 
        className={`fixed z-[80] right-6 bottom-24 transition-all duration-300 ease-in-out active:scale-90 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center ${isControlPanelOpen ? 'bg-misionero-rojo text-white rotate-45' : 'bg-misionero-azul text-white'}`}
      >
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6"/></svg>
      </button>

      {isControlPanelOpen && (
        <div className={`fixed z-[79] right-6 bottom-40 w-48 p-2 rounded-2xl shadow-2xl border flex flex-col gap-1 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'} animate-in fade-in slide-in-from-bottom-4 duration-300`}>
          {!isTransposeLocked && (
            <>
              <div className="flex items-center justify-between px-2 pt-1">
                <span className="text-[9px] font-black uppercase text-slate-400">Tono</span>
                <button onClick={() => onTransposeChange ? onTransposeChange(0) : setInternalTranspose(0)} disabled={currentTranspose === 0} className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md transition-all ${currentTranspose !== 0 ? 'bg-misionero-rojo/20 text-misionero-rojo' : 'text-slate-400/50'}`}>0</button>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg">
                <button onClick={() => handleTransposeChange(-1)} className={`w-10 h-10 flex items-center justify-center rounded-full text-lg font-bold ${darkMode ? 'bg-slate-800 active:bg-slate-700' : 'bg-slate-100 active:bg-slate-200'}`}>-</button>
                <span className={`text-xl font-black w-12 text-center ${darkMode ? 'text-misionero-amarillo' : 'text-misionero-azul'}`}>{currentTranspose > 0 ? `+${currentTranspose}` : currentTranspose}</span>
                <button onClick={() => handleTransposeChange(1)} className={`w-10 h-10 flex items-center justify-center rounded-full text-lg font-bold ${darkMode ? 'bg-slate-800 active:bg-slate-700' : 'bg-slate-100 active:bg-slate-200'}`}>+</button>
              </div>
            </>
          )}

          {!isTransposeLocked && <div className={`h-px my-1 ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}></div>}
          
          <div className="flex items-center justify-between px-2 pt-1">
            <span className="text-[9px] font-black uppercase text-slate-400">Zoom</span>
            <button onClick={() => setFontSize(11)} disabled={fontSize === 11} className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md transition-all ${fontSize !== 11 ? 'bg-misionero-verde/20 text-misionero-verde' : 'text-slate-400/50'}`}>11</button>
          </div>
          <div className="flex items-center justify-between p-2 rounded-lg">
            <button onClick={() => adjustFontSize(-1)} className={`w-10 h-10 flex items-center justify-center rounded-full text-lg font-bold ${darkMode ? 'bg-slate-800 active:bg-slate-700' : 'bg-slate-100 active:bg-slate-200'}`}>-</button>
            <span className="text-xl font-black w-12 text-center">{fontSize}</span>
            <button onClick={() => adjustFontSize(1)} className={`w-10 h-10 flex items-center justify-center rounded-full text-lg font-bold ${darkMode ? 'bg-slate-800 active:bg-slate-700' : 'bg-slate-100 active:bg-slate-200'}`}>+</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SongViewer;