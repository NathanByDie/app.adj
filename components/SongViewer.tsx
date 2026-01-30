
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Song } from '../types';
import { isChordLine, transposeSong, transposeRoot, findBestCapo } from '../services/musicUtils';
import { set as setRtdb, ref as refRtdb } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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
  chatInputComponent?: React.ReactNode;
  rtdb?: any;
  roomId?: string;
  isHost?: boolean;
}

const MagicWandIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2L18 5.5 6 17.5 2 22l4.5-4L14.5 2z"></path>
    <path d="M12 5l-2.5 2.5"></path>
    <path d="M7 10l-2.5 2.5"></path>
    <path d="M19 8l2.5-2.5"></path>
    <path d="M14 13l2.5-2.5"></path>
  </svg>
);


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
  transposedContent,
  chatInputComponent,
  rtdb,
  roomId,
  isHost,
}) => {
  const [internalTranspose, setInternalTranspose] = useState(0);
  const [fontSize, setFontSize] = useState(11);
  const [capo, setCapo] = useState(0);
  const [showOptions, setShowOptions] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  const [isControlPanelOpen, setIsControlPanelOpen] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [pdfConfirmModal, setPdfConfirmModal] = useState(false);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);
  const optionsButtonRef = useRef<HTMLButtonElement>(null);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const minSwipeDistance = 50;
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        optionsMenuRef.current &&
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

  const isTransposeLocked = externalTranspose !== undefined && onTransposeChange === undefined;
  
  const currentTranspose = externalTranspose !== undefined ? externalTranspose : internalTranspose;
  const preferSharps = capo > 0;

  const handleTransposeChange = (delta: number) => {
    if (isTransposeLocked) return;
    const newVal = currentTranspose + delta;
    if (onTransposeChange) onTransposeChange(newVal);
    else setInternalTranspose(newVal);
  };

  const handleCapoChange = (delta: number) => {
    setCapo(prev => {
      const newVal = prev + delta;
      if (newVal < 0 || newVal > 11) return prev;
      return newVal;
    });
  };

  const handleSuggestCapo = () => {
    const bestCapo = findBestCapo(song.content, currentTranspose);
    setCapo(bestCapo);
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
    const webUrl = `https://myadjstudios.netlify.app/?song=${song.id}`;
    const textData = `Mira esta música en ADJStudios: ${song.title}`;
    
    const shareData = {
      title: song.title,
      text: textData,
      url: webUrl
    };

    // 1. Prioridad: Plugin Nativo de Median (GoNative)
    // Usamos tanto 'median' como 'gonative' para compatibilidad
    const median = (window as any).median || (window as any).gonative;

    if (median?.share) {
        try {
            median.share.share(shareData);
        } catch (e) {
            console.error("Fallo al compartir vía Median:", e);
        }
        setShowOptions(false);
        return;
    }

    // 2. Fallback: Web Share API (Navegadores móviles estándar)
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      await navigator.share(shareData).catch(err => console.error("Error sharing:", err));
    } 
    // 3. Fallback final: Copiar al portapapeles
    else {
      try {
        await navigator.clipboard.writeText(webUrl);
        setShowShareToast(true);
        setTimeout(() => setShowShareToast(false), 2000);
      } catch (err) {
        console.error("Could not copy text:", err);
      }
    }
    setShowOptions(false);
  };

  const downloadAsPDF = () => {
    setShowOptions(false);
    setPdfConfirmModal(true);
  };
  
  const handleConfirmDownload = async () => {
    setPdfConfirmModal(false);
    
    if (typeof (window as any).jspdf === 'undefined') {
        alert("La librería para generar PDF no se pudo cargar. Revisa tu conexión a internet e inténtalo de nuevo.");
        return;
    }

    setIsGeneratingPDF(true);

    // Pequeño delay para permitir que el UI se actualice y muestre el spinner
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
        const { jsPDF, GState } = (window as any).jspdf;
        
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const margin = 20;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const maxWidth = pageWidth - (margin * 2);
        let y = margin;

        const addWatermark = () => {
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            doc.saveGraphicsState();
            doc.setFont("helvetica", "bold");
            doc.setFontSize(32);
            doc.setTextColor(200, 200, 200);
            doc.setGState(new GState({opacity: 0.15})); 
            
            const watermarkText = "ADJStudios";
            const stepX = 80;
            const stepY = 80;

            for (let y = 0; y < pageH + stepY; y += stepY) {
                for (let x = 0; x < pageW + stepX; x += stepX) {
                    doc.text(
                        watermarkText,
                        x,
                        y,
                        { angle: -45, align: 'center' }
                    );
                }
            }
            doc.restoreGraphicsState();
        };

        addWatermark();

        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.setTextColor(30, 41, 59);
        
        const titleLines = doc.splitTextToSize(song.title.toUpperCase(), maxWidth);
        doc.text(titleLines, margin, y);
        y += (titleLines.length * 8);

        doc.setDrawColor(59, 130, 246);
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;

        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        const totalTranspose = currentTranspose - capo;
        const transposedContentForPDF = transposeSong(song.content, totalTranspose, preferSharps);
        doc.text(`TONO ORIGINAL: ${song.key}`, margin, y);
        doc.text(`TONO SONORO: (${currentTranspose >= 0 ? '+' : ''}${currentTranspose})`, margin + 60, y);
        if (capo > 0) {
          doc.text(`CAPO: ${capo}`, margin + 120, y);
        }
        y += 12;

        const lines = transposedContentForPDF.split('\n');
        doc.setFontSize(10);
        const lineHeight = 5;

        lines.forEach((line) => {
            if (y > pageHeight - margin) {
                doc.addPage();
                addWatermark();
                y = margin;
            }
            if (isChordLine(line)) {
                doc.setFont("courier", "bold");
                doc.setTextColor(59, 130, 246);
            } else {
                doc.setFont("courier", "normal");
                doc.setTextColor(51, 65, 85);
            }
            const splitLines = doc.splitTextToSize(line || ' ', maxWidth);
            splitLines.forEach((splitLine: string) => {
                if (y > pageHeight - margin) {
                    doc.addPage();
                    addWatermark();
                    y = margin;
                }
                doc.text(splitLine, margin, y);
                y += lineHeight;
            });
        });

        const sanitizedTitle = song.title.replace(/[\/\\?%*:|"<>]/g, '_').trim();
        const fileName = `${sanitizedTitle}.pdf`;

        // Intentar usar Web Share API con archivos primero (mejor para móviles)
        try {
            const blob = doc.output('blob');
            const file = new File([blob], fileName, { type: 'application/pdf' });
            
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: song.title,
                    text: `PDF de ${song.title}`
                });
            } else {
                // Fallback clásico
                doc.save(fileName);
            }
        } catch (shareError) {
            console.warn("Share API failed, falling back to save:", shareError);
            doc.save(fileName);
        }

    } catch (error) {
        console.error("PDF generation failed:", error);
        alert("Ocurrió un error al generar el PDF.");
    } finally {
        setIsGeneratingPDF(false);
    }
  };

  const processedContent = useMemo(() => {
    const totalTranspose = currentTranspose - capo;
    const contentToProcess = transposeSong(song.content, totalTranspose, preferSharps);
      
    const lines = contentToProcess.split('\n');
    return lines.map((line, idx) => (
      <div 
        key={idx} 
        style={{ fontSize: `${fontSize}px` }}
        className={`${isChordLine(line) ? (darkMode ? 'text-misionero-amarillo neon-yellow' : 'text-misionero-azul neon-blue') : (darkMode ? 'text-slate-300' : 'text-slate-700')} chord-font font-black transition-colors duration-500 leading-tight mb-0.5 whitespace-pre`}
      >
        {line || '\u00A0'}
      </div>
    ));
  }, [song.content, currentTranspose, capo, fontSize, darkMode, preferSharps]);

  const soundingKey = useMemo(() => transposeRoot(song.key, currentTranspose), [song.key, currentTranspose]);
  const chordShapeKey = useMemo(() => transposeRoot(song.key, currentTranspose - capo, preferSharps), [song.key, currentTranspose, capo, preferSharps]);

  return (
    <div 
      className={`flex flex-col h-full ${darkMode ? 'bg-black text-white' : 'bg-white text-slate-900'} fixed inset-0 animate-in slide-in-from-bottom-2 duration-200`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <header className={`px-4 pt-12 pb-2 flex items-center justify-between sticky top-0 z-30 glass-ui`}>
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
              <div className="flex items-center justify-center gap-2 text-[7px] font-black uppercase">
                <span className="text-misionero-rojo">Tono: {soundingKey}</span>
                {capo > 0 && <span className={darkMode ? 'text-misionero-amarillo' : 'text-misionero-azul'}>Capo {capo}: {chordShapeKey}</span>}
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
          <button ref={optionsButtonRef} onClick={() => setShowOptions(!showOptions)} className={`w-10 h-10 flex items-center justify-center ${darkMode ? 'text-slate-500 active:bg-slate-800' : 'text-slate-400 active:bg-slate-50'} rounded-full transition-colors`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 5v.01M12 12v.01M12 19v.01"/></svg>
          </button>
        </div>
      </header>

      {/* Overlay de Generación de PDF */}
      {isGeneratingPDF && (
        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-2xl flex flex-col items-center">
                <div className="w-10 h-10 border-4 border-misionero-rojo/30 border-t-misionero-rojo rounded-full animate-spin mb-3"></div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white">Generando PDF...</p>
            </div>
        </div>
      )}

      {showOptions && (
        <div ref={optionsMenuRef} className="glass-ui absolute right-4 top-16 shadow-2xl rounded-2xl w-56 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
          <ul className="p-2 space-y-1">
            <li>
              <button onClick={handleShare} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors ${darkMode ? 'text-misionero-verde hover:bg-misionero-verde/10' : 'text-misionero-verde hover:bg-misionero-verde/5'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                <span>Compartir Enlace</span>
              </button>
            </li>
              <li>
              <button onClick={downloadAsPDF} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors ${darkMode ? 'text-misionero-rojo hover:bg-misionero-rojo/10' : 'text-misionero-rojo hover:bg-misionero-rojo/5'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                <span>Descargar PDF</span>
              </button>
            </li>
            {onEdit && (
              <li>
                <button onClick={() => { onEdit(); setShowOptions(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors ${darkMode ? 'text-misionero-azul hover:bg-misionero-azul/10' : 'text-misionero-azul hover:bg-misionero-azul/5'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  <span>Editar Música</span>
                </button>
              </li>
            )}
            {onDelete && (
              <>
                <div className={`h-px my-1 ${darkMode ? 'bg-slate-700/50' : 'bg-slate-200'}`}></div>
                <li>
                  <button onClick={() => { onDelete(); setShowOptions(false); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-500 hover:bg-red-500/10 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    <span>Eliminar</span>
                  </button>
                </li>
              </>
            )}
          </ul>
        </div>
      )}

      <div ref={scrollContainerRef} className={`flex-1 overflow-y-auto p-5 custom-scroll no-pull relative`}>
        {showShareToast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 glass-ui bg-misionero-verde/70 text-white px-6 py-2 rounded-full text-[10px] font-black uppercase shadow-2xl z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
            ¡Enlace copiado!
          </div>
        )}
        <div className={`leading-relaxed ${isChatVisible ? 'pb-40' : 'pb-24'}`}>{processedContent}</div>
      </div>
      
      {isChatVisible && chatInputComponent && (
        <div className="fixed bottom-0 left-0 right-0 z-[140] max-w-md mx-auto">
          {chatInputComponent}
        </div>
      )}

      {/* ... (PDF Modal code remains the same) ... */}
      {pdfConfirmModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPdfConfirmModal(false)}></div>
            <div className={`relative w-full max-w-sm p-6 rounded-[2.5rem] shadow-2xl border animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-black border-white/10' : 'bg-white border-slate-100'}`}>
                <h3 className={`text-center font-black text-lg uppercase mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Confirmar Descarga</h3>
                <p className={`text-center text-xs font-bold mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>¿Quieres descargar "{song.title}.pdf"?</p>
                <div className="flex gap-3">
                    <button onClick={() => setPdfConfirmModal(false)} className={`flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-colors ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>Cancelar</button>
                    <button onClick={handleConfirmDownload} className="flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-white shadow-lg active:scale-95 transition-transform bg-misionero-rojo">Descargar</button>
                </div>
            </div>
        </div>
      )}

      {/* --- Controles Flotantes --- */}

      <button 
        onClick={() => setIsControlPanelOpen(prev => !prev)} 
        className={`fixed z-[80] right-6 bottom-24 transition-all duration-300 ease-in-out active:scale-90 w-14 h-14 rounded-full flex items-center justify-center glass-ui glass-interactive text-white ${isControlPanelOpen ? 'bg-misionero-rojo/70 rotate-45' : 'bg-misionero-azul/70'}`}
      >
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6"/></svg>
      </button>

      {isControlPanelOpen && (
        <div className="fixed z-[79] right-6 bottom-40 w-40 p-1.5 rounded-2xl flex flex-col gap-1 glass-ui animate-in fade-in slide-in-from-bottom-4 duration-300">
          {!isTransposeLocked && (
            <>
              <div className="flex items-center justify-between px-1.5 pt-0.5">
                <span className="text-[8px] font-black uppercase text-slate-400">Tono</span>
                <button onClick={() => onTransposeChange ? onTransposeChange(0) : setInternalTranspose(0)} disabled={currentTranspose === 0} className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded transition-all ${currentTranspose !== 0 ? 'bg-misionero-rojo/20 text-misionero-rojo' : 'text-slate-400/50'}`}>0</button>
              </div>
              <div className="flex items-center justify-between p-1 rounded-lg">
                <button onClick={() => handleTransposeChange(-1)} className={`w-9 h-9 flex items-center justify-center rounded-full text-base font-bold ${darkMode ? 'bg-slate-800 active:bg-slate-700' : 'bg-slate-100 active:bg-slate-200'}`}>-</button>
                <span className={`text-lg font-black w-10 text-center ${darkMode ? 'text-misionero-amarillo' : 'text-misionero-azul'}`}>{currentTranspose > 0 ? `+${currentTranspose}` : currentTranspose}</span>
                <button onClick={() => handleTransposeChange(1)} className={`w-9 h-9 flex items-center justify-center rounded-full text-base font-bold ${darkMode ? 'bg-slate-800 active:bg-slate-700' : 'bg-slate-100 active:bg-slate-200'}`}>+</button>
              </div>
            </>
          )}

          {!isTransposeLocked && <div className={`h-px my-0.5 ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}></div>}
          
          <div className="flex items-center justify-between px-1.5 pt-0.5">
            <span className="text-[8px] font-black uppercase text-slate-400">Zoom</span>
            <button onClick={() => setFontSize(11)} disabled={fontSize === 11} className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded transition-all ${fontSize !== 11 ? 'bg-misionero-verde/20 text-misionero-verde' : 'text-slate-400/50'}`}>11</button>
          </div>
          <div className="flex items-center justify-between p-1 rounded-lg">
            <button onClick={() => adjustFontSize(-1)} className={`w-9 h-9 flex items-center justify-center rounded-full text-base font-bold ${darkMode ? 'bg-slate-800 active:bg-slate-700' : 'bg-slate-100 active:bg-slate-200'}`}>-</button>
            <span className="text-lg font-black w-10 text-center">{fontSize}</span>
            <button onClick={() => adjustFontSize(1)} className={`w-9 h-9 flex items-center justify-center rounded-full text-base font-bold ${darkMode ? 'bg-slate-800 active:bg-slate-700' : 'bg-slate-100 active:bg-slate-200'}`}>+</button>
          </div>
          <div className={`h-px my-0.5 ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}></div>
          <div className="flex items-center justify-between px-1.5 pt-0.5">
            <span className="text-[8px] font-black uppercase text-slate-400">Capo</span>
            <div className="flex items-center gap-1">
                 <button onClick={handleSuggestCapo} className={`p-1.5 rounded-md transition-colors ${darkMode ? 'text-misionero-amarillo/70 hover:bg-misionero-amarillo/20' : 'text-misionero-amarillo hover:bg-misionero-amarillo/10'}`}><MagicWandIcon /></button>
                 <button onClick={() => setCapo(0)} disabled={capo === 0} className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded transition-all ${capo !== 0 ? 'bg-misionero-azul/20 text-misionero-azul' : 'text-slate-400/50'}`}>0</button>
            </div>
          </div>
          <div className="flex items-center justify-between p-1 rounded-lg">
            <button onClick={() => handleCapoChange(-1)} className={`w-9 h-9 flex items-center justify-center rounded-full text-base font-bold ${darkMode ? 'bg-slate-800 active:bg-slate-700' : 'bg-slate-100 active:bg-slate-200'}`}>-</button>
            <span className="text-lg font-black w-10 text-center">{capo}</span>
            <button onClick={() => handleCapoChange(1)} className={`w-9 h-9 flex items-center justify-center rounded-full text-base font-bold ${darkMode ? 'bg-slate-800 active:bg-slate-700' : 'bg-slate-100 active:bg-slate-200'}`}>+</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SongViewer;
