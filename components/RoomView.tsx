import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Room, Song, ChatMessage, User as AppUser } from '../types';
import SongViewer from './SongViewer';
import { 
  collection, 
  query, 
  where,
  getDocs,
  updateDoc,
  doc,
  arrayRemove,
  Firestore,
} from "firebase/firestore";
import { 
  ref as refRtdb, onValue as onValueRtdb, query as queryRtdb, 
  limitToLast, push as pushRtdb, serverTimestamp as serverTimestampRtdb, 
  set as setRtdb, remove as removeRtdb, onChildAdded, onDisconnect 
} from "firebase/database";
import { transposeSong } from '../services/musicUtils';
import { triggerHapticFeedback } from '../services/haptics';
import { PlusIcon, UsersIcon } from '../constants';

interface RoomViewProps {
  room: Room;
  songs: Song[];
  currentUser: string;
  isAdmin: boolean;
  onExitRequest: () => void;
  onUpdateRoom: (roomId: string, updates: Partial<Room>) => void;
  darkMode?: boolean;
  db: Firestore;
  rtdb: any;
  onEditSong: (song: Song) => void;
  onDeleteSong: (songId: string) => Promise<void>;
  categories: string[];
  allUsers: AppUser[];
  onViewProfile: (userId: string) => void;
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
  const touchStartCoords = useRef<{x: number, y: number} | null>(null);
  const isMe = msg.sender === currentUser;

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartCoords.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStartCoords.current) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartCoords.current.x;
    const diffY = currentY - touchStartCoords.current.y;

    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 10) {
      setTranslateX(0);
      touchStartCoords.current = null;
      return;
    }
    
    if (diffX > 0) {
        setTranslateX(Math.min(diffX, 80));
    } else {
        setTranslateX(0);
    }
  };

  const onTouchEnd = () => {
    if (translateX > 50) {
      triggerHapticFeedback('light');
      onReply(msg);
    }
    setTranslateX(0); 
    touchStartCoords.current = null;
  };

  const replyMatch = msg.text.match(/^> @([^:]+):([^\n]*)\n([\s\S]*)/);
  const isReply = !!replyMatch;
  const replySender = isReply ? replyMatch[1] : '';
  const replyText = isReply ? replyMatch[2].trim() : '';
  const actualMessage = isReply ? replyMatch[3] : msg.text;

  const replyColor = darkMode ? 'border-misionero-azul' : 'border-misionero-verde';
  const replyBgColor = darkMode ? 'bg-slate-700/50' : 'bg-slate-200/70';
  const myReplyBgColor = 'bg-misionero-azul/50';

  return (
    <div 
      className={`relative flex flex-col ${isMe ? 'items-end' : 'items-start'} select-none w-full`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
        <div 
            className={`absolute top-1/2 -translate-y-1/2 left-0 text-slate-400 transition-opacity duration-300 flex items-center justify-center w-10`}
            style={{ 
                opacity: translateX > 10 ? Math.min(translateX / 50, 1) : 0, 
            }}
        >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
        </div>

        <div className="transition-transform duration-100 ease-out max-w-[85%]" style={{ transform: `translateX(${translateX}px)` }}>
            <div className={`p-3 rounded-2xl shadow-sm ${isMe ? 'bg-misionero-azul text-white' : (darkMode ? 'bg-slate-800 text-slate-200 border border-white/5' : 'bg-slate-100 text-slate-700')}`}>
                {isReply && (
                  <div className={`p-2 rounded-lg text-xs font-medium border-l-4 mb-2 ${isMe ? 'border-white' : replyColor} ${isMe ? myReplyBgColor : replyBgColor}`}>
                      <p className={`font-black ${isMe ? 'text-white' : 'text-misionero-amarillo'}`}>{replySender}</p>
                      <p className={`opacity-80 truncate`}>{replyText}</p>
                  </div>
                )}
                <p className="text-sm font-medium leading-tight whitespace-pre-wrap">{actualMessage}</p>
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
    room, songs, currentUser, isAdmin, onExitRequest, onUpdateRoom, darkMode = false, db, rtdb,
    onEditSong, onDeleteSong, categories, allUsers, onViewProfile
}) => {
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const isTheHost = currentUser === room.host;
  const canModify = isAdmin || isTheHost;

  const [isEditingRepertoire, setIsEditingRepertoire] = useState(room.repertoire.length === 0 && canModify);
  const [tempRepertoire, setTempRepertoire] = useState<string[]>([]);
  const [displayedRepertoire, setDisplayedRepertoire] = useState<string[]>(room.repertoire);
  
  const [onlineParticipants, setOnlineParticipants] = useState<string[]>([]);
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showParticipants, setShowParticipants] = useState(false);
  const [copied, setCopied] = useState(false);
  const [participantDetails, setParticipantDetails] = useState<Record<string, { isAdmin: boolean }>>({});

  const addNotification = useCallback((message: string, type: 'info' | 'success' | 'alert' = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  }, []);

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

  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimeoutRef = useRef<number | null>(null);

  const prevParticipants = useRef<string[]>([]);
  const prevChatLength = useRef<number>(room.chat?.length || 0);
  const notificationAudio = useRef<HTMLAudioElement | null>(null);
  const lastSyncedHostSongId = useRef<string | undefined>(undefined);
  const roomRef = useRef(room);
  roomRef.current = room;

  const transposedContentCache = useRef<Record<string, string>>({});
  const prevSongsRef = useRef<Song[]>();

  const repertoireScrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<number | null>(null);
  const scrollDirectionRef = useRef<'up' | 'down' | null>(null);

  // --- NAVEGACIÓN Y GESTIÓN DE SUB-VISTAS ---
  const openSubView = (subview: 'chat' | 'participants' | 'song') => {
      const newOverlay = `room-${subview}`;
      const currentState = window.history.state;
      if (currentState?.overlay !== newOverlay) {
          window.history.pushState({ overlay: newOverlay }, '');
      }
  };

  const handleOpenChat = () => {
      setIsChatOpen(true);
      openSubView('chat');
  };

  const handleOpenParticipants = () => {
      setShowParticipants(true);
      openSubView('participants');
  };

  const handleCloseSubView = () => {
      const currentState = window.history.state;
      if (currentState?.overlay?.startsWith('room-')) {
          window.history.back();
      } else {
          setIsChatOpen(false);
          setShowParticipants(false);
          setSelectedSongId(null);
      }
  };

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
        const overlay = event.state?.overlay;
        
        // When state changes, sync the UI.
        // If the overlay is not a specific sub-view, close it.
        if (overlay !== 'room-chat') setIsChatOpen(false);
        if (overlay !== 'room-participants') setShowParticipants(false);
        if (overlay !== 'room-song') setSelectedSongId(null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
        window.removeEventListener('popstate', handlePopState);
    };
  }, []);
  // --- FIN GESTIÓN NAVEGACIÓN ---

  useEffect(() => {
    if (prevSongsRef.current && prevSongsRef.current !== songs) {
      transposedContentCache.current = {};
    }
    prevSongsRef.current = songs;
  }, [songs]);

  const updateTypingStatus = (isTyping: boolean) => {
      const myTypingRef = refRtdb(rtdb, `typing/${room.id}/${currentUser}`);
      if (isTyping) {
          setRtdb(myTypingRef, true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = window.setTimeout(() => updateTypingStatus(false), 3000);
      } else {
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          removeRtdb(myTypingRef);
      }
  };

  useEffect(() => {
    const typingRef = refRtdb(rtdb, `typing/${room.id}`);
    const unsubscribe = onValueRtdb(typingRef, (snapshot) => {
        const typingData = snapshot.val() || {};
        const currentTypingUsers = Object.keys(typingData).filter(user => user !== currentUser && typingData[user]);
        setTypingUsers(currentTypingUsers);
    });
    return () => {
        unsubscribe();
        updateTypingStatus(false);
    };
  }, [room.id, currentUser, rtdb]);

  useEffect(() => {
    if (isChatOpen) {
      chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [isChatOpen, room.chat, typingUsers]);

  const handleSendChatMessage = () => {
    if (!chatMessage.trim()) return;
    updateTypingStatus(false);
    
    let messageText = chatMessage;
    if (replyingTo) {
      messageText = `> @${replyingTo.sender}:${replyingTo.text.split('\n')[0]}\n${chatMessage}`;
    }

    const chatRef = refRtdb(rtdb, `chats/${room.id}`);
    pushRtdb(chatRef, {
      sender: currentUser,
      text: messageText,
      timestamp: serverTimestampRtdb(),
    });

    setChatMessage('');
    setReplyingTo(null);
  };
  
  useEffect(() => {
    const participantsRef = refRtdb(rtdb, `rooms/${room.id}/participants`);
    const myConnectionRef = refRtdb(rtdb, `rooms/${room.id}/participants/${currentUser}`);
    
    const unsubscribe = onValueRtdb(participantsRef, (snap) => {
      const participantsData = snap.val() || {};
      const online = Object.keys(participantsData).filter(p => participantsData[p] === true);
      setOnlineParticipants(online);
    });
    
    setRtdb(myConnectionRef, true);
    const onDisconnectRef = onDisconnect(myConnectionRef);
    onDisconnectRef.remove();
    
    return () => {
      unsubscribe();
      removeRtdb(myConnectionRef);
    };
  }, [room.id, currentUser, rtdb]);

  const handleSongSelect = (songId: string) => {
    setSelectedSongId(songId);
    openSubView('song');
    
    if (isTheHost) {
      onUpdateRoom(room.id, { currentSongId: songId });
    }
  };

  const handleCloseSong = () => {
    setSelectedSongId(null);
    handleCloseSubView();
    // Ya no se gestiona el estado de seguimiento aquí
  };

  const handleTransposeChange = (songId: string, value: number) => {
    onUpdateRoom(room.id, {
      globalTranspositions: {
        ...room.globalTranspositions,
        [songId]: value
      }
    });
  };

  const selectedSong = useMemo(() => {
    return songs.find(s => s.id === selectedSongId);
  }, [selectedSongId, songs]);

  const repertoireSongs = useMemo(() => {
    return displayedRepertoire.map(songId => songs.find(s => s.id === songId)).filter((s): s is Song => !!s);
  }, [displayedRepertoire, songs]);
  
  const songsNotInRepertoire = useMemo(() => {
    const repertoireIds = new Set(displayedRepertoire);
    return songs.filter(s => !repertoireIds.has(s.id) && (addSongFilter === 'Todos' || s.category === addSongFilter));
  }, [displayedRepertoire, songs, addSongFilter]);

  const enterEditMode = () => {
    setTempRepertoire(displayedRepertoire);
    setIsEditingRepertoire(true);
  };

  const saveRepertoire = () => {
    onUpdateRoom(room.id, { repertoire: tempRepertoire });
    setDisplayedRepertoire(tempRepertoire);
    setIsEditingRepertoire(false);
  };

  const cancelEditMode = () => {
    setTempRepertoire([]);
    setIsEditingRepertoire(false);
  };

  const addSongToTemp = (songId: string) => {
    setTempRepertoire(prev => [...prev, songId]);
  };
  
  const removeSongFromTemp = (songId: string) => {
    setTempRepertoire(prev => prev.filter(id => id !== songId));
  };
  
  const handleDragStart = (index: number) => {
    setDraggingIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggingIndex === null || draggingIndex === index) {
      setDropIndicator(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'before' : 'after';

    if (dropIndicator?.index !== index || dropIndicator?.position !== position) {
      setDropIndicator({ index, position });
    }
  };

  const handleDrop = (index: number) => {
    if (draggingIndex === null) return;

    const draggedItem = tempRepertoire[draggingIndex];
    const newRepertoire = [...tempRepertoire];
    newRepertoire.splice(draggingIndex, 1);
    
    let dropIndex = index;
    if (draggingIndex < index) dropIndex--;
    if (dropIndicator?.position === 'after') dropIndex++;

    newRepertoire.splice(dropIndex, 0, draggedItem);

    setTempRepertoire(newRepertoire);
    setDraggingIndex(null);
    setDropIndicator(null);
  };
  
  const handleDragEnd = () => {
    setDraggingIndex(null);
    setDropIndicator(null);
  };

  useEffect(() => {
    if (room.repertoire !== displayedRepertoire) {
      setDisplayedRepertoire(room.repertoire);
    }
  }, [room.repertoire]);

  useEffect(() => {
    // Sincronización automática para miembros que siguen al anfitrión
    const hostSongId = room.currentSongId;
    if (isFollowingHost && !isTheHost && hostSongId && hostSongId !== selectedSongId && hostSongId !== lastSyncedHostSongId.current) {
        lastSyncedHostSongId.current = hostSongId;
        setSelectedSongId(hostSongId);
        openSubView('song');
        addNotification(`El anfitrión abrió: ${songs.find(s => s.id === hostSongId)?.title || 'una canción'}`);
    }
  }, [room.currentSongId, isFollowingHost, isTheHost, songs, addNotification, selectedSongId]);

  useEffect(() => {
    const checkParticipantRoles = async () => {
      const details: Record<string, { isAdmin: boolean }> = {};
      const q = query(collection(db, 'users'), where('username', 'in', onlineParticipants));
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach(doc => {
        const userData = doc.data();
        details[userData.username] = { isAdmin: userData.role === 'admin' };
      });
      setParticipantDetails(details);
    };

    if (onlineParticipants.length > 0) {
      checkParticipantRoles();
    }
  }, [onlineParticipants, db]);
  
  useEffect(() => {
    if (!notificationAudio.current) {
      notificationAudio.current = new Audio('https://firebasestorage.googleapis.com/v0/b/adjstudios.appspot.com/o/assets%2Fsoft_notification.mp3?alt=media&token=86720b08-9584-4809-9b58-4a94f0e5b9b8');
    }

    const sortedParticipants = onlineParticipants.sort();
    const sortedPrevParticipants = [...(prevParticipants.current || [])].sort();

    if (JSON.stringify(sortedParticipants) !== JSON.stringify(sortedPrevParticipants)) {
      const joined = sortedParticipants.filter(p => !sortedPrevParticipants.includes(p));
      const left = sortedPrevParticipants.filter(p => !sortedParticipants.includes(p));

      if (joined.length > 0) {
        addNotification(`${joined.join(', ')} se ha${joined.length > 1 ? 'n' : ''} unido.`);
      }
      if (left.length > 0) {
        addNotification(`${left.join(', ')} ha salido.`, 'alert');
      }

      prevParticipants.current = onlineParticipants;
    }
  }, [onlineParticipants, addNotification]);
  
  useEffect(() => {
    const chatRef = refRtdb(rtdb, `chats/${room.id}`);
    const q = queryRtdb(chatRef, limitToLast(1));
    const unsubscribe = onChildAdded(q, (snapshot) => {
      const newMsg = snapshot.val();
      if (newMsg && newMsg.timestamp > (room.chat?.[room.chat.length - 1]?.timestamp || 0)) {
        if (!isChatOpen && newMsg.sender !== currentUser) {
          if (notificationAudio.current) {
            notificationAudio.current.play().catch(e => console.log("Audio play failed", e));
          }
          const toastId = Date.now();
          setChatToast({ sender: newMsg.sender, text: newMsg.text, id: toastId });
          setIsToastVisible(true);
          setToastTranslateY(0);

          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          if (toastExitTimerRef.current) clearTimeout(toastExitTimerRef.current);

          toastTimerRef.current = window.setTimeout(() => {
            setIsToastVisible(false);
          }, 4000);
        }
      }
    });

    return () => unsubscribe();
  }, [isChatOpen, currentUser, rtdb, room.id, room.chat]);

  const handleToastTouchStart = (e: React.TouchEvent) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (toastExitTimerRef.current) clearTimeout(toastExitTimerRef.current);
    toastTouchStartY.current = e.targetTouches[0].clientY;
  };
  
  const handleToastTouchMove = (e: React.TouchEvent) => {
    if (toastTouchStartY.current === null) return;
    const currentY = e.targetTouches[0].clientY;
    const deltaY = currentY - toastTouchStartY.current;
    if (deltaY < 0) { // Solo permitir swipe hacia arriba
      setToastTranslateY(deltaY);
    }
  };

  const handleToastTouchEnd = () => {
    if (toastTranslateY < -50) { // Si se deslizó lo suficiente
      setIsToastVisible(false);
    } else { // Si no, animar de vuelta
      setToastTranslateY(0);
      toastExitTimerRef.current = window.setTimeout(() => setIsToastVisible(false), 2000);
    }
    toastTouchStartY.current = null;
  };
  
  const kickUser = (username: string) => {
    const roomDocRef = doc(db, 'rooms', room.id);
    updateDoc(roomDocRef, {
      participants: arrayRemove(username)
    });
    
    // Y en RTDB también
    const participantRef = refRtdb(rtdb, `rooms/${room.id}/participants/${username}`);
    removeRtdb(participantRef);
    addNotification(`${username} ha sido expulsado.`, 'alert');
  };

  const banUser = (username: string) => {
    const roomDocRef = doc(db, 'rooms', room.id);
    updateDoc(roomDocRef, {
      participants: arrayRemove(username),
      banned: arrayRemove(username) // Primero quitarlo por si acaso
    }).then(() => {
      updateDoc(roomDocRef, {
        banned: [...(room.banned || []), username]
      });
    });

    const participantRef = refRtdb(rtdb, `rooms/${room.id}/participants/${username}`);
    removeRtdb(participantRef);
    addNotification(`${username} ha sido bloqueado de la sala.`, 'alert');
  };
  
  const handleScrollRepertoire = (direction: 'up' | 'down') => {
    if (repertoireScrollContainerRef.current) {
        scrollDirectionRef.current = direction;
        if (!scrollIntervalRef.current) {
            scrollIntervalRef.current = window.setInterval(() => {
                if (repertoireScrollContainerRef.current && scrollDirectionRef.current) {
                    const scrollAmount = scrollDirectionRef.current === 'up' ? -20 : 20;
                    repertoireScrollContainerRef.current.scrollBy({ top: scrollAmount, behavior: 'smooth' });
                }
            }, 50);
        }
    }
  };

  const stopScroll = () => {
      if (scrollIntervalRef.current) {
          clearInterval(scrollIntervalRef.current);
          scrollIntervalRef.current = null;
          scrollDirectionRef.current = null;
      }
  };

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col ${darkMode ? 'bg-black text-white' : 'bg-white text-slate-900'} transition-colors duration-500`}>
        {/* Encabezado Principal */}
        <header className={`px-4 pt-12 pb-3 border-b ${darkMode ? 'border-slate-800 bg-black' : 'border-slate-100 bg-white'} flex items-center justify-between shrink-0 z-20`}>
          <button onClick={onExitRequest} className="p-2 rounded-full active:scale-90 text-slate-500 dark:text-slate-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
          <div className="text-center">
            <h2 className="text-sm font-black uppercase tracking-tight">Sala en Vivo</h2>
            <div className="flex items-center justify-center gap-2">
              <span className="text-[9px] font-bold text-slate-400">{room.code}</span>
              <button onClick={() => { navigator.clipboard.writeText(room.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="text-slate-400 active:text-misionero-azul">
                  {copied ? <svg className="w-3 h-3 text-misionero-verde" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg> : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>}
              </button>
            </div>
          </div>
          <button onClick={handleOpenParticipants} className="relative p-2 rounded-full text-slate-500 dark:text-slate-400">
            <UsersIcon />
            <div className={`absolute top-1 right-1 w-3 h-3 rounded-full border-2 ${darkMode ? 'border-black' : 'border-white'} ${onlineParticipants.length > 0 ? 'bg-misionero-verde' : 'bg-slate-400'}`}></div>
          </button>
        </header>

        {/* Notificaciones */}
        <div className="absolute top-28 left-1/2 -translate-x-1/2 w-full max-w-sm px-4 z-50 space-y-2">
            {notifications.map(n => (
                <div key={n.id} className={`p-3 rounded-2xl text-[10px] font-black uppercase text-center shadow-lg animate-in fade-in slide-in-from-top-4 duration-300 ${n.type === 'alert' ? 'bg-misionero-rojo text-white' : 'glass-ui text-slate-500 dark:text-slate-200'}`}>
                    {n.message}
                </div>
            ))}
        </div>
        
        {/* Contenido Principal */}
        <div ref={repertoireScrollContainerRef} className="flex-1 overflow-y-auto custom-scroll px-4 pt-4 pb-48">
            {isEditingRepertoire ? (
                <div className="space-y-3 animate-in fade-in duration-300">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Editar Repertorio</h3>
                    <div className={`min-h-[100px] rounded-2xl p-2 space-y-1 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'} border`}>
                        {tempRepertoire.map((songId, index) => {
                            const song = songs.find(s => s.id === songId);
                            if (!song) return null;
                            return (
                                <div
                                    key={songId}
                                    draggable
                                    onDragStart={() => handleDragStart(index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDrop={() => handleDrop(index)}
                                    onDragEnd={handleDragEnd}
                                    className={`flex items-center justify-between p-3 rounded-lg transition-all duration-300 ${draggingIndex === index ? 'opacity-30 bg-misionero-azul/20' : darkMode ? 'bg-slate-800' : 'bg-white'}`}
                                >
                                    {dropIndicator?.index === index && dropIndicator.position === 'before' && <div className="absolute top-0 left-2 right-2 h-0.5 bg-misionero-azul"></div>}
                                    <div className="flex items-center gap-3">
                                        <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold truncate">{song.title}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => removeSongFromTemp(songId)} className="p-1 text-red-500 active:scale-90"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg></button>
                                    {dropIndicator?.index === index && dropIndicator.position === 'after' && <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-misionero-azul"></div>}
                                </div>
                            )
                        })}
                        {tempRepertoire.length === 0 && <p className="text-center text-xs text-slate-400 py-4">Arrastra o añade canciones aquí.</p>}
                    </div>
                     <button
                        onClick={() => setIsAddSongDrawerOpen(true)}
                        className={`w-full py-3 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 ${darkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}
                    >
                        <PlusIcon />
                        <span className="text-xs font-bold">Añadir del repertorio general</span>
                    </button>
                    {isTheHost && repertoireSongs.length > 0 && (
                        <div onMouseDown={() => handleScrollRepertoire('down')} onMouseUp={stopScroll} onMouseLeave={stopScroll} onTouchStart={() => handleScrollRepertoire('down')} onTouchEnd={stopScroll} className="w-full text-center py-2 text-xs font-bold text-slate-400">
                          Mantén presionado para bajar
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-2">
                    {repertoireSongs.length > 0 ? (
                        repertoireSongs.map((song, index) => (
                           <div key={song.id} onClick={() => handleSongSelect(song.id)} className={`relative p-4 rounded-2xl flex items-center justify-between gap-3 active:scale-[0.98] transition-transform cursor-pointer ${darkMode ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-100 shadow-sm'} border`}>
                               {room.currentSongId === song.id && <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-misionero-verde rounded-full animate-pulse"></div>}
                               <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-black uppercase truncate">{song.title}</p>
                                    <p className="text-[8px] text-slate-400 font-bold">{song.key} • {song.author}</p>
                               </div>
                               <span className="text-xl font-black text-slate-200 dark:text-slate-800">#{index+1}</span>
                           </div>
                        ))
                    ) : (
                        <div className={`text-center py-10 rounded-2xl border-2 border-dashed ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                            <p className="text-xs font-bold text-slate-400">No hay canciones en el repertorio.</p>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* Toast de Chat */}
        {isToastVisible && chatToast && (
            <div
                onTouchStart={handleToastTouchStart}
                onTouchMove={handleToastTouchMove}
                onTouchEnd={handleToastTouchEnd}
                onClick={() => {
                    setIsToastVisible(false);
                    handleOpenChat();
                }}
                className="fixed top-28 left-1/2 -translate-x-1/2 w-[90%] max-w-sm z-[150] glass-ui p-4 rounded-3xl shadow-2xl cursor-pointer active:scale-95"
                style={{
                    transition: 'transform 0.3s ease, opacity 0.3s ease',
                    transform: `translateY(${toastTranslateY}px) translateX(-50%)`,
                    opacity: isToastVisible ? 1 : 0,
                }}
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-misionero-azul rounded-full flex items-center justify-center font-black text-white">{chatToast.sender.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                        <h5 className={`text-[10px] font-black uppercase ${darkMode ? 'text-white' : 'text-slate-900'}`}>{chatToast.sender}</h5>
                        <p className={`text-xs truncate ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{chatToast.text.split('\n').pop()}</p>
                    </div>
                </div>
            </div>
        )}

        {/* Floating Action Buttons */}
        <div className="fixed bottom-0 left-0 right-0 z-10 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex items-center justify-between gap-2 max-w-md mx-auto">
            {!isTheHost && (
                <button 
                  onClick={() => setIsFollowingHost(!isFollowingHost)}
                  className={`flex-1 flex items-center justify-center gap-2 font-black uppercase text-[10px] py-4 rounded-2xl transition-all shadow-lg ${isFollowingHost ? 'bg-misionero-verde text-white' : (darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-600')}`}
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d={isFollowingHost ? "M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" : "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"} /></svg>
                    <span>{isFollowingHost ? 'Siguiendo' : 'Libre'}</span>
                </button>
            )}
            {canModify && (
                <button 
                  onClick={isEditingRepertoire ? saveRepertoire : enterEditMode}
                  className={`flex-1 flex items-center justify-center gap-2 font-black uppercase text-[10px] py-4 rounded-2xl transition-all shadow-lg ${isEditingRepertoire ? 'bg-misionero-verde text-white' : (darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-600')}`}
                >
                   {isEditingRepertoire ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>}
                   <span>{isEditingRepertoire ? 'Guardar' : 'Editar'}</span>
                </button>
            )}
             {isEditingRepertoire && (
                <button onClick={cancelEditMode} className={`px-4 py-4 rounded-2xl shadow-lg transition-all ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-600'}`}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>
            )}
            <button 
              onClick={handleOpenChat} 
              className={`flex-1 flex items-center justify-center gap-2 font-black uppercase text-[10px] py-4 rounded-2xl transition-all shadow-lg ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-600'}`}
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                <span>Chat</span>
            </button>
        </div>
        
        {/* Modals y Vistas Flotantes */}
        {selectedSong && <SongViewer song={selectedSong} onBack={handleCloseSong} darkMode={darkMode} onNext={() => {}} onPrev={() => {}} hasNext={false} hasPrev={false} externalTranspose={room.globalTranspositions?.[selectedSong.id] || 0} onTransposeChange={isTheHost ? (val) => handleTransposeChange(selectedSong.id, val) : undefined} onEdit={onEditSong} onDelete={() => onDeleteSong(selectedSong.id)} />}
        {showParticipants && <ParticipantsPanel room={room} onlineParticipants={onlineParticipants} currentUser={currentUser} participantDetails={participantDetails} canModify={canModify} kickUser={kickUser} banUser={banUser} onClose={handleCloseSubView} onViewProfile={onViewProfile} darkMode={darkMode} />}
        {isChatOpen && <ChatPanel room={room} currentUser={currentUser} onClose={handleCloseSubView} chatMessage={chatMessage} setChatMessage={setChatMessage} handleSendChatMessage={handleSendChatMessage} chatScrollRef={chatScrollRef} chatInputRef={chatInputRef} replyingTo={replyingTo} setReplyingTo={setReplyingTo} darkMode={darkMode} typingUsers={typingUsers} updateTypingStatus={updateTypingStatus} />}
        {isAddSongDrawerOpen && <AddSongDrawer allSongs={songsNotInRepertoire} onAdd={addSongToTemp} onClose={() => setIsAddSongDrawerOpen(false)} filter={addSongFilter} setFilter={setAddSongFilter} categories={categories} darkMode={darkMode} />}
        {confirmModal && <ConfirmModal title={confirmModal.title} message={confirmModal.message} action={confirmModal.action} type={confirmModal.type} onClose={() => setConfirmModal(null)} darkMode={darkMode} />}
    </div>
  );
};

const ParticipantsPanel = ({ room, onlineParticipants, currentUser, participantDetails, canModify, kickUser, banUser, onClose, onViewProfile, darkMode }: any) => (
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}>
        <div className={`w-full max-h-[80%] rounded-t-[2.5rem] shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col ${darkMode ? 'bg-slate-900 border-t border-slate-800' : 'bg-white border-t border-slate-200'}`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-4 pb-2 shrink-0"><div className={`w-12 h-1.5 rounded-full ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}></div></div>
            <h3 className={`text-center font-black text-sm uppercase mb-2 px-6 pb-2 border-b ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>Participantes ({onlineParticipants.length})</h3>
            <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-2">
                {onlineParticipants.sort((a,b) => a.localeCompare(b)).map((p: string) => (
                  <div key={p} className={`p-3 rounded-2xl flex items-center justify-between ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                    <div className="flex items-center gap-3">
                       <CrownIcon className={`w-5 h-5 ${p === room.host ? 'text-misionero-amarillo' : 'text-transparent'}`} />
                       <span className="font-bold text-sm">{p} {p === currentUser && <span className="text-xs text-slate-400">(Tú)</span>}</span>
                       {participantDetails[p]?.isAdmin && <span className="text-[7px] font-black bg-misionero-rojo text-white px-1.5 py-0.5 rounded-full uppercase">Admin</span>}
                    </div>
                    {canModify && p !== room.host && (
                        <div className="flex items-center gap-2">
                           <button onClick={() => kickUser(p)} className="p-2 rounded-full text-misionero-amarillo/70 active:bg-misionero-amarillo/10"><DoorIcon /></button>
                           <button onClick={() => banUser(p)} className="p-2 rounded-full text-misionero-rojo/70 active:bg-misionero-rojo/10"><BanIcon /></button>
                        </div>
                    )}
                  </div>
                ))}
            </div>
        </div>
    </div>
);

const ChatPanel = ({ room, currentUser, onClose, chatMessage, setChatMessage, handleSendChatMessage, chatScrollRef, chatInputRef, replyingTo, setReplyingTo, darkMode, typingUsers, updateTypingStatus }: any) => {
    const formatTime = (time: number) => new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const handleReply = (msg: ChatMessage) => {
        setReplyingTo({ sender: msg.sender, text: msg.text });
        chatInputRef.current?.focus();
    };
    
    return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-slate-50 dark:bg-black animate-in slide-in-from-right duration-300">
        <header className={`px-4 pt-12 pb-3 border-b ${darkMode ? 'border-slate-800' : 'bg-black'} flex items-center justify-between shrink-0`}>
          <button onClick={onClose} className="p-2 rounded-full active:scale-90 text-slate-500 dark:text-slate-400"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg></button>
          <h3 className="text-sm font-black uppercase tracking-tight">Chat de la Sala</h3>
          <div className="w-10"></div>
        </header>
        <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scroll">
            {(room.chat || []).map((msg: ChatMessage, index: number) => (
                <SwipeableMessage key={index} msg={msg} currentUser={currentUser} onReply={handleReply} darkMode={darkMode} formatTime={formatTime} />
            ))}
             {typingUsers.length > 0 && (
                <div className="flex items-end gap-2 flex-row animate-in fade-in duration-300">
                    <div className="flex flex-col items-start max-w-[85%]">
                        <div className={`p-3.5 rounded-2xl shadow-sm ${darkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>
                           <div className={`flex items-center justify-center h-5 gap-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}><span className="typing-dot"></span><span className="typing-dot" style={{animationDelay: '0.2s'}}></span><span className="typing-dot" style={{animationDelay: '0.4s'}}></span></div>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 px-1">
                            <span className={`text-[8px] font-black uppercase ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>{typingUsers.join(', ')}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
        <div className={`p-3 border-t shrink-0 ${darkMode ? 'border-slate-800 bg-black' : 'border-slate-100 bg-slate-50'} pb-[calc(0.75rem+env(safe-area-inset-bottom))]`}>
            {replyingTo && (
                <div className={`flex items-center justify-between px-4 py-2 mb-2 rounded-xl text-xs font-medium border-l-4 border-misionero-azul ${darkMode ? 'bg-slate-900 text-slate-300' : 'bg-slate-50 text-slate-600'}`}>
                    <div className="min-w-0">
                        <span className="text-[8px] font-black uppercase text-misionero-azul">Respondiendo a {replyingTo.sender}</span>
                        <p className="truncate">{replyingTo.text.split('\n').pop()}</p>
                    </div>
                    <button onClick={() => setReplyingTo(null)} className="p-1"><svg className="w-4 h-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
                </div>
            )}
            <div className="flex gap-2 items-end">
                <input ref={chatInputRef} value={chatMessage} onChange={e => { setChatMessage(e.target.value); updateTypingStatus(true); }} placeholder="Escribe un mensaje..." className={`flex-1 min-w-0 rounded-2xl px-4 py-3 text-sm font-bold outline-none border transition-all ${darkMode ? 'bg-black border-white/5 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} onKeyDown={e => e.key === 'Enter' && handleSendChatMessage()}/>
                <button onClick={handleSendChatMessage} className="bg-misionero-verde text-white font-black w-12 h-12 rounded-2xl shadow-md active:scale-95 transition-transform flex items-center justify-center shrink-0"><svg className="w-5 h-5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg></button>
            </div>
        </div>
    </div>
)};

const AddSongDrawer = ({ allSongs, onAdd, onClose, filter, setFilter, categories, darkMode }: any) => (
  <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}>
    <div className={`w-full max-h-[85%] rounded-t-[2.5rem] shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col ${darkMode ? 'bg-black border-t border-slate-800' : 'bg-white border-t border-slate-200'}`} onClick={e => e.stopPropagation()}>
      <div className="flex justify-center pt-4 pb-2 shrink-0"><div className={`w-12 h-1.5 rounded-full ${darkMode ? 'bg-slate-800' : 'bg-slate-700'}`}></div></div>
      <h3 className={`text-center font-black text-sm uppercase mb-2 px-6 pb-2 border-b ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>Añadir al Repertorio</h3>
      <div className="p-4 shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 custom-scroll">
              {['Todos', ...categories].map((f: string) => (
                <button key={f} onClick={() => setFilter(f)} className={`px-5 py-2 rounded-full text-[9px] font-black uppercase shrink-0 transition-all ${filter === f ? 'bg-misionero-azul text-white' : 'glass-ui text-slate-400'}`}>{f}</button>
              ))}
          </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scroll p-4 pt-0 space-y-2">
        {allSongs.map((song: Song) => (
          <div key={song.id} className={`flex items-center justify-between p-3 rounded-xl ${darkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
            <div>
              <p className="text-xs font-bold">{song.title}</p>
              <p className="text-[9px] text-slate-400">{song.author}</p>
            </div>
            <button onClick={() => onAdd(song.id)} className="p-2 bg-misionero-verde text-white rounded-full active:scale-90 transition-transform"><PlusIcon /></button>
          </div>
        ))}
        {allSongs.length === 0 && <p className="text-center text-xs text-slate-400 py-4">No hay más canciones para añadir.</p>}
      </div>
    </div>
  </div>
);

const ConfirmModal = ({ title, message, action, type, onClose, darkMode }: any) => (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 animate-in fade-in duration-200">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
        <div className={`relative w-full max-w-sm p-6 rounded-[2.5rem] shadow-2xl border animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-black border-white/10' : 'bg-white border-slate-100'}`}>
            <h3 className={`text-center font-black text-lg uppercase mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{title}</h3>
            <p className={`text-center text-xs font-bold mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{message}</p>
            <div className="flex gap-3">
                <button onClick={onClose} className={`flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-colors ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>Cancelar</button>
                <button onClick={action} className={`flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-white shadow-lg active:scale-95 transition-transform ${type === 'danger' ? 'bg-misionero-rojo' : 'bg-misionero-azul'}`}>Confirmar</button>
            </div>
        </div>
    </div>
);

export default RoomView;
