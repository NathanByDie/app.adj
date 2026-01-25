import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Room, Song, ChatMessage, LiturgicalTime } from '../types';
import SongViewer from './SongViewer';
import { 
  collection, 
  query, 
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { Firestore } from 'firebase/firestore';
import { transposeSong } from '../services/musicUtils';
import { triggerHapticFeedback } from '../services/haptics';

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
  categories: string[];
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
        if (diff < 0 && diff > -100) setTranslateX(diff);
    } else {
        if (diff > 0 && diff < 100) setTranslateX(diff);
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (Math.abs(translateX) > 50) {
      triggerHapticFeedback('light');
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
        <div 
            className={`absolute top-1/2 -translate-y-1/2 text-slate-400 transition-opacity duration-300 flex items-center ${isMe ? 'right-0' : 'left-0'}`}
            style={{ 
                opacity: Math.abs(translateX) > 10 ? Math.min(Math.abs(translateX) / 50, 1) : 0, 
                transform: isMe ? `translateX(20px)` : `translateX(-20px)`
            }}
        >
            <svg className={`w-5 h-5 ${isMe ? 'scale-x-[-1]' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
        </div>

        <div className="transition-transform duration-150 ease-out max-w-[85%]" style={{ transform: `translateX(${translateX}px)` }}>
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
    onEditSong, onDeleteSong, categories
}) => {
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const isTheHost = currentUser === room.host;
  const canModify = isAdmin || isTheHost;

  const [isEditingRepertoire, setIsEditingRepertoire] = useState(room.repertoire.length === 0 && canModify);
  const [tempRepertoire, setTempRepertoire] = useState<string[]>([]);
  const [displayedRepertoire, setDisplayedRepertoire] = useState<string[]>(room.repertoire);
  
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
  
  const [toastTranslateY, setToastTranslateY] = useState(0);
  const toastTouchStartY = useRef<number | null>(null);
  
  const [isFollowingHost, setIsFollowingHost] = useState(true);
  const [addSongFilter, setAddSongFilter] = useState<string>('Todos');
  const [isAddSongDrawerOpen, setIsAddSongDrawerOpen] = useState(false);

  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ index: number; position: 'before' | 'after' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string, message: string, action: () => void, type: 'danger' | 'warning' } | null>(null);

  const prevParticipants = useRef<string[]>(room.participants || []);
  const prevChatLength = useRef<number>(room.chat?.length || 0);
  const notificationAudio = useRef<HTMLAudioElement | null>(null);
  const lastSyncedHostSongId = useRef<string | undefined>(undefined);
  const roomRef = useRef(room);
  roomRef.current = room;

  const transposedContentCache = useRef<Record<string, string>>({});
  const prevSongsRef = useRef<Song[]>();

  useEffect(() => {
    if (prevSongsRef.current && prevSongsRef.current !== songs) {
      transposedContentCache.current = {};
    }
    prevSongsRef.current = songs;
  }, [songs]);

  const repertoireSongsMap = useMemo(() => {
    const map: Record<string, Song> = {};
    const repertoire = isEditingRepertoire ? tempRepertoire : displayedRepertoire;
    repertoire.forEach(id => {
      const s = songs.find(song => song.id === id);
      if (s) map[id] = s;
    });
    return map;
  }, [displayedRepertoire, tempRepertoire, songs, isEditingRepertoire]);

  useEffect(() => {
    setDisplayedRepertoire(room.repertoire);
  }, [room.repertoire]);

  useEffect(() => {
    if (isTheHost || !isFollowingHost) return;
    const currentIndex = selectedSongId ? displayedRepertoire.indexOf(selectedSongId) : -1;
    if (currentIndex === -1) return;
    const idsToPreload = [displayedRepertoire[currentIndex - 1], displayedRepertoire[currentIndex + 1]].filter(Boolean);
    idsToPreload.forEach(songId => {
      const song = repertoireSongsMap[songId];
      if (song) {
        const transposeValue = room.globalTranspositions?.[song.id] || 0;
        const cacheKey = `${song.id}-${transposeValue}`;
        if (!transposedContentCache.current[cacheKey]) {
          transposedContentCache.current[cacheKey] = transposeSong(song.content, transposeValue);
        }
      }
    });
  }, [selectedSongId, displayedRepertoire, repertoireSongsMap, room.globalTranspositions, isTheHost, isFollowingHost]);

  useEffect(() => {
    const handler = () => setSelectedSongId(null);
    window.addEventListener('closeRoomSong', handler);
    return () => window.removeEventListener('closeRoomSong', handler);
  }, []);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const overlay = event.state?.overlay;
      const internalOverlays = ['room', 'room_song', 'chat', 'participants'];
  
      if (overlay && internalOverlays.includes(overlay)) {
        setIsChatOpen(overlay === 'chat');
        setShowParticipants(overlay === 'participants');
        if (overlay === 'room') {
          setSelectedSongId(null);
        }
        return;
      }
  
      window.history.pushState({ overlay: 'room' }, '', '');
      setConfirmModal({
        title: 'Salir de la Sala',
        message: '¿Estás seguro de que quieres abandonar la sesión?',
        type: 'danger',
        action: () => {
          setConfirmModal(null);
          onExit();
        },
      });
    };
  
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onExit]);

  const openChat = () => { if (!isChatOpen) { window.history.pushState({ overlay: 'chat' }, '', ''); setIsChatOpen(true); setShowParticipants(false); } };
  const closeChat = () => window.history.back();
  const openParticipants = () => { if (!showParticipants) { window.history.pushState({ overlay: 'participants' }, '', ''); setShowParticipants(true); setIsChatOpen(false); } };
  const closeParticipants = () => window.history.back();

  useEffect(() => {
    try {
      notificationAudio.current = new Audio("https://firebasestorage.googleapis.com/v0/b/adjstudios.firebasestorage.app/o/notificacion-adj.mp3?alt=media&token=8e9b60b7-9571-460b-857c-658a0a8616a2");
      notificationAudio.current.load();
    } catch (e) { console.error("Audio init failed", e); }
  }, []);

  useEffect(() => {
    const currentChat = room.chat || [];
    if (currentChat.length > prevChatLength.current) {
        const lastMsg = currentChat[currentChat.length - 1];
        if (lastMsg.sender !== currentUser) {
            triggerHapticFeedback('notification');
            notificationAudio.current?.play().catch(() => {});

            if (!isChatOpen) {
                if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                if (toastExitTimerRef.current) clearTimeout(toastExitTimerRef.current);
                
                setToastTranslateY(0);

                const newToast = { sender: lastMsg.sender, text: lastMsg.text, id: Date.now() };
                setChatToast(newToast);
                requestAnimationFrame(() => setIsToastVisible(true));
                
                toastTimerRef.current = window.setTimeout(() => {
                    setIsToastVisible(false);
                    toastExitTimerRef.current = window.setTimeout(() => {
                        setChatToast(prev => {
                            if (prev?.id === newToast.id) {
                                setToastTranslateY(0);
                                return null;
                            }
                            return prev;
                        });
                    }, 500);
                }, 4000);
            }
        }
    }
    prevChatLength.current = currentChat.length;
  }, [room.chat, currentUser, isChatOpen]);

  useEffect(() => { if (room.participants && !room.participants.includes(currentUser)) onExit(); }, [room.participants, currentUser, onExit]);

  useEffect(() => {
    if (!isTheHost && isFollowingHost) {
        const targetSongId = room.currentSongId || '';
        if (targetSongId && targetSongId !== lastSyncedHostSongId.current) {
            lastSyncedHostSongId.current = targetSongId;
            setSelectedSongId(targetSongId);
            const isCurrentlyOnSongPage = window.history.state?.overlay === 'room_song';
            if (isCurrentlyOnSongPage) window.history.replaceState({ overlay: 'room_song' }, '', '');
            else window.history.pushState({ overlay: 'room_song' }, '', '');
        }
    }
  }, [room.currentSongId, isFollowingHost, isTheHost]);

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
        } catch (error) { console.error("Error fetching details:", error); }
    };
    fetchParticipantDetails();
  }, [db, room.participants, ADMIN_EMAILS]);

  const addNotification = (message: string, type: Notification['type'] = 'info') => {
    const id = Date.now() + Math.random();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => { setNotifications(prev => prev.filter(n => n.id !== id)); }, 3000);
  };

  useEffect(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }, [room.chat, isChatOpen]);
  useEffect(() => { if (isChatOpen && chatInputRef.current) setTimeout(() => chatInputRef.current?.focus(), 100); }, [isChatOpen]);
  useEffect(() => {
    const currentParts = room.participants || [];
    if (currentParts.length > prevParticipants.current.length) {
      const newUsers = currentParts.filter(p => !prevParticipants.current.includes(p));
      newUsers.forEach(u => { if (u !== currentUser) addNotification(`${u} se ha unido`, 'success'); });
    } else if (currentParts.length < prevParticipants.current.length) {
      const leftUsers = prevParticipants.current.filter(p => !currentParts.includes(p));
      leftUsers.forEach(u => { addNotification(`${u} ha salido`, 'alert'); });
    }
    prevParticipants.current = currentParts;
  }, [room.participants, currentUser]);

  const handleExitRoom = () => {
    setConfirmModal({
      title: 'Salir de la Sala',
      message: '¿Estás seguro de que quieres abandonar la sesión?',
      type: 'danger',
      action: () => {
        setConfirmModal(null);
        onExit();
      }
    });
  };
  
  const handleCopyCode = () => { navigator.clipboard.writeText(room.code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  
  const navigateToSong = (songId: string | null) => {
    const currentOverlay = window.history.state?.overlay;
    if (isTheHost) {
      lastSyncedHostSongId.current = songId || '';
      setSelectedSongId(songId);
      onUpdateRoom({ ...room, currentSongId: songId || '' });
    } else {
      setSelectedSongId(songId);
      if (isFollowingHost && songId === room.currentSongId) lastSyncedHostSongId.current = songId;
    }
    if (songId) {
       if (currentOverlay === 'room_song') window.history.replaceState({ overlay: 'room_song' }, '', '');
       else window.history.pushState({ overlay: 'room_song' }, '', '');
    }
  };

  const toggleFollowing = () => setIsFollowingHost(prev => !prev);

  const handleMakeHost = (newHostUsername: string) => {
    if (!isTheHost) return;
    setConfirmModal({
        title: 'Transferir Host', message: `¿Seguro de ceder el liderazgo a ${newHostUsername}?`, type: 'warning',
        action: () => { onUpdateRoom({ ...room, host: newHostUsername }); setConfirmModal(null); }
    });
  };

  const handleKickParticipant = (username: string) => {
    if (!isTheHost) return;
    setConfirmModal({
        title: 'Expulsar Miembro', message: `¿Deseas sacar a ${username} de la sala?`, type: 'danger',
        action: () => {
            const updatedParticipants = (room.participants || []).filter(p => p !== username);
            onUpdateRoom({ ...room, participants: updatedParticipants }); setConfirmModal(null);
        }
    });
  };

  const handleBanParticipant = (username: string) => {
    if (!isTheHost) return;
    setConfirmModal({
        title: 'Bloquear Usuario', message: `¿Bloquear permanentemente a ${username}?`, type: 'danger',
        action: () => {
            const updatedParticipants = (room.participants || []).filter(p => p !== username);
            const updatedBanned = [...(room.banned || []), username];
            onUpdateRoom({ ...room, participants: updatedParticipants, banned: updatedBanned }); setConfirmModal(null);
        }
    });
  };

  const handleReply = (msg: ChatMessage) => { setReplyingTo({ sender: msg.sender, text: msg.text }); openChat(); setTimeout(() => chatInputRef.current?.focus(), 100); };
  const handleSendMessage = () => {
    if (chatMessage.trim() === '') return;
    let textToSend = chatMessage;
    if (replyingTo) { textToSend = `> @${replyingTo.sender}: ${replyingTo.text.substring(0, 30)}...\n${chatMessage}`; }
    const newMessage: ChatMessage = { sender: currentUser, text: textToSend, timestamp: Date.now() };
    onUpdateRoom({ ...room, chat: [...(room.chat || []), newMessage] });
    setChatMessage(''); setReplyingTo(null);
  };

  const handleGlobalTranspose = (songId: string, newSemiTones: number) => {
    if (!canModify) return;
    onUpdateRoom({ ...room, globalTranspositions: { ...(room.globalTranspositions || {}), [songId]: newSemiTones } });
  };

  const songForViewer = useMemo(() => {
    if (!selectedSongId) return null;
    return repertoireSongsMap[selectedSongId] || songs.find(s => s.id === selectedSongId);
  }, [selectedSongId, repertoireSongsMap, songs]);

  const currentSongIndex = selectedSongId ? displayedRepertoire.indexOf(selectedSongId) : -1;
  const hasPrevSong = currentSongIndex > 0;
  const hasNextSong = currentSongIndex >= 0 && currentSongIndex < displayedRepertoire.length - 1;
  const formatMessageTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

  const chatInputArea = (
    <div className={`px-3 pt-3 border-t shrink-0 ${darkMode ? 'border-white/5 bg-black' : 'border-slate-100 bg-white'} pb-[calc(0.25rem+env(safe-area-inset-bottom))]`}>
        {replyingTo && (
            <div className={`flex items-center justify-between px-4 py-2 mb-2 rounded-xl text-xs font-medium border-l-4 border-misionero-azul ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-50 text-slate-600'}`}>
                <span className="truncate">Respondiendo a <b>{replyingTo.sender}</b></span>
                <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-black/10 rounded-full"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex gap-2 items-center w-full">
             {!isChatOpen && (
                <button type="button" onClick={openChat} className={`w-12 h-12 flex items-center justify-center rounded-2xl border shrink-0 transition-colors ${darkMode ? 'bg-slate-900 border-white/5 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                </button>
             )}
            <input ref={chatInputRef} type="text" value={chatMessage} onChange={e => setChatMessage(e.target.value)} placeholder="Mensaje..." className={`flex-1 min-w-0 rounded-2xl px-4 py-3.5 text-sm font-bold outline-none border transition-all ${darkMode ? 'bg-black border-white/5 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} />
            <button type="submit" disabled={!chatMessage.trim()} className="bg-misionero-verde text-white font-black w-12 h-12 rounded-2xl text-[10px] uppercase shadow-md active:scale-95 transition-transform disabled:opacity-30 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
        </form>
    </div>
  );

  const startEditingRepertoire = () => { setTempRepertoire(room.repertoire); setIsEditingRepertoire(true); };
  const handleFinalizeEditing = () => { onUpdateRoom({ ...room, repertoire: tempRepertoire }); setDisplayedRepertoire(tempRepertoire); setIsEditingRepertoire(false); addNotification('Repertorio guardado', 'success'); };
  const handleCancelEditing = () => {
      const hasChanges = room.repertoire.length !== tempRepertoire.length || room.repertoire.some((id, i) => id !== tempRepertoire[i]);
      if (hasChanges) { setConfirmModal({ title: 'Descartar Cambios', message: '¿Seguro que quieres descartar los cambios?', type: 'warning', action: () => { setIsEditingRepertoire(false); setConfirmModal(null); } }); } 
      else { setIsEditingRepertoire(false); }
  };
  
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => { e.dataTransfer.effectAllowed = 'move'; setDraggingIndex(index); };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault(); if (draggingIndex === null || draggingIndex === index) { setDropIndicator(null); return; }
    const rect = e.currentTarget.getBoundingClientRect(); const halfway = rect.top + rect.height / 2;
    const position = e.clientY < halfway ? 'before' : 'after'; setDropIndicator({ index, position });
  };
  const handleDragLeave = () => setDropIndicator(null);
  const handleDrop = () => {
    if (draggingIndex === null || dropIndicator === null) return;
    const newRepertoire = [...tempRepertoire]; const [draggedItem] = newRepertoire.splice(draggingIndex, 1);
    let insertAt = dropIndicator.index; if (dropIndicator.position === 'after') insertAt += 1;
    if (draggingIndex < insertAt) insertAt -=1; newRepertoire.splice(insertAt, 0, draggedItem);
    setTempRepertoire(newRepertoire);
  };
  const handleDragEnd = () => { setDraggingIndex(null); setDropIndicator(null); };
  
  const handleRemoveFromRepertoire = (songIdToRemove: string) => {
      const song = repertoireSongsMap[songIdToRemove];
      setConfirmModal({
          title: 'Quitar Canción', message: `¿Quitar "${song?.title}" del repertorio?`, type: 'danger',
          action: () => { setTempRepertoire(prev => prev.filter(id => id !== songIdToRemove)); addNotification(`"${song?.title}" quitada`, 'info'); setConfirmModal(null); }
      });
  };

  const handleAddToRepertoire = (songIdToAdd: string) => {
      const song = songs.find(s => s.id === songIdToAdd); if (!song || tempRepertoire.includes(songIdToAdd)) return;
      setTempRepertoire(prev => [...prev, songIdToAdd]); addNotification(`"${song.title}" añadida`, 'success');
  };

  const availableSongsToAdd = useMemo(() => {
    return songs
      .filter(s => {
        const matchesSearch = s.title.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = addSongFilter === 'Todos' || s.category === addSongFilter;
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [songs, searchQuery, addSongFilter]);

  const handleToastClick = () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setIsToastVisible(false);
    openChat();
  };
  
  const handleToastTouchStart = (e: React.TouchEvent) => {
      toastTouchStartY.current = e.targetTouches[0].clientY;
      (e.currentTarget as HTMLDivElement).style.transition = 'none';
  };
  
  const handleToastTouchMove = (e: React.TouchEvent) => {
      if (toastTouchStartY.current === null) return;
      const deltaY = e.targetTouches[0].clientY - toastTouchStartY.current;
      if (deltaY > 0) setToastTranslateY(deltaY);
  };
  
  const handleToastTouchEnd = (e: React.TouchEvent) => {
      if (toastTouchStartY.current === null) return;
      (e.currentTarget as HTMLDivElement).style.transition = 'all 0.3s ease-out';
      if (toastTranslateY > 60) {
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          setIsToastVisible(false);
      } else {
          setToastTranslateY(0);
      }
      toastTouchStartY.current = null;
  };

  return (
    <div className={`flex flex-col h-full transition-colors duration-500 ${darkMode ? 'bg-black text-white' : 'bg-white text-slate-900'} animate-in fade-in duration-300 overflow-hidden relative`}>
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] w-full max-w-xs flex flex-col items-center gap-2 pointer-events-none px-4">
        {notifications.map(n => (
          <div key={n.id} className={`p-3 rounded-2xl shadow-2xl border flex items-center gap-3 animate-in slide-in-from-top-4 duration-300 pointer-events-auto ${n.type === 'success' ? 'bg-misionero-verde/90' : n.type === 'alert' ? 'bg-misionero-rojo/90' : 'bg-misionero-azul/90'}`}>
            <p className="text-[10px] font-black uppercase text-white leading-tight">{n.message}</p>
          </div>
        ))}
      </div>
      
      <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[200] w-full max-w-xs flex flex-col items-center gap-2 pointer-events-none px-4">
        {chatToast && (
          <div 
            key={chatToast.id}
            onTouchStart={handleToastTouchStart}
            onTouchMove={handleToastTouchMove}
            onTouchEnd={handleToastTouchEnd}
            className={`pointer-events-auto transition-all duration-300 ease-out ${isToastVisible ? 'opacity-100' : 'opacity-0 translate-y-full'}`}
            style={{ transform: `translateY(${toastTranslateY}px)` }}
          >
            <div onClick={handleToastClick} className={`rounded-2xl shadow-2xl border p-4 cursor-pointer active:scale-95 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}><span className="font-black uppercase text-[10px] text-misionero-amarillo">{chatToast.sender}:</span><span className="ml-2">{chatToast.text}</span></p>
            </div>
          </div>
        )}
      </div>

      {!songForViewer && (
        <header className={`pt-12 px-4 shrink-0 transition-colors duration-500 ${isEditingRepertoire ? `sticky top-0 z-30 ${darkMode ? 'bg-black border-b border-slate-800' : 'bg-misionero-azul text-white'}` : `relative border-b shadow-sm ${darkMode ? 'bg-black/95 border-slate-800' : 'bg-misionero-azul text-white border-transparent'}`}`}>
          {isEditingRepertoire ? (
            <div className="flex items-center justify-between pb-2">
               <button onClick={handleCancelEditing} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg active:scale-95 transition-transform ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>Cancelar</button>
               <div>
                  <h2 className="font-black text-lg text-center tracking-tighter uppercase italic">Organizando...</h2>
                  <p className={`text-[9px] text-center font-black uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-white/80'}`}>{tempRepertoire.length} canciones</p>
               </div>
               <button onClick={handleFinalizeEditing} className="bg-misionero-verde text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg active:scale-95 transition-transform">Finalizar</button>
            </div>
          ) : (
            <div className="flex items-center justify-between pb-3">
                <div className="flex-1 min-w-0 cursor-pointer group" onClick={handleCopyCode}>
                    <h2 className="font-black text-lg tracking-tighter uppercase italic truncate group-active:scale-95 transition-transform origin-left">GUION DE MISA</h2>
                    <div className="flex items-center gap-1.5">
                        <p className={`text-[8px] font-black uppercase tracking-wider transition-colors ${darkMode ? 'text-slate-400' : 'text-white/80'}`}>CÓDIGO: {room.code}</p>
                        <svg className="w-3 h-3 opacity-50" fill="currentColor" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                        {copied && <span className="text-[7px] font-black uppercase text-misionero-amarillo ml-1 animate-in fade-in duration-300">Copiado!</span>}
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 pl-3">
                    <button onClick={openParticipants} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-colors ${darkMode ? 'bg-black/40 border-white/5' : 'bg-black/20 border-white/10'}`}>
                        <svg className={`w-3.5 h-3.5 ${darkMode ? 'text-misionero-amarillo' : 'text-white'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                        <span className={`text-[10px] font-black ${darkMode ? 'text-misionero-amarillo' : 'text-white'}`}>{(room.participants || []).length}</span>
                    </button>
                    <button onClick={handleExitRoom} className="bg-misionero-rojo text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg active:scale-95 transition-transform">SALIR</button>
                </div>
            </div>
          )}
        </header>
      )}

      <div className={`flex-1 overflow-y-auto custom-scroll ${isEditingRepertoire ? 'px-0 pt-4' : 'px-5 py-8 space-y-8'} relative z-20 pb-40 transition-colors duration-500 ${!songForViewer && !isEditingRepertoire ? `rounded-t-[2.5rem] ${darkMode ? 'bg-black' : 'bg-slate-50'}` : ''}`}>
        {(!isEditingRepertoire || !canModify) && !songForViewer && (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-5 px-1">
              <h3 className="text-[10px] font-black text-misionero-amarillo uppercase tracking-[0.2em]">Repertorio ({displayedRepertoire.length})</h3>
              <div className="flex items-center gap-2">
                {isTheHost ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-misionero-rojo/10 text-misionero-rojo text-[9px] font-black">
                     <div className="w-2 h-2 bg-misionero-rojo rounded-full animate-pulse"></div>
                     <span>EN VIVO</span>
                  </div>
                ) : (
                  <button onClick={toggleFollowing} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase transition-colors ${isFollowingHost ? 'bg-misionero-verde text-white' : (darkMode ? 'bg-black text-slate-400' : 'bg-slate-100 text-slate-500')}`}>
                    <span>{isFollowingHost ? 'Siguiendo' : 'Libre'}</span>
                  </button>
                )}
                {canModify && (
                  <button onClick={startEditingRepertoire} className="text-[9px] font-black px-3 py-1 rounded-lg uppercase text-slate-500">ORGANIZAR</button>
                )}
              </div>
            </div>
            <div className="space-y-4">
              {displayedRepertoire.map((songId, idx) => {
                  const song = repertoireSongsMap[songId];
                  const tValue = room.globalTranspositions?.[songId] || 0;
                  const isHostHere = room.currentSongId === songId;
                  return (
                    <div key={songId} onClick={() => navigateToSong(songId)} className={`flex items-center justify-between p-5 border rounded-3xl active:scale-[0.98] transition-all duration-300 relative ${selectedSongId === songId ? 'border-misionero-amarillo shadow-lg' : (darkMode ? 'bg-slate-900 border-white/5 text-white' : 'bg-white border-slate-100 text-slate-900')} ${isHostHere ? `ring-2 ring-misionero-rojo ring-offset-4 ${darkMode ? 'ring-offset-black' : 'ring-offset-slate-50'}` : ''}`}>
                      <div className="flex items-center gap-4 flex-1 truncate">
                        <div className={`w-9 h-9 shrink-0 rounded-2xl flex items-center justify-center font-black text-xs text-white transition-colors ${isHostHere ? 'bg-misionero-rojo animate-pulse' : 'bg-misionero-verde'}`}>{idx + 1}</div>
                        <div className="truncate">
                          <h4 className="font-black text-sm uppercase truncate">{song?.title || 'Cargando...'}</h4>
                          {tValue !== 0 && <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${darkMode ? 'bg-misionero-amarillo/20 text-misionero-amarillo' : 'bg-misionero-azul/20 text-misionero-azul'}`}>T {tValue > 0 ? `+${tValue}` : tValue}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <span className={`text-[11px] font-black block uppercase ${darkMode ? 'text-misionero-amarillo' : 'text-misionero-rojo'}`}>{song?.key}</span>
                        {isHostHere && <span className="text-[7px] font-bold text-misionero-rojo uppercase tracking-wider block mt-1">En Vivo</span>}
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </section>
        )}
        
        {isEditingRepertoire && canModify && !songForViewer && (
          <React.Fragment>
            <div className="px-5 pb-24 space-y-2" onDragLeave={handleDragLeave}>
                {tempRepertoire.map((songId, idx) => {
                    const song = repertoireSongsMap[songId];
                    if (!song) return null;
                    const isDragging = draggingIndex === idx;
                    return (
                        <React.Fragment key={songId}>
                            {dropIndicator?.index === idx && dropIndicator.position === 'before' && <div className="h-1 bg-misionero-azul rounded-full my-1"></div>}
                            <div
                                draggable onDragStart={(e) => handleDragStart(e, idx)} onDragOver={(e) => handleDragOver(e, idx)} onDrop={handleDrop} onDragEnd={handleDragEnd}
                                className={`flex items-center justify-between p-3 border rounded-2xl transition-all duration-200 ${isDragging ? 'opacity-30' : ''} ${darkMode ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-100'}`}
                            >
                                <div className="flex items-center gap-4 flex-1 truncate">
                                    <div className="cursor-move p-2" onTouchStart={(e) => e.stopPropagation()}><svg className={`w-5 h-5 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" /></svg></div>
                                    <div className="truncate"><h4 className="font-black text-sm uppercase truncate">{song.title}</h4><span className={`text-[9px] font-bold ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{song.key}</span></div>
                                </div>
                                <button onClick={() => handleRemoveFromRepertoire(songId)} className="w-10 h-10 flex items-center justify-center text-misionero-rojo/70 hover:text-misionero-rojo hover:bg-misionero-rojo/10 rounded-xl active:scale-90 transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                            </div>
                            {dropIndicator?.index === idx && dropIndicator.position === 'after' && <div className="h-1 bg-misionero-azul rounded-full my-1"></div>}
                        </React.Fragment>
                    );
                })}
                {tempRepertoire.length === 0 && (
                    <div className={`text-center py-12 rounded-2xl border-2 border-dashed ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                        <p className="text-xs font-bold text-slate-400">El repertorio está vacío.</p>
                    </div>
                )}
            </div>
          </React.Fragment>
        )}
      </div>

      <div className={`fixed bottom-0 left-0 right-0 z-[120] max-w-md mx-auto`}>
        {isEditingRepertoire && canModify ? (
          <div className={`p-4 border-t ${darkMode ? 'bg-black/80 backdrop-blur-md border-t-slate-800' : 'bg-white/80 backdrop-blur-md border-t-slate-100'} pb-[calc(1rem+env(safe-area-inset-bottom))]`}>
            <button onClick={() => setIsAddSongDrawerOpen(true)} className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl text-sm font-black uppercase transition-colors ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-slate-100 border-slate-200'} border`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                Añadir Música
            </button>
          </div>
        ) : (
          !isChatOpen && !songForViewer && chatInputArea
        )}
      </div>

      {showParticipants && (<div className={`fixed inset-0 z-[160] flex flex-col animate-in slide-in-from-right duration-300 ${darkMode ? 'bg-black' : 'bg-white'}`}>
        <div className={`flex items-center justify-between px-4 pt-12 pb-4 border-b shrink-0 ${darkMode ? 'border-white/5 bg-slate-900' : 'border-slate-100 bg-white'}`}><div className="flex items-center gap-3"><button onClick={closeParticipants} className="p-2 rounded-full"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg></button><div><h3 className="font-black uppercase text-sm">Participantes</h3><p className="text-[10px] font-bold text-slate-400">{(room.participants || []).length} usuarios</p></div></div></div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {(room.participants || []).map((username) => {
              const isHost = username === room.host;
              const details = participantDetails[username];
              const isAdminUser = details?.isAdmin;
              return (<div key={username} className={`flex items-center justify-between p-4 rounded-3xl border transition-colors ${darkMode ? 'bg-slate-900 border-white/5' : 'bg-slate-50 border-slate-100'}`}><div className="flex items-center gap-3"><div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm text-white ${isHost ? 'bg-misionero-amarillo shadow-lg' : 'bg-misionero-azul'}`}>{username.charAt(0).toUpperCase()}</div><div><p className="text-sm font-black uppercase flex items-center gap-1.5">{username}{isHost && <CrownIcon className="w-3.5 h-3.5 text-misionero-amarillo" />}</p><div className="flex gap-1.5">{isHost && <span className="text-[7px] font-black uppercase bg-misionero-amarillo/20 text-misionero-amarillo px-1.5 py-0.5 rounded">HOST</span>}{isAdminUser && <span className="text-[7px] font-black uppercase bg-misionero-rojo/20 text-misionero-rojo px-1.5 py-0.5 rounded">ADMIN</span>}</div></div></div>{isTheHost && username !== currentUser && (<div className="flex items-center gap-1.5"><button onClick={() => handleMakeHost(username)} title="Hacer Host" className="w-8 h-8 rounded-xl bg-misionero-amarillo/10 text-misionero-amarillo flex items-center justify-center active:scale-90"><CrownIcon /></button><button onClick={() => handleKickParticipant(username)} title="Expulsar" className="w-8 h-8 rounded-xl bg-misionero-rojo/10 text-misionero-rojo flex items-center justify-center active:scale-90"><DoorIcon /></button><button onClick={() => handleBanParticipant(username)} title="Bloquear" className="w-8 h-8 rounded-xl bg-slate-500/10 text-slate-500 flex items-center justify-center active:scale-90"><BanIcon /></button></div>)}</div>);
          })}
        </div>
      </div>)}
      {isChatOpen && (<div className={`fixed inset-0 z-[150] flex flex-col animate-in slide-in-from-bottom duration-300 ${darkMode ? 'bg-black' : 'bg-white'}`}><div className={`flex items-center justify-between px-4 pt-12 pb-4 border-b shrink-0 ${darkMode ? 'border-white/5 bg-slate-900' : 'border-slate-100 bg-white'}`}><div className="flex items-center gap-3"><button onClick={closeChat} className="p-2 rounded-full"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg></button><div><h3 className="font-black uppercase text-sm">Chat de Sala</h3><p className="text-[10px] font-bold text-slate-400">{(room.participants || []).length} conectados</p></div></div></div><div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">{(room.chat || []).map((msg, i) => <SwipeableMessage key={i} msg={msg} currentUser={currentUser} onReply={handleReply} darkMode={darkMode} formatTime={formatMessageTime} />)}</div>{chatInputArea}</div>)}
      {confirmModal && (<div className="fixed inset-0 z-[300] flex items-center justify-center p-6 animate-in fade-in duration-200"><div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmModal(null)}></div><div className={`relative w-full max-w-sm p-6 rounded-[2.5rem] shadow-2xl border animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-black border-white/10' : 'bg-white border-slate-100'}`}><h3 className={`text-center font-black text-lg uppercase mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{confirmModal.title}</h3><p className={`text-center text-xs font-bold mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{confirmModal.message}</p><div className="flex gap-3"><button onClick={() => setConfirmModal(null)} className={`flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-colors ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>Cancelar</button><button onClick={confirmModal.action} className={`flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-white shadow-lg active:scale-95 transition-transform ${confirmModal.type === 'danger' ? 'bg-misionero-rojo' : 'bg-misionero-azul'}`}>Confirmar</button></div></div></div>)}
      {songForViewer && (<div className={`fixed inset-0 z-[130] ${darkMode ? 'bg-black' : 'bg-white'} flex flex-col animate-in slide-in-from-bottom-2`}>{(() => { const transposeValue = room.globalTranspositions?.[songForViewer.id] || 0; const cacheKey = `${songForViewer.id}-${transposeValue}`; const cachedContent = transposedContentCache.current[cacheKey]; return (<SongViewer song={songForViewer} onBack={() => window.history.back()} externalTranspose={transposeValue} transposedContent={cachedContent} onTransposeChange={canModify ? (val) => handleGlobalTranspose(songForViewer.id, val) : undefined} darkMode={darkMode} onEdit={canModify ? () => onEditSong(songForViewer) : undefined} onDelete={canModify ? () => { if (room.currentSongId === songForViewer.id) onUpdateRoom({ ...room, currentSongId: '' }); onDeleteSong(songForViewer.id); setSelectedSongId(null); } : undefined} onPrev={hasPrevSong ? () => navigateToSong(displayedRepertoire[currentSongIndex - 1]) : undefined} onNext={hasNextSong ? () => navigateToSong(displayedRepertoire[currentSongIndex + 1]) : undefined} hasPrev={hasPrevSong} hasNext={hasNextSong} isChatVisible={true} chatInputComponent={chatInputArea} />); })()}</div>)}
      
      {isEditingRepertoire && isAddSongDrawerOpen && (
        <div className="fixed inset-0 z-[170] animate-in fade-in duration-300" onClick={() => setIsAddSongDrawerOpen(false)}>
          <div 
            className={`absolute bottom-0 left-0 right-0 h-[85vh] flex flex-col ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'} border-t rounded-t-[2.5rem] shadow-2xl animate-in slide-in-from-bottom-full duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]`}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 shrink-0">
              <div className={`w-10 h-1.5 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'} rounded-full mx-auto`}></div>
            </div>
            <div className="flex items-center justify-between px-5 pb-3 shrink-0">
              <h3 className="font-black text-lg">Añadir al Repertorio</h3>
              <button onClick={() => setIsAddSongDrawerOpen(false)} className={`text-[10px] font-black uppercase px-4 py-2 rounded-xl ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>Listo</button>
            </div>
            <div className="px-5 pb-3 space-y-3 shrink-0">
              <input type="text" placeholder="Buscar para añadir..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={`w-full text-xs font-bold rounded-xl px-4 py-3 outline-none transition-colors ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-100 border-slate-200 text-slate-900'}`} />
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-5 px-5 custom-scroll">
                {['Todos', ...categories].map((f: string) => (
                  <button key={f} onClick={() => setAddSongFilter(f)} className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase shrink-0 transition-all ${addSongFilter === f ? 'bg-misionero-azul text-white' : (darkMode ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400')}`}>{f}</button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scroll px-5 space-y-2 pb-8">
              {availableSongsToAdd.map(song => {
                const isAdded = tempRepertoire.includes(song.id);
                return (
                  <div key={song.id} className={`flex items-center justify-between p-3 border rounded-2xl transition-colors ${darkMode ? 'bg-black border-white/5' : 'bg-white border-slate-100'}`}>
                    <div className="truncate"><h4 className="font-black text-sm uppercase truncate">{song.title}</h4><span className={`text-[9px] font-bold ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{song.key} • {song.category}</span></div>
                    <button onClick={() => !isAdded && handleAddToRepertoire(song.id)} disabled={isAdded} className={`w-10 h-10 flex items-center justify-center rounded-xl active:scale-90 transition-all ${isAdded ? 'bg-misionero-verde/20 text-misionero-verde' : 'bg-misionero-verde/10 text-misionero-verde/70 hover:bg-misionero-verde/20'}`}>
                      {isAdded ? (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>) : (<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>)}
                    </button>
                  </div>
                );
              })}
              {availableSongsToAdd.length === 0 && <p className="text-xs text-center font-bold text-slate-500 py-4">No hay canciones que coincidan.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Fix: Changed export from 'App' to 'RoomView'
export default RoomView;