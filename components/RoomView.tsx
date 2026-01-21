import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Room, Song, ChatMessage, LiturgicalTime } from '../types';
import SongViewer from './SongViewer';
import { 
  collection, 
  query, 
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { Firestore } from 'firebase/firestore';

interface RoomViewProps {
  room: Room;
  songs: Song[];
  currentUser: string;
  isAdmin: boolean;
  onExit: () => void;
  onUpdateRoom: (room: Room) => void;
  darkMode?: boolean;
  db: Firestore;
  ADMIN_EMAILS: string[];
  onEditSong: (song: Song) => void;
  onDeleteSong: (songId: string) => void;
}

interface Notification {
  id: number;
  message: string;
  type: 'info' | 'success' | 'alert';
}

interface SwipeableMessageProps {
  msg: ChatMessage;
  currentUser: string;
  onReply: (msg: ChatMessage) => void;
  darkMode: boolean;
  formatTime: (time: number) => string;
}

const CrownIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-4 h-4"} viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.14,6.21,15,7.35,12,2,9,7.35,4.86,6.21,4,18H20Z"></path>
    </svg>
);

const DoorIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-4 h-4"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
);

const BanIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-4 h-4"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
);

const DragHandleIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
    </svg>
);

// Componente para mensajes deslizables
const SwipeableMessage: React.FC<SwipeableMessageProps> = ({ msg, currentUser, onReply, darkMode, formatTime }) => {
  const [translateX, setTranslateX] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const isMe = msg.sender === currentUser;

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const currentX = e.targetTouches[0].clientX;
    const diff = currentX - touchStartX.current;
    
    if (isMe) {
        // Deslizar a la izquierda para mensajes propios (valores negativos)
        if (diff < 0 && diff > -100) {
             setTranslateX(diff);
        }
    } else {
        // Deslizar a la derecha para mensajes ajenos (valores positivos)
        if (diff > 0 && diff < 100) {
            setTranslateX(diff);
        }
    }
  };

  const onTouchEnd = () => {
    if (Math.abs(translateX) > 50) {
      // Umbral superado, activar respuesta
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate(20); } catch(e) {}
      }
      onReply(msg);
    }
    setTranslateX(0);
    touchStartX.current = null;
  };

  return (
    <div 
      className={`relative flex flex-col ${isMe ? 'items-end' : 'items-start'} select-none w-full`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
        {/* Indicador de respuesta */}
        <div 
            className={`absolute top-1/2 -translate-y-1/2 text-slate-400 transition-opacity duration-300 flex items-center ${isMe ? 'right-0' : 'left-0'}`}
            style={{ 
                opacity: Math.abs(translateX) > 10 ? Math.min(Math.abs(translateX) / 50, 1) : 0, 
                transform: isMe ? `translateX(20px)` : `translateX(-20px)`
            }}
        >
            <svg className={`w-5 h-5 ${isMe ? 'scale-x-[-1]' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
        </div>

        <div 
            className="transition-transform duration-150 ease-out max-w-[85%]"
            style={{ transform: `translateX(${translateX}px)` }}
        >
            <div className={`p-3.5 rounded-2xl shadow-sm ${isMe ? 'bg-misionero-azul text-white' : (darkMode ? 'bg-slate-800 text-slate-200 border border-white/5' : 'bg-slate-100 text-slate-700')}`}>
                <p className="text-sm font-medium leading-tight whitespace-pre-wrap">{msg.text}</p>
            </div>
            <div className="flex items-center gap-1.5 mt-1 px-1">
                <span className={`text-[8px] font-black uppercase ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>{msg.sender}</span>
                <span className={`text-[8px] font-black uppercase ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>{formatTime(msg.timestamp)}</span>
            </div>
        </div>
    </div>
  );
};

const RoomView: React.FC<RoomViewProps> = ({ 
    room, songs, currentUser, isAdmin, onExit, onUpdateRoom, darkMode = false, db, ADMIN_EMAILS,
    onEditSong, onDeleteSong
}) => {
  // IMPORTANTE: Inicializar en null para forzar la ejecución del efecto de sincronización y gestionar el historial correctamente
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const isTheHost = currentUser === room.host;
  const canModify = isAdmin || isTheHost;

  const [isEditingRepertoire, setIsEditingRepertoire] = useState(room.repertoire.length === 0 && canModify);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showParticipants, setShowParticipants] = useState(false);
  const [copied, setCopied] = useState(false);
  const [participantDetails, setParticipantDetails] = useState<Record<string, { isAdmin: boolean }>>({});

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<{sender: string, text: string} | null>(null);

  const [chatToast, setChatToast] = useState<{ sender: string; text: string; id: number } | null>(null);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const toastExitTimerRef = useRef<number | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  
  const [isFollowingHost, setIsFollowingHost] = useState(true);
  const [addSongFilter, setAddSongFilter] = useState<LiturgicalTime | 'Todos'>('Todos');

  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ index: number; position: 'before' | 'after' } | null>(null);
  
  // Estado para el modal de confirmación
  const [confirmModal, setConfirmModal] = useState<{ title: string, message: string, action: () => void, type: 'danger' | 'warning' } | null>(null);

  const prevParticipants = useRef<string[]>(room.participants || []);
  const prevChatLength = useRef<number>(room.chat?.length || 0);
  const notificationAudio = useRef<HTMLAudioElement | null>(null);
  
  // Inicializamos en undefined para que el primer valor que llegue (aunque sea el mismo que el actual)
  // dispare la sincronización inicial.
  const lastSyncedHostSongId = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Listener para cerrar canción al dar atrás
    const handler = () => setSelectedSongId(null);
    window.addEventListener('closeRoomSong', handler);
    return () => window.removeEventListener('closeRoomSong', handler);
  }, []);

  // Manejo de historial para el Chat
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
        if (event.state?.overlay === 'chat') {
            setIsChatOpen(true);
        } else {
            // Si estamos navegando y el estado ya no es 'chat', cerramos el modal
            setIsChatOpen(false);
        }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openChat = () => {
    if (!isChatOpen) {
        window.history.pushState({ overlay: 'chat' }, '', '');
        setIsChatOpen(true);
    }
  };

  const closeChat = () => {
      // Usamos back para quitar el estado 'chat' del historial, lo cual disparará el useEffect
      window.history.back();
  };

  useEffect(() => {
    try {
      notificationAudio.current = new Audio("https://firebasestorage.googleapis.com/v0/b/adjstudios.firebasestorage.app/o/notificacion-adj.mp3?alt=media&token=8e9b60b7-9571-460b-857c-658a0a8616a2");
      notificationAudio.current.load();
    } catch (e) {
      console.error("Audio init failed", e);
    }
  }, []);

  useEffect(() => {
    const currentChat = room.chat || [];
    if (currentChat.length > prevChatLength.current) {
      const lastMsg = currentChat[currentChat.length - 1];
      if (lastMsg.sender !== currentUser) {
        
        // 1. Audio Playback
        if (notificationAudio.current) {
          notificationAudio.current.currentTime = 0;
          notificationAudio.current.play().catch(e => console.log("Audio play blocked by browser"));
        }
        
        // 2. Vibration API (200ms pattern for notification)
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
                navigator.vibrate(200); 
            } catch (e) {
                console.error("Vibration failed", e);
            }
        }
        
        if (!isChatOpen) {
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          if (toastExitTimerRef.current) clearTimeout(toastExitTimerRef.current);

          const newToast = { sender: lastMsg.sender, text: lastMsg.text, id: Date.now() };
          setChatToast(newToast);
          
          requestAnimationFrame(() => {
              setIsToastVisible(true);
          });

          toastTimerRef.current = window.setTimeout(() => {
              setIsToastVisible(false);
              toastExitTimerRef.current = window.setTimeout(() => {
                  setChatToast(prev => (prev?.id === newToast.id ? null : prev));
              }, 500);
          }, 4000);
        }
      }
    }
    prevChatLength.current = currentChat.length;
  }, [room.chat, currentUser, isChatOpen]);

  const repertoireSongsMap = useMemo(() => {
    const map: Record<string, Song> = {};
    room.repertoire.forEach(id => {
      const s = songs.find(song => song.id === id);
      if (s) map[id] = s;
    });
    return map;
  }, [room.repertoire, songs]);

  useEffect(() => {
    if (room.participants && !room.participants.includes(currentUser)) {
      onExit();
    }
  }, [room.participants, currentUser, onExit]);

  // Lógica de Sincronización Mejorada con Manejo de Historial
  useEffect(() => {
    if (!isTheHost && isFollowingHost) {
      const targetSongId = room.currentSongId || '';

      // Si la canción del host ha cambiado desde la última vez que sincronizamos, actualizamos.
      // Esto evita forzar al usuario a entrar a una canción de la que acaba de salir si el host no la ha cambiado.
      if (targetSongId !== lastSyncedHostSongId.current) {
        
        lastSyncedHostSongId.current = targetSongId;
        
        // CASO 1: El Host abrió una nueva canción y nosotros estamos en la lista
        if (targetSongId && !selectedSongId) {
            window.history.pushState({ overlay: 'room_song' }, '', '');
            setSelectedSongId(targetSongId);
        } 
        
        // CASO 2: El Host cambió de canción A a canción B (ya estamos dentro de 'room_song')
        else if (targetSongId && selectedSongId) {
            setSelectedSongId(targetSongId);
        } 
        
        // CASO 3: El Host cerró la canción (volvió a la lista) y nosotros la tenemos abierta
        else if (!targetSongId && selectedSongId) {
            window.history.back();
        }
      }
    }
  }, [room.currentSongId, isFollowingHost, isTheHost, selectedSongId]);

  useEffect(() => {
    if (!db || !room.participants || room.participants.length === 0) return;
    const fetchParticipantDetails = async () => {
        const usersRef = collection(db, "users");
        const participantsToFetch = room.participants.slice(0, 30);
        const q = query(usersRef, where("username", "in", participantsToFetch));
        try {
            const querySnapshot = await getDocs(q);
            const details: Record<string, { isAdmin: boolean }> = {};
            querySnapshot.forEach(doc => {
                const userData = doc.data();
                const userIsAdmin = userData.role === 'admin' || (userData.email && ADMIN_EMAILS.includes(userData.email.toLowerCase()));
                details[userData.username] = { isAdmin: userIsAdmin };
            });
            setParticipantDetails(details);
        } catch (error) {
            console.error("Error fetching details:", error);
        }
    };
    fetchParticipantDetails();
  }, [db, room.participants, ADMIN_EMAILS]);

  const addNotification = (message: string, type: Notification['type'] = 'info') => {
    const id = Date.now() + Math.random();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [room.chat, isChatOpen]);

  useEffect(() => {
    if (isChatOpen && chatInputRef.current) {
        setTimeout(() => chatInputRef.current?.focus(), 100);
    }
  }, [isChatOpen]);

  useEffect(() => {
    const currentParts = room.participants || [];
    
    // Detectar múltiples entradas a la vez
    if (currentParts.length > prevParticipants.current.length) {
      const newUsers = currentParts.filter(p => !prevParticipants.current.includes(p));
      newUsers.forEach(u => {
         if (u !== currentUser) addNotification(`${u} se ha unido`, 'success');
      });
    } 
    // Detectar múltiples salidas a la vez
    else if (currentParts.length < prevParticipants.current.length) {
      const leftUsers = prevParticipants.current.filter(p => !currentParts.includes(p));
      leftUsers.forEach(u => {
         addNotification(`${u} ha salido`, 'alert');
      });
    }
    prevParticipants.current = currentParts;
  }, [room.participants, currentUser]);

  const handleExitRoom = async () => {
    const updatedParticipants = (room.participants || []).filter(p => p !== currentUser);
    onUpdateRoom({ ...room, participants: updatedParticipants });
    onExit();
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const navigateToSong = (songId: string | null) => {
    const isAlreadyViewingSong = selectedSongId !== null;

    if (isTheHost) {
      lastSyncedHostSongId.current = songId || '';
      setSelectedSongId(songId);
      onUpdateRoom({ ...room, currentSongId: songId || '' });
      
      if (songId) {
        if (isAlreadyViewingSong) {
            // Reemplazar estado para no acumular historial
            window.history.replaceState({ overlay: 'room_song' }, '', '');
        } else {
            // Crear nueva entrada solo si venimos de la lista
            window.history.pushState({ overlay: 'room_song' }, '', '');
        }
      }
    } else {
      setSelectedSongId(songId);
      if (isFollowingHost && songId) {
        lastSyncedHostSongId.current = songId;
      }
      if (songId) {
         if (isAlreadyViewingSong) {
            window.history.replaceState({ overlay: 'room_song' }, '', '');
         } else {
            window.history.pushState({ overlay: 'room_song' }, '', '');
         }
      }
    }
  };

  const toggleFollowing = () => { setIsFollowingHost(prev => !prev); };
  
  const handleMakeHost = (newHostUsername: string) => {
    if (!isTheHost) return;
    setConfirmModal({
        title: 'Transferir Host',
        message: `¿Estás seguro de ceder el liderazgo a ${newHostUsername}? Perderás el control de la sala.`,
        type: 'warning',
        action: () => {
            onUpdateRoom({ ...room, host: newHostUsername });
            addNotification(`${newHostUsername} es ahora el Host`, 'success');
        }
    });
  };

  const handleKickParticipant = (username: string) => {
    if (!isTheHost) return;
    setConfirmModal({
        title: 'Expulsar Miembro',
        message: `¿Deseas sacar a ${username} de la sala? Podrá volver a entrar con el código.`,
        type: 'danger',
        action: () => {
            const updatedParticipants = (room.participants || []).filter(p => p !== username);
            onUpdateRoom({ ...room, participants: updatedParticipants });
            addNotification(`${username} ha sido expulsado`, 'alert');
        }
    });
  };

  const handleBanParticipant = (username: string) => {
    if (!isTheHost) return;
    setConfirmModal({
        title: 'Bloquear Usuario',
        message: `¿Bloquear permanentemente a ${username}? No podrá volver a ingresar a esta sala.`,
        type: 'danger',
        action: () => {
            const updatedParticipants = (room.participants || []).filter(p => p !== username);
            const updatedBanned = [...(room.banned || []), username];
            onUpdateRoom({ ...room, participants: updatedParticipants, banned: updatedBanned });
            addNotification(`${username} ha sido bloqueado`, 'alert');
        }
    });
  };

  const addSongToRepertoire = (songId: string) => {
    if (!canModify) return;
    if (!room.repertoire.includes(songId)) {
      onUpdateRoom({ 
        ...room, 
        repertoire: [...room.repertoire, songId],
        globalTranspositions: { ...(room.globalTranspositions || {}), [songId]: 0 }
      });
    }
  };

  const removeSongFromRepertoire = (songId: string) => {
    if (!canModify) return;
    const newTranspositions = { ...(room.globalTranspositions || {}) };
    delete newTranspositions[songId];
    onUpdateRoom({ 
      ...room, 
      repertoire: room.repertoire.filter(id => id !== songId),
      globalTranspositions: newTranspositions
    });
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggingIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    if (draggingIndex === null || draggingIndex === index) {
      setDropIndicator(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    if (e.clientY < midpoint) {
      setDropIndicator({ index, position: 'before' });
    } else {
      setDropIndicator({ index, position: 'after' });
    }
  };

  const handleDrop = () => {
    if (draggingIndex === null || dropIndicator === null) return;

    const newRepertoire = [...room.repertoire];
    const [draggedItem] = newRepertoire.splice(draggingIndex, 1);
    
    let insertIndex = dropIndicator.index;
    if (dropIndicator.position === 'after') {
      insertIndex++;
    }
    if (draggingIndex < insertIndex) {
      insertIndex--;
    }

    newRepertoire.splice(insertIndex, 0, draggedItem);
    onUpdateRoom({ ...room, repertoire: newRepertoire });
  };
  
  const handleDragEnd = () => {
    setDraggingIndex(null);
    setDropIndicator(null);
  };
  
  const handleGlobalTranspose = (songId: string, newSemiTones: number) => {
    if (!canModify) return;
    onUpdateRoom({ ...room, globalTranspositions: { ...(room.globalTranspositions || {}), [songId]: newSemiTones } });
  };

  const handleReply = (msg: ChatMessage) => {
    setReplyingTo({ sender: msg.sender, text: msg.text });
    openChat();
    // Enfocar el input
    setTimeout(() => {
        chatInputRef.current?.focus();
    }, 100);
  };

  const handleSendMessage = () => {
    if (chatMessage.trim() === '') return;
    
    let textToSend = chatMessage;
    if (replyingTo) {
        textToSend = `> @${replyingTo.sender}: ${replyingTo.text.length > 30 ? replyingTo.text.substring(0, 30) + '...' : replyingTo.text}\n${chatMessage}`;
    }

    const newMessage: ChatMessage = { sender: currentUser, text: textToSend, timestamp: Date.now() };
    onUpdateRoom({ ...room, chat: [...(room.chat || []), newMessage] });
    setChatMessage('');
    setReplyingTo(null);
  };

  const filteredSongsForHost = useMemo(() => {
    return songs.filter(s => {
      const notInRepertoire = !room.repertoire.includes(s.id);
      const matchesSearch = s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           s.author.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = addSongFilter === 'Todos' || s.category === addSongFilter;
      return notInRepertoire && matchesSearch && matchesFilter;
    });
  }, [songs, room.repertoire, searchQuery, addSongFilter]);

  const songForViewer = useMemo(() => {
    if (!selectedSongId) return null;
    return repertoireSongsMap[selectedSongId] || songs.find(s => s.id === selectedSongId);
  }, [selectedSongId, repertoireSongsMap, songs]);

  const currentSongIndex = selectedSongId ? room.repertoire.indexOf(selectedSongId) : -1;
  const hasPrevSong = currentSongIndex > 0;
  const hasNextSong = currentSongIndex >= 0 && currentSongIndex < room.repertoire.length - 1;

  const formatMessageTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    });
  };

  const chatInputArea = (
    <div className={`px-3 pt-3 border-t shrink-0 ${darkMode ? 'border-white/5 bg-slate-950' : 'border-slate-100 bg-white'} pb-[calc(0.25rem+env(safe-area-inset-bottom))]`}>
        {replyingTo && (
            <div className={`flex items-center justify-between px-4 py-2 mb-2 rounded-xl text-xs font-medium border-l-4 border-misionero-azul ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-600'}`}>
                <span className="truncate">Respondiendo a <b>{replyingTo.sender}</b></span>
                <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-black/10 rounded-full"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex gap-2 items-center w-full">
             {!isChatOpen && (
                <button 
                  type="button" 
                  onClick={openChat} 
                  className={`w-12 h-12 flex items-center justify-center rounded-2xl border shrink-0 transition-colors ${darkMode ? 'bg-slate-900 border-white/5 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </button>
             )}
            <input 
                ref={chatInputRef}
                type="text" 
                value={chatMessage} 
                onChange={e => setChatMessage(e.target.value)} 
                placeholder="Mensaje..." 
                className={`flex-1 min-w-0 rounded-2xl px-4 py-3.5 text-sm font-bold outline-none border transition-all ${darkMode ? 'bg-slate-900 border-white/5 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} 
            />
            <button type="submit" disabled={!chatMessage.trim()} className="bg-misionero-verde text-white font-black w-12 h-12 rounded-2xl text-[10px] uppercase shadow-md active:scale-95 transition-transform disabled:opacity-30 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
        </form>
    </div>
  );

  return (
    <div className={`flex flex-col h-full transition-colors duration-500 ${darkMode ? 'bg-slate-950 text-white' : 'bg-white text-slate-900'} animate-in fade-in duration-300 overflow-hidden relative`}>
      <div className="fixed top-28 left-1/2 -translate-x-1/2 z-[200] w-full max-w-xs flex flex-col items-center gap-2 pointer-events-none px-4">
        {chatToast && (
          <div
            key={chatToast.id}
            onClick={openChat}
            className={`
              pointer-events-auto transition-all duration-300 ease-out cursor-pointer active:scale-95
              ${isToastVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full'}
            `}
          >
            <div
              className={`
                rounded-2xl shadow-2xl border p-4
                ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
                transition-all duration-500 ease-in-out
                ${isToastVisible ? 'w-full max-w-xs' : 'w-32 h-10 overflow-hidden'}
              `}
            >
              <div className={`transition-opacity duration-300 delay-200 ${isToastVisible ? 'opacity-100' : 'opacity-0'}`}>
                <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  <span className="font-black uppercase text-[10px] text-misionero-amarillo">{chatToast.sender}:</span>
                  <span className="ml-2">{chatToast.text}</span>
                </p>
                <p className="text-[9px] text-slate-400 mt-1 text-right italic">Toca para responder</p>
              </div>
            </div>
          </div>
        )}
        {notifications.map(n => (
          <div key={n.id} className={`p-3 rounded-2xl shadow-2xl border flex items-center gap-3 animate-in slide-in-from-top-4 duration-300 pointer-events-auto ${
            n.type === 'success' ? 'bg-misionero-verde/90' : n.type === 'alert' ? 'bg-misionero-rojo/90' : 'bg-misionero-azul/90'
          }`}>
            <p className="text-[10px] font-black uppercase text-white leading-tight">{n.message}</p>
          </div>
        ))}
      </div>

      {/* MODAL DE CONFIRMACIÓN */}
      {confirmModal && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 animate-in fade-in duration-200">
           <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmModal(null)}></div>
           <div className={`relative w-full max-w-sm p-6 rounded-[2rem] shadow-2xl border animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-100'}`}>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto ${confirmModal.type === 'danger' ? 'bg-misionero-rojo/10 text-misionero-rojo' : 'bg-misionero-amarillo/10 text-misionero-amarillo'}`}>
                 {confirmModal.type === 'danger' ? (
                   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                 ) : (
                   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                 )}
              </div>
              <h3 className={`text-center font-black text-lg uppercase mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{confirmModal.title}</h3>
              <p className={`text-center text-xs font-bold mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{confirmModal.message}</p>
              <div className="flex gap-3">
                  <button onClick={() => setConfirmModal(null)} className={`flex-1 py-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-transform ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>Cancelar</button>
                  <button onClick={() => { confirmModal.action(); setConfirmModal(null); }} className={`flex-1 py-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-transform ${confirmModal.type === 'danger' ? 'bg-misionero-rojo text-white' : 'bg-misionero-azul text-white'}`}>Confirmar</button>
              </div>
           </div>
        </div>
      )}

      {showParticipants && (
        <div className="fixed inset-0 z-[250] flex items-start justify-center pt-24 px-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowParticipants(false)}></div>
          <div className={`relative w-full max-w-xs rounded-[2.5rem] shadow-2xl border p-6 animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-100'}`}>
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-misionero-amarillo">Participantes</h4>
              <button onClick={() => setShowParticipants(false)} className={`w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'bg-white/5 text-white' : 'bg-slate-100 text-slate-400'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="space-y-3 max-h-[40vh] overflow-y-auto custom-scroll pr-2">
              {(room.participants || []).map((p, idx) => {
                const isCurrentParticipantHost = p === room.host;
                const userIsAdmin = participantDetails[p]?.isAdmin || false;
                return (
                <div key={idx} className={`flex items-center justify-between p-3 rounded-2xl ${darkMode ? 'bg-white/5' : 'bg-slate-50'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full animate-pulse ${p === currentUser ? 'bg-misionero-verde' : 'bg-slate-500'}`}></div>
                    <span className="text-xs font-black uppercase truncate max-w-[100px]">{p}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {isCurrentParticipantHost && (
                        <span className="text-[7px] font-black bg-misionero-amarillo text-slate-900 px-2 py-0.5 rounded-full uppercase flex items-center gap-1"><CrownIcon className="w-2.5 h-2.5"/>Host</span>
                    )}
                    {userIsAdmin && !isCurrentParticipantHost && (
                      <span className="text-[7px] font-black bg-misionero-rojo text-white px-2 py-0.5 rounded-full uppercase">Admin</span>
                    )}
                    {isTheHost && !isCurrentParticipantHost && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleMakeHost(p)} title="Ceder Host" className={`p-1.5 rounded-full active:scale-95 transition-all ${darkMode ? 'text-slate-500 hover:text-misionero-amarillo bg-slate-800' : 'text-slate-400 hover:text-misionero-amarillo bg-slate-100'}`}><CrownIcon className="w-3 h-3" /></button>
                        <button onClick={() => handleKickParticipant(p)} title="Sacar" className={`p-1.5 rounded-full active:scale-95 transition-all ${darkMode ? 'text-slate-500 hover:text-misionero-azul bg-slate-800' : 'text-slate-400 hover:text-misionero-azul bg-slate-100'}`}><DoorIcon className="w-3 h-3" /></button>
                        <button onClick={() => handleBanParticipant(p)} title="Banear" className={`p-1.5 rounded-full active:scale-95 transition-all ${darkMode ? 'text-slate-500 hover:text-misionero-rojo bg-slate-800' : 'text-slate-400 hover:text-misionero-rojo bg-slate-100'}`}><BanIcon className="w-3 h-3" /></button>
                      </div>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!songForViewer && (
        <header className={`pt-14 pb-10 px-5 relative shrink-0 transition-colors duration-500 ${darkMode ? 'bg-slate-900' : 'bg-misionero-azul text-white'}`}>
          <div className="absolute top-12 right-5 z-30 flex items-center gap-2">
            
            <button onClick={() => setShowParticipants(true)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border active:scale-95 transition-all ${darkMode ? 'bg-black/40 border-white/5' : 'bg-black/20 border-white/10'}`}>
                <svg className={`w-3 h-3 ${darkMode ? 'text-misionero-amarillo' : 'text-white'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                <span className={`text-[10px] font-black ${darkMode ? 'text-misionero-amarillo' : 'text-white'}`}>{(room.participants || []).length}</span>
            </button>
            <button onClick={handleExitRoom} className="bg-misionero-rojo text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg active:scale-95 transition-transform">SALIR</button>
          </div>
          <div className="relative z-10">
            <h2 className="font-black text-2xl tracking-tighter uppercase italic mb-1">GUION DE MISA</h2>
            <div className="flex items-center gap-3" onClick={handleCopyCode}>
              <div className={`px-3 py-1.5 rounded-full border flex items-center gap-2 cursor-pointer active:scale-95 transition-all ${darkMode ? 'bg-slate-800 border-white/5' : 'bg-white/20 border-white/10'}`}>
                <p className={`text-[10px] font-black uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-white'}`}>CÓDIGO: {room.code}</p>
                <svg className={`w-3 h-3 ${darkMode ? 'text-slate-500' : 'text-white/50'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
              </div>
              {copied && <span className="text-[8px] font-black uppercase animate-bounce text-misionero-amarillo">Copiado!</span>}
            </div>
          </div>
        </header>
      )}

      <div className={`flex-1 overflow-y-auto px-5 py-8 space-y-8 relative z-20 pb-40 transition-colors duration-500 ${!songForViewer ? `rounded-t-[2.5rem] -mt-8 ${darkMode ? 'bg-slate-950' : 'bg-slate-50'}` : ''}`}>
        {(!isEditingRepertoire || !canModify) && !songForViewer && (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-5 px-1">
              <h3 className="text-[10px] font-black text-misionero-amarillo uppercase tracking-[0.2em]">Repertorio ({room.repertoire.length})</h3>
              <div className="flex items-center gap-2">
                {isTheHost ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-misionero-rojo/20 text-misionero-rojo text-[9px] font-black">
                     <div className="w-2 h-2 bg-misionero-rojo rounded-full animate-pulse"></div>
                     <span>EN VIVO</span>
                  </div>
                ) : (
                  <button onClick={toggleFollowing} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase transition-colors ${isFollowingHost ? 'bg-misionero-verde text-white' : (darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500')}`}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d={isFollowingHost ? "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 105.656 5.656l1.102-1.101M10 14l2-2m-2 2l-2-2" : "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"}/></svg>
                    <span>{isFollowingHost ? 'Siguiendo' : 'Libre'}</span>
                  </button>
                )}
                {canModify && (
                  <button onClick={() => setIsEditingRepertoire(true)} className={`text-[9px] font-black px-3 py-1 rounded-lg uppercase transition-colors ${darkMode ? 'text-slate-400 bg-white/5' : 'text-slate-500 bg-black/5'}`}>ORGANIZAR</button>
                )}
              </div>
            </div>
            <div className="space-y-3">
              {room.repertoire.length === 0 ? (
                <div className={`text-center py-16 border-2 rounded-[2.5rem] border-dashed transition-colors ${darkMode ? 'border-white/5' : 'border-slate-200'}`}>
                  <p className="font-black uppercase text-[11px] text-slate-500">REPERTORIO VACÍO</p>
                </div>
              ) : (
                room.repertoire.map((songId, idx) => {
                  const song = repertoireSongsMap[songId];
                  const tValue = room.globalTranspositions?.[songId] || 0;
                  const isHostHere = room.currentSongId === songId;

                  return (
                    <div 
                      key={songId} 
                      onClick={() => navigateToSong(songId)} 
                      className={`
                        flex items-center justify-between p-4 border rounded-2xl active:scale-[0.98] transition-all duration-300 relative
                        ${selectedSongId === songId ? 'border-misionero-amarillo shadow-lg' : (darkMode ? 'bg-slate-900 border-white/5 text-white' : 'bg-white border-slate-100 text-slate-900')}
                        ${isHostHere ? `ring-2 ring-misionero-rojo ring-offset-2 ${darkMode ? 'ring-offset-slate-950' : 'ring-offset-slate-50'}` : ''}
                      `}
                    >
                      <div className="flex items-center gap-4 flex-1 truncate">
                        <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center font-black text-xs text-white transition-colors ${isHostHere ? 'bg-misionero-rojo animate-pulse' : 'bg-misionero-verde'}`}>
                            {idx + 1}
                        </div>
                        <div className="truncate">
                          <h4 className="font-black text-xs uppercase truncate">{song?.title || 'Cargando...'}</h4>
                          {tValue !== 0 && (
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${darkMode ? 'bg-misionero-amarillo/20 text-misionero-amarillo' : 'bg-misionero-azul/20 text-misionero-azul'}`}>T {tValue > 0 ? `+${tValue}` : tValue}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <span className={`text-[10px] font-black block uppercase ${darkMode ? 'text-misionero-amarillo' : 'text-misionero-rojo'}`}>{song?.key}</span>
                        {isHostHere && <span className="text-[7px] font-bold text-misionero-rojo uppercase tracking-wider block mt-0.5">En Vivo</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {canModify && isEditingRepertoire && (
           <section className={`p-6 rounded-[2.5rem] border animate-in fade-in transition-colors duration-500 ${darkMode ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-100 shadow-xl'}`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-[10px] font-black uppercase ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Organizar Guion</h3>
              <button onClick={() => setIsEditingRepertoire(false)} className="bg-misionero-verde text-white px-5 py-2 rounded-xl text-[10px] font-black active:scale-95 transition-transform">LISTO</button>
            </div>
            <div className="space-y-2">
              {room.repertoire.map((songId, index) => {
                const song = repertoireSongsMap[songId];
                const isDragging = draggingIndex === index;
                
                let dropIndicatorClass = '';
                if (dropIndicator && dropIndicator.index === index) {
                    if (dropIndicator.position === 'before') {
                        dropIndicatorClass = 'before:absolute before:top-[-4px] before:left-2 before:right-2 before:h-1 before:bg-misionero-azul before:rounded-full';
                    } else {
                        dropIndicatorClass = 'after:absolute after:bottom-[-4px] after:left-2 after:right-2 after:h-1 after:bg-misionero-azul after:rounded-full';
                    }
                }
                
                return (
                  <div
                    key={songId}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    onDragLeave={() => setDropIndicator(null)}
                    className={`relative flex items-center justify-between p-2 pl-3 rounded-xl border transition-all duration-200 ${
                      isDragging ? 'opacity-30' : 'opacity-100'
                    } ${darkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'} ${dropIndicatorClass}`}
                  >
                    <div className="flex items-center gap-3 truncate flex-1">
                       <div className={`${darkMode ? 'text-slate-600' : 'text-slate-400'} cursor-grab active:cursor-grabbing`}>
                          <DragHandleIcon className="w-5 h-5" />
                       </div>
                       <span className="text-[10px] font-black uppercase truncate">{song?.title}</span>
                    </div>
                    <div className="flex items-center">
                      <button onClick={() => removeSongFromRepertoire(songId)} className="text-misionero-rojo p-2 active:scale-90"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={`pt-6 mt-6 border-t transition-colors ${darkMode ? 'border-white/10' : 'border-slate-100'}`}>
              <h3 className={`text-[10px] font-black uppercase mb-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Añadir al Repertorio</h3>
              <input type="text" placeholder="BUSCAR POR TÍTULO O AUTOR..." className={`w-full rounded-2xl px-4 py-3 text-[10px] font-black uppercase outline-none mb-3 transition-colors ${darkMode ? 'bg-slate-950 border-white/5 text-white' : 'bg-slate-100 border-slate-200 text-slate-900'}`} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              <div className="flex gap-2 overflow-x-auto pb-4 pt-1 custom-scroll">
                {['Todos', ...Object.values(LiturgicalTime)].map(f => (
                  <button key={f} onClick={() => setAddSongFilter(f as any)} className={`px-5 py-2 rounded-full text-[9px] font-black uppercase shrink-0 transition-all ${addSongFilter === f ? 'bg-misionero-azul text-white' : darkMode ? 'bg-slate-900 text-slate-500' : 'bg-slate-50 text-slate-400'}`}>{f}</button>
                ))}
              </div>
              <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scroll pr-1">
                {filteredSongsForHost.map(song => (
                  <button key={song.id} onClick={() => addSongToRepertoire(song.id)} className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between transition-colors ${darkMode ? 'bg-slate-800/50 hover:bg-slate-800' : 'bg-slate-100 hover:bg-slate-200'}`}>
                    <div>
                      <span className="text-xs font-black uppercase truncate block">{song.title}</span>
                      <span className="text-[8px] font-bold text-slate-500">{song.category}</span>
                    </div>
                    <span className="text-misionero-verde font-black text-xs">+</span>
                  </button>
                ))}
                {filteredSongsForHost.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-[10px] font-black uppercase text-slate-500">No se encontraron canciones</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      <div className={`fixed bottom-0 left-0 right-0 z-[120] max-w-md mx-auto`}>
          {!isChatOpen && chatInputArea}
      </div>

      {songForViewer && (
        <div className={`fixed inset-0 z-[110] ${darkMode ? 'bg-slate-950' : 'bg-white'} flex flex-col animate-in slide-in-from-bottom-2`}>
          <div className="flex-1 overflow-hidden flex flex-col">
            <SongViewer 
              song={songForViewer} 
              onBack={() => window.history.back()} 
              externalTranspose={room.globalTranspositions?.[songForViewer.id] || 0}
              onTransposeChange={canModify ? (val) => handleGlobalTranspose(songForViewer.id, val) : undefined}
              darkMode={darkMode}
              onEdit={canModify ? () => onEditSong(songForViewer) : undefined}
              onDelete={canModify ? () => {
                if (room.currentSongId === songForViewer.id) onUpdateRoom({ ...room, currentSongId: '' });
                onDeleteSong(songForViewer.id);
                setSelectedSongId(null);
              } : undefined}
              onPrev={hasPrevSong ? () => navigateToSong(room.repertoire[currentSongIndex - 1]) : undefined}
              onNext={hasNextSong ? () => navigateToSong(room.repertoire[currentSongIndex + 1]) : undefined}
              hasPrev={hasPrevSong}
              hasNext={hasNextSong}
              isChatVisible={true}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomView;