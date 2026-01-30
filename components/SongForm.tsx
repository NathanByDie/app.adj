
import React, { useState, useEffect, useRef } from 'react';
import { LiturgicalTime, Song } from '../types';
import { isChordLine } from '../services/musicUtils';
import { importFromLaCuerda } from '../services/importer';

interface SongFormProps {
  initialData?: Song;
  onSave: (song: Omit<Song, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
  darkMode?: boolean;
  categories: string[];
  initialImportUrl?: string;
}

const SongForm: React.FC<SongFormProps> = ({ initialData, onSave, onCancel, darkMode = false, categories, initialImportUrl }) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [key, setKey] = useState('DO');
  const [category, setCategory] = useState<string>(LiturgicalTime.ORDINARIO);
  const [content, setContent] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const [showImporter, setShowImporter] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      setAuthor(initialData.author);
      setKey(initialData.key);
      setCategory(initialData.category);
      setContent(initialData.content);
    }
  }, [initialData]);

  useEffect(() => {
    if (initialImportUrl) {
      setShowImporter(true);
      setImportUrl(initialImportUrl);
    }
  }, [initialImportUrl]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => setShowScrollTop(container.scrollTop > 100);
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!isFocused) return;

    const viewport = window.visualViewport;
    if (!viewport) return;

    const handleResize = () => {
      const isKeyboardOpen = viewport.height < window.innerHeight - 150;
      setIsKeyboardVisible(isKeyboardOpen);
    };

    viewport.addEventListener('resize', handleResize);
    handleResize(); // Check initial state

    return () => viewport.removeEventListener('resize', handleResize);
  }, [isFocused]);

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content) return;
    onSave({ title, key, category, content, author });
  };
  
  const handleImport = async () => {
    if (!importUrl) return;
    setIsImporting(true);
    setImportError(null);
    try {
      const data = await importFromLaCuerda(importUrl);
      setTitle(data.title);
      setAuthor(data.author);
      setKey(data.key);
      setContent(data.content);
      setShowImporter(false);
      setImportUrl('');
    } catch (error: any) {
      setImportError(error.message || 'Ocurrió un error desconocido.');
    } finally {
      setIsImporting(false);
    }
  };


  const insertAtCursor = (text: string) => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const newContent = content.substring(0, start) + text + content.substring(end);
    setContent(newContent);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(start + text.length, start + text.length);
      }
    }, 0);
  };

  return (
    <div className={`fixed inset-0 ${darkMode ? 'bg-black text-white' : 'bg-white text-slate-900'} z-[250] flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 transition-colors duration-500`}>
      <header className={`px-4 pt-12 pb-3 border-b ${darkMode ? 'border-slate-800 bg-black' : 'border-slate-100 bg-white'} flex items-center justify-between shrink-0 z-20 transition-colors duration-500`}>
        <button onClick={onCancel} className={`text-[10px] font-black uppercase ${darkMode ? 'text-slate-500 bg-slate-900 active:bg-slate-800' : 'text-slate-400 bg-slate-50 active:bg-slate-100'} px-3 py-2 rounded-xl transition-colors`}>Cerrar</button>
        <h2 className="text-[10px] font-black uppercase tracking-widest">{initialData ? 'Editor de Obra' : 'Nueva Música'}</h2>
        <div className="flex items-center gap-2">
           <button type="button" onClick={() => setShowImporter(true)} className="bg-misionero-amarillo text-black px-4 py-2.5 rounded-2xl font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all">Importar</button>
           <button onClick={handleSubmit} className="bg-misionero-verde text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase disabled:opacity-30 shadow-lg active:scale-95 transition-all" disabled={!title || !content}>{initialData ? 'Guardar' : 'Publicar'}</button>
        </div>
      </header>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto flex flex-col custom-scroll no-pull">
        <div className={`px-5 py-6 space-y-6 transition-all duration-500 ${darkMode ? 'bg-black border-slate-800' : 'bg-white border-slate-50'} border-b ${isFocused ? 'max-h-0 opacity-0 pointer-events-none -translate-y-4' : 'max-h-[500px] opacity-100'}`}>
          <div className="space-y-1">
            <label className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Título de la Música</label>
            <input type="text" placeholder="Ej: Alma Misionera" className={`w-full text-2xl font-black border-none focus:ring-0 p-0 transition-colors duration-500 ${darkMode ? 'bg-transparent text-white placeholder:text-slate-800' : 'bg-transparent text-slate-900 placeholder:text-slate-200'}`} value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Autor</label>
            <input type="text" placeholder="Ej: P. Enrique" className={`w-full text-base font-bold border-none focus:ring-0 p-0 transition-colors duration-500 ${darkMode ? 'bg-transparent text-slate-300 placeholder:text-slate-800' : 'bg-transparent text-slate-600 placeholder:text-slate-300'}`} value={author} onChange={e => setAuthor(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-100'} rounded-2xl p-4 border transition-colors duration-500`}>
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-2">Tono</label>
              <input type="text" placeholder="Ej: SOL" className={`w-full ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-misionero-rojo'} rounded-xl px-3 py-2 text-sm font-black outline-none transition-colors uppercase`} value={key} onChange={e => setKey(e.target.value)} />
            </div>
            <div className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-100'} rounded-2xl p-4 border transition-colors duration-500`}>
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-2">Momento</label>
              <select className={`w-full ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-misionero-verde'} rounded-xl px-3 py-2 text-[10px] font-black outline-none appearance-none transition-colors`} value={category} onChange={e => setCategory(e.target.value)}>
                {categories.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className={`flex-1 flex flex-col transition-colors duration-500 ${darkMode ? 'bg-black' : 'bg-white'}`}>
          <div className={`flex items-center justify-between px-5 py-3 border-b transition-colors duration-500 ${darkMode ? 'border-slate-800 bg-slate-900/30' : 'border-slate-100 bg-slate-50/50'}`}>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Contenido Musical</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setIsFocused(!isFocused); if (!isFocused) setTimeout(() => textareaRef.current?.focus(), 150); }} className={`text-[8px] px-3 py-2 rounded-full font-black uppercase transition-all shadow-sm ${isFocused ? 'bg-misionero-rojo text-white' : darkMode ? 'bg-slate-800 border-slate-700 text-slate-500' : 'bg-white border-slate-200 text-slate-500'}`}>{isFocused ? 'Ver Datos' : 'Expandir'}</button>
              <button type="button" onClick={() => setShowPreview(!showPreview)} className={`text-[8px] px-3 py-2 rounded-full font-black uppercase transition-all shadow-sm ${showPreview ? 'bg-misionero-azul text-white' : darkMode ? 'bg-slate-800 border-slate-700 text-slate-500' : 'bg-white border-slate-200 text-slate-500'}`}>{showPreview ? 'Editar' : 'Preview'}</button>
            </div>
          </div>

          {showPreview ? (
            <div className={`p-5 min-h-[500px] animate-in fade-in duration-200 overflow-x-auto transition-colors duration-500 ${darkMode ? 'bg-black text-white' : 'bg-white text-slate-700'}`}>
              {content.split('\n').map((line, idx) => (
                <div key={idx} className={`${isChordLine(line) ? (darkMode ? 'text-misionero-amarillo neon-yellow' : 'text-misionero-azul neon-blue') : 'font-medium'} transition-colors duration-500 chord-font font-black text-[11px] leading-tight mb-1.5 whitespace-pre`}>
                  {line || '\u00A0'}
                </div>
              ))}
            </div>
          ) : (
            <div className="relative flex-1 flex flex-col min-h-[60vh]">
              <textarea ref={textareaRef} className={`flex-1 w-full chord-font text-[11px] border-none px-4 py-5 focus:ring-0 outline-none leading-[1.8] resize-none transition-all duration-500 ${darkMode ? 'bg-black text-white placeholder:text-slate-900' : 'bg-white text-slate-900 placeholder:text-slate-200'} ${isFocused ? 'pb-48' : 'pb-24'}`} placeholder="Escribe letra y acordes...&#10;DO           FA&#10;Señor ten piedad..." value={content} onChange={e => setContent(e.target.value)} onFocus={() => setIsFocused(true)} />
              {isFocused && (
                <div className={`fixed bottom-0 left-0 right-0 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} border-t p-2 flex gap-2 overflow-x-auto z-[100] shadow-[0_-15px_30px_rgba(0,0,0,0.15)] animate-in slide-in-from-bottom duration-300 transition-all ${isKeyboardVisible ? 'pb-[calc(0.5rem+env(safe-area-inset-bottom))]' : 'pb-[calc(1.5rem+env(safe-area-inset-bottom))]'}`}>
                  <div className="flex gap-2 px-2 items-center">
                    {['#', 'b', '/', 'm', '7', 'maj7', 'add9', 'sus4'].map(char => (<button key={char} type="button" onMouseDown={(e) => { e.preventDefault(); insertAtCursor(char); }} className={`${darkMode ? 'bg-slate-800 active:bg-misionero-azul text-white' : 'bg-slate-100 active:bg-misionero-azul'} px-5 py-4 rounded-2xl text-[10px] font-black uppercase shrink-0 transition-colors shadow-sm`}>{char}</button>))}
                    <div className={`w-px h-10 ${darkMode ? 'bg-slate-800' : 'bg-slate-200'} mx-1 shrink-0`}></div>
                    {['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'].map(note => (<button key={note} type="button" onMouseDown={(e) => { e.preventDefault(); insertAtCursor(note + ' '); }} className={`${darkMode ? 'bg-slate-800 border-slate-700 text-misionero-amarillo' : 'bg-white border-slate-200 text-misionero-azul'} px-5 py-4 rounded-2xl text-[10px] font-black uppercase shrink-0 transition-all shadow-sm`}>{note}</button>))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="h-40 shrink-0"></div>
      </div>
      {showScrollTop && !isFocused && (<button onClick={scrollToTop} className="fixed bottom-10 right-6 w-14 h-14 bg-misionero-azul text-white rounded-full shadow-2xl flex items-center justify-center z-[90] animate-in fade-in zoom-in duration-300 active:scale-90 border-4 border-white"><svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 15l7-7 7 7" /></svg></button>)}

      {showImporter && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isImporting && setShowImporter(false)}></div>
          <div className={`relative w-full max-w-sm p-6 rounded-[2.5rem] shadow-2xl border animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-black border-white/10' : 'bg-white border-slate-100'}`}>
            <h3 className={`text-center font-black text-lg uppercase mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Importar de LaCuerda.net</h3>
            <p className={`text-center text-xs font-bold mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Pega el enlace de la canción para rellenar los campos automáticamente.</p>
            <div className="space-y-3">
              <input 
                type="url" 
                placeholder="https://acordes.lacuerda.net/..." 
                value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
                className={`w-full text-xs font-bold rounded-xl px-4 py-3 outline-none transition-colors ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-100 border-slate-200 text-slate-900'}`}
              />
              {importError && <p className="text-center text-xs font-bold text-red-400">{importError}</p>}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowImporter(false)} disabled={isImporting} className={`flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-colors ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>Cancelar</button>
              <button onClick={handleImport} disabled={isImporting || !importUrl} className="flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-white shadow-lg active:scale-95 transition-transform bg-misionero-azul disabled:opacity-50">
                {isImporting ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SongForm;
