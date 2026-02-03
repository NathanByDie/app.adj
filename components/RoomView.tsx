import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Room, Song, ChatMessage, User as AppUser, LiturgicalTime } from '../types';
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
  writeBatch,
  serverTimestamp,
  increment,
  setDoc
} from "firebase/firestore";
import { 
  ref as refRtdb, onValue as onValueRtdb, query as queryRtdb, 
  limitToLast, push as pushRtdb, serverTimestamp as serverTimestampRtdb, 
  set as setRtdb, remove as removeRtdb, onChildAdded, onDisconnect 
} from "firebase/database";
import { transposeSong } from '../services/musicUtils';
import { triggerHapticFeedback } from '../services/haptics';
import { PlusIcon, UsersIcon } from '../constants';
import useCachedMedia from '../hooks/useCachedMedia';
import { SecureMessenger } from '../services/security';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

interface RoomViewProps {
  room: Room;
  songs: Song[];
  currentUser: AppUser;
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

const getLiturgicalColorClass = (category: string) => {
  const map: Record<string, string> = {
    [LiturgicalTime.ADVIENTO]: 'text-misionero-azul',
    [LiturgicalTime.NAVIDAD]: 'text-misionero-amarillo',
    [LiturgicalTime.CUARESMA]: 'text-misionero-rojo',
    [LiturgicalTime.PASCUA]: 'text-misionero-amarillo',
    [LiturgicalTime.ORDINARIO]: 'text-misionero-verde',
    [LiturgicalTime.ANIMACION]: 'text-misionero-amarillo',
    [LiturgicalTime.MEDITACION]: 'text-misionero-azul',
    [LiturgicalTime.PURISIMA]: 'text-misionero-azul',
    [LiturgicalTime.VIRGEN]: 'text-misionero-azul',
  };
  return map[category] || 'text-slate-400';
};

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

const CheckIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-6 h-6"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
);

const SearchIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-5 h-5"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
);

const PlusSymbolIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-6 h-6"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
);

const ChatBubbleIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-6 h-6"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
    </svg>
);

const generateChatId = (uid1: string, uid2: string): string => [uid1, uid2].sort().join('_');

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

const ParticipantItem: React.FC<{
    name: string;
    details: { id: string, photoURL?: string, isAdmin: boolean } | undefined;
    isHost: boolean;
    isMe: boolean;
    canModify: boolean;
    kickUser: (name: string) => void;
    banUser: (name: string) => void;
    onViewProfile: (uid: string) => void;
    darkMode: boolean;
    transferHost: (name: string) => void;
}> = ({ name, details, isHost, isMe, canModify, kickUser, banUser, onViewProfile, darkMode, transferHost }) => {
    const cachedPhoto = useCachedMedia(details?.photoURL);

    return (
        <div 
            onClick={() => details?.id && onViewProfile(details.id)}
            className={`p-3 rounded-2xl flex items-center justify-between active:scale-[0.98] transition-transform ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}
        >
            <div className="flex items-center gap-3 min-w-0">
                <div className="relative shrink-0">
                    {cachedPhoto ? (
                        <img src={cachedPhoto} alt={name} className="w-10 h-10 rounded-full object-cover shadow-sm" />
                    ) : (
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-white text-lg shadow-sm ${isHost ? 'bg-misionero-amarillo' : 'bg-misionero-azul'}`}>
                            {name.charAt(0).toUpperCase()}
                        </div>
                    )}
                    {isHost && (
                        <div className="absolute -top-1 -right-1 bg-white dark:bg-slate-800 rounded-full p-0.5 shadow-sm">
                            <CrownIcon className="w-3.5 h-3.5 text-misionero-amarillo" />
                        </div>
                    )}
                </div>
                
                <div className="min-w-0 flex flex-col">
                    <span className="font-bold text-sm truncate">
                        {name} {isMe && <span className="text-xs text-slate-400 font-normal">(Tú)</span>}
                    </span>
                    {details?.isAdmin && (
                        <span className="text-[8px] font-black text-misionero-rojo uppercase tracking-wider">
                            Administrador
                        </span>
                    )}
                </div>
            </div>

            {canModify && !isMe && (
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => transferHost(name)} title="Hacer Anfitrión" className="p-2 rounded-full text-misionero-amarillo/80 active:bg-misionero-amarillo/10 transition-colors"><CrownIcon /></button>
                    <button onClick={() => kickUser(name)} title="Expulsar" className="p-2 rounded-full text-slate-400 active:bg-slate-500/10 transition-colors"><DoorIcon /></button>
                    <button onClick={() => banUser(name)} title="Bloquear" className="p-2 rounded-full text-red-500/70 active:bg-red-500/10 transition-colors"><BanIcon /></button>
                </div>
            )}
        </div>
    );
};

const RoomView: React.FC<RoomViewProps> = ({ 
    room, songs, currentUser: currentUserData, isAdmin, onExitRequest, onUpdateRoom, darkMode = false, db, rtdb,
    onEditSong, onDeleteSong, categories, allUsers, onViewProfile
}) => {
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const currentUser = currentUserData.username;
  
  const isTheHost = currentUser === room.host;
  const canModify = isAdmin || isTheHost;

  const [isEditingRepertoire, setIsEditingRepertoire] = useState(room.repertoire.length === 0 && canModify);
  const [tempRepertoire, setTempRepertoire] = useState<string[]>([]);
  const [displayedRepertoire, setDisplayedRepertoire] = useState<string[]>(room.repertoire);
  
  const [onlineParticipants, setOnlineParticipants] = useState<string[]>([]);
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showParticipants, setShowParticipants] = useState(false);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [shareSearchQuery, setShareSearchQuery] = useState('');
  const [sentInvitations, setSentInvitations] = useState<string[]>([]);
  const [participantDetails, setParticipantDetails] = useState<Record<string, { id: string, photoURL?: string, isAdmin: boolean }>>({});

  const addNotification = useCallback((message: string, type: 'info' | 'success' | 'alert' = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  }, []);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [liveChat, setLiveChat] = useState<ChatMessage[]>([]);
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
  const notificationAudio = useRef<HTMLAudioElement | null>(null);
  const lastSyncedHostSongId = useRef<string | undefined>(undefined);
  const roomRef = useRef(room);
  roomRef.current = room;

  const transposedContentCache = useRef<Record<string, string>>({});
  const prevSongsRef = useRef<Song[]>();

  const repertoireScrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<number | null>(null);
  const scrollDirectionRef = useRef<'up' | 'down' | null>(null);

  const transferHost = (username: string) => {
    setConfirmModal({
        title: 'Transferir Anfitrión',
        message: `¿Estás seguro de que quieres hacer a ${username} el nuevo anfitrión? Perderás tus privilegios de anfitrión.`,
        action: () => {
            onUpdateRoom(room.id, { host: username });
            addNotification(`${username} es ahora el anfitrión.`, 'success');
            setConfirmModal(null);
        },
        type: 'warning',
    });
  };
  
  const handleCloseSong = useCallback(() => {
    setSelectedSongId(null);
    const currentState = window.history.state;
    if (currentState?.overlay?.startsWith('room-')) {
        window.history.back();
    }
  }, []);
  
  const handleCloseSubView = useCallback(() => {
      const currentState = window.history.state;
      if (currentState?.overlay?.startsWith('room-')) {
          window.history.back();
      } else {
          setIsChatOpen(false);
          setShowParticipants(false);
      }
  }, []);

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

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
        const overlay = event.state?.overlay;
        if (overlay !== 'room-chat') setIsChatOpen(false);
        if (overlay !== 'room-participants') setShowParticipants(false);
        if (overlay !== 'room-song') setSelectedSongId(null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
        window.removeEventListener('popstate', handlePopState);
    };
  }, []);
  
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = CapacitorApp.addListener('backButton', () => {
        if (confirmModal) {
            setConfirmModal(null);
            return;
        }
        if (isAddSongDrawerOpen) {
            setIsAddSongDrawerOpen(false);
            return;
        }
        if (isShareMenuOpen) {
            setIsShareMenuOpen(false);
            return;
        }
        if (isChatOpen || showParticipants) {
            handleCloseSubView();
            return;
        }
        if (selectedSongId) {
            handleCloseSong();
            return;
        }
        onExitRequest();
    });

    return () => {
        listener.then(l => l.remove());
    };
  }, [
    isChatOpen, 
    showParticipants, 
    selectedSongId, 
    onExitRequest, 
    handleCloseSubView, 
    handleCloseSong,
    confirmModal,
    isAddSongDrawerOpen,
    isShareMenuOpen
  ]);
  // --- FIN GESTIÓN NAVEGACIÓN ---

  useEffect(() => {
      const chatRef = refRtdb(rtdb, `chats/${room.id}`);
      const unsubscribe = onValueRtdb(chatRef, (snapshot) => {
          const chatData = snapshot.val();
          if (chatData) {
              const messagesArray = Object.values(chatData) as ChatMessage[];
              messagesArray.sort((a, b) => a.timestamp - b.timestamp);
              setLiveChat(messagesArray);
          } else {
              setLiveChat([]);
          }
      });
      return () => unsubscribe();
  }, [room.id, rtdb]);

  const handleSendInvitation = async (partner: AppUser) => {
      setSentInvitations(prev => [...prev, partner.id]);
  
      const chatId = generateChatId(currentUserData.id, partner.id);
      const messageText = `[INVITE_SALA]${room.code}`;
      const encryptedText = await SecureMessenger.encrypt(messageText, chatId);
  
      const newMsgRef = doc(collection(db, 'chats', chatId, 'messages'));
      const commonChatInfo = {
          lastMessageText: 'Te ha invitado a una sala',
          lastMessageTimestamp: serverTimestamp(),
          lastMessageSenderId: currentUserData.id,
      };
  
      try {
          // --- Batch 1: Authorized writes ---
          const batch = writeBatch(db);
          
          // 1. Write the message
          batch.set(newMsgRef, {
              senderId: currentUserData.id,
              timestamp: serverTimestamp(),
              read: false,
              type: 'text',
              text: encryptedText,
              encrypted: true
          });
  
          // 2. Update sender's chat list
          batch.set(doc(db, 'user_chats', currentUserData.id, 'chats', chatId), { 
              ...commonChatInfo, 
              partnerId: partner.id, 
              partnerUsername: partner.username, 
              partnerPhotoURL: partner.photoURL || null 
          }, { merge: true });
  
          await batch.commit();
  
          // --- Operation 2: Best-effort write to partner's list ---
          try {
              await setDoc(doc(db, 'user_chats', partner.id, 'chats', chatId), { 
                  ...commonChatInfo, 
                  partnerId: currentUserData.id, 
                  partnerUsername: currentUserData.username, 
                  partnerPhotoURL: currentUserData.photoURL || null, 
                  unreadCount: increment(1) 
              }, { merge: true });
          } catch (partnerUpdateError) {
              console.warn("Could not update recipient's chat list (expected permission issue). ChatSyncManager will handle it.", partnerUpdateError);
          }
  
      } catch (error) {
          console.error("Error sending invitation:", error);
          // Remove from sent list on error to allow retry
          setSentInvitations(prev => prev.filter(id => id !== partner.id)); 
          alert("Error al enviar la invitación.");
          return; // Stop execution
      }
  
      // Success timeout
      setTimeout(() => {
          setSentInvitations(prev => prev.filter(id => id !== partner.id));
      }, 2000);
  };

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
  }, [isChatOpen, liveChat, typingUsers]);

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

  const handleSongSelect = useCallback((songId: string) => {
    setSelectedSongId(songId);
    openSubView('song');
    
    if (canModify) {
      onUpdateRoom(room.id, { currentSongId: songId });
    }
  }, [canModify, onUpdateRoom, room.id]);

  const handleTransposeChange = (songId: string, value: number) => {
    onUpdateRoom(room.id, {
      globalTranspositions: {
        ...room.globalTranspositions,
        [songId]: value
      }
    });
  };

  const selectedSong = useMemo(() => {
    if (!selectedSongId) return undefined;
    return songs.find(s => s.id === selectedSongId);
  }, [selectedSongId, songs]);

  const repertoireSongs = useMemo(() => {
    return displayedRepertoire.map(songId => songs.find(s => s.id === songId)).filter((s): s is Song => !!s);
  }, [displayedRepertoire, songs]);
  
  const songsNotInRepertoire = useMemo(() => {
    return songs.filter(s => addSongFilter === 'Todos' || s.category === addSongFilter);
  }, [songs, addSongFilter]);

  const selectedSongIndex = useMemo(() => {
    if (!selectedSongId) return -1;
    return repertoireSongs.findIndex(s => s.id === selectedSongId);
  }, [selectedSongId, repertoireSongs]);

  const handleNextSong = useCallback(() => {
    if (selectedSongIndex > -1 && selectedSongIndex < repertoireSongs.length - 1) {
        const nextSong = repertoireSongs[selectedSongIndex + 1];
        handleSongSelect(nextSong.id);
    }
  }, [selectedSongIndex, repertoireSongs, handleSongSelect]);

  const handlePrevSong = useCallback(() => {
    if (selectedSongIndex > 0) {
        const prevSong = repertoireSongs[selectedSongIndex - 1];
        handleSongSelect(prevSong.id);
    }
  }, [selectedSongIndex, repertoireSongs, handleSongSelect]);

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

  const toggleSongInTemp = (songId: string) => {
    setTempRepertoire(prev => {
        if (prev.includes(songId)) {
            return prev.filter(id => id !== songId);
        } else {
            return [...prev, songId];
        }
    });
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
    const hostSongId = room.currentSongId;
    if (isFollowingHost && !canModify && hostSongId && hostSongId !== selectedSongId && hostSongId !== lastSyncedHostSongId.current) {
        lastSyncedHostSongId.current = hostSongId;
        setSelectedSongId(hostSongId);
        openSubView('song');
    }
  }, [room.currentSongId, isFollowingHost, canModify, selectedSongId]);

  useEffect(() => {
    const checkParticipantRoles = async () => {
      const details: Record<string, { id: string, photoURL?: string, isAdmin: boolean }> = {};
      const q = query(collection(db, 'users'), where('username', 'in', onlineParticipants));
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach(doc => {
        const userData = doc.data();
        details[userData.username] = { 
            id: doc.id,
            photoURL: userData.photoURL,
            isAdmin: userData.role === 'admin' 
        };
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
      // Notifications for users joining or leaving have been removed as per user request.
      prevParticipants.current = onlineParticipants;
    }
  }, [onlineParticipants]);
  
  useEffect(() => {
    const chatRef = refRtdb(rtdb, `chats/${room.id}`);
    const q = queryRtdb(chatRef, limitToLast(1));
    const unsubscribe = onChildAdded(q, (snapshot) => {
      const newMsg = snapshot.val();
      if (newMsg && newMsg.timestamp > (liveChat?.[liveChat.length - 1]?.timestamp || 0)) {
        if (!isChatOpen && newMsg.sender !== currentUser) {
          triggerHapticFeedback('light');
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
  }, [isChatOpen, currentUser, rtdb, room.id, liveChat]);

  const handleToastTouchStart = (e: React.TouchEvent) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (toastExitTimerRef.current) clearTimeout(toastExitTimerRef.current);
    toastTouchStartY.current = e.touches[0].clientY;
  };
  
  const handleToastTouchMove = (e: React.TouchEvent) => {
    if (toastTouchStartY.current === null) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - toastTouchStartY.current;
    if (deltaY < 0) { 
      setToastTranslateY(deltaY);
    }
  };

  const handleToastTouchEnd = () => {
    if (toastTranslateY < -50) { 
      setIsToastVisible(false);
    } else { 
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
    
    const participantRef = refRtdb(rtdb, `rooms/${room.id}/participants/${username}`);
    removeRtdb(participantRef);
    addNotification(`${username} ha sido expulsado.`, 'alert');
  };

  const banUser = (username: string) => {
    const roomDocRef = doc(db, 'rooms', room.id);
    updateDoc(roomDocRef, {
      participants: arrayRemove(username),
      banned: arrayRemove(username) 
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
  
  const handleDeleteRequest = (song: Song) => {
    setConfirmModal({
        title: "Eliminar Música",
        message: `¿Estás seguro de que quieres eliminar "${song.title}"? Esta acción es permanente.`,
        action: async () => {
            await onDeleteSong(song.id);
            handleCloseSong();
            setConfirmModal(null);
        },
        type: 'danger'
    });
  };

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col ${darkMode ? 'bg-black text-white' : 'bg-white text-slate-900'} transition-colors duration-500`}>
        {/* Encabezado Principal */}
        <header className={`px-4 pt-12 pb-3 border-b ${darkMode ? 'border-slate-800 bg-black' : 'border-slate-100 bg-white'} ${selectedSongId ? 'hidden' : 'flex'} items-center justify-between shrink-0 z-20 transition-all duration-300`}>
          {isEditingRepertoire ? (
              // ENCABEZADO DE EDICIÓN
              <>
                <button onClick={cancelEditMode} className={`text-[10px] font-black uppercase tracking-wider px-3 py-2 rounded-xl transition-colors ${darkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}>
                    Cancelar
                </button>
                <h2 className="text-sm font-black uppercase tracking-tight text-misionero-azul">Editando</h2>
                <button onClick={saveRepertoire} className="bg-misionero-verde text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all flex items-center gap-1.5">
                    <CheckIcon className="w-4 h-4" />
                    <span>Guardar</span>
                </button>
              </>
          ) : (
              // ENCABEZADO NORMAL
              <>
                <div className="flex justify-start">
                  <button onClick={onExitRequest} className="p-2 rounded-full active:scale-90 text-slate-500 dark:text-slate-400">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
                <div className="text-center">
                    <h2 className="text-sm font-black uppercase tracking-tight">Sala en Vivo</h2>
                    <button 
                        onClick={() => setIsShareMenuOpen(true)}
                        className={`mt-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-full transition-all active:scale-95 ${darkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                        <span className="font-mono font-bold text-xs tracking-widest">{room.code}</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                    </button>
                </div>
                <div className="flex justify-end items-center gap-2">
                    {canModify && (
                        <button onClick={enterEditMode} className={`p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors`}>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                    )}
                    <button onClick={handleOpenChat} className="p-2 rounded-full text-slate-500 dark:text-slate-400">
                         <ChatBubbleIcon />
                    </button>
                    <button onClick={handleOpenParticipants} className="relative p-2 rounded-full text-slate-500 dark:text-slate-400">
                        <UsersIcon />
                        <div className={`absolute top-1 right-1 w-3 h-3 rounded-full border-2 ${darkMode ? 'border-black' : 'border-white'} ${onlineParticipants.length > 0 ? 'bg-misionero-verde' : 'bg-slate-400'}`}></div>
                    </button>
                </div>
              </>
          )}
        </header>

        {/* Notificaciones */}
        <div className="absolute top-28 left-1/2 -translate-x-1/2 w-full max-w-sm px-4 z-50 space-y-2 pointer-events-none">
            {notifications.map(n => (
                <div key={n.id} className={`p-3 rounded-2xl text-[10px] font-black uppercase text-center shadow-lg animate-in fade-in slide-in-from-top-4 duration-300 ${n.type === 'alert' ? 'bg-misionero-rojo text-white' : 'glass-ui text-slate-500 dark:text-slate-200'}`}>
                    {n.message}
                </div>
            ))}
        </div>
        
        {/* Contenido Principal */}
        <div ref={repertoireScrollContainerRef} className="flex-1 overflow-y-auto custom-scroll px-4 pt-4 pb-28">
            {isEditingRepertoire ? (
                <div className="space-y-4 animate-in fade-in duration-300 pb-20">
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
                                        <div className="cursor-move text-slate-300">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16"/></svg>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold truncate">{song.title}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => removeSongFromTemp(songId)} className="p-1 text-red-500 active:scale-90"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg></button>
                                    {dropIndicator?.index === index && dropIndicator.position === 'after' && <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-misionero-azul"></div>}
                                </div>
                            )
                        })}
                        {tempRepertoire.length === 0 && <p className="text-center text-xs text-slate-400 py-8">La lista está vacía.</p>}
                    </div>
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
                className="fixed top-[calc(env(safe-area-inset-top)+0.5rem)] left-1/2 -translate-x-1/2 w-[90%] max-w-sm z-[150] glass-ui p-2 rounded-2xl shadow-2xl cursor-pointer active:scale-95"
                style={{
                    transition: 'transform 0.3s ease, opacity 0.3s ease',
                    transform: `translateY(${toastTranslateY}px) translateX(-50%)`,
                    opacity: isToastVisible ? 1 : 0,
                }}
            >
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-misionero-azul rounded-full flex items-center justify-center font-black text-white text-sm">{chatToast.sender.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                        <h5 className={`text-[10px] font-black uppercase ${darkMode ? 'text-white' : 'text-slate-900'}`}>{chatToast.sender}</h5>
                        <p className={`text-xs truncate ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{chatToast.text.split('\n').pop()}</p>
                    </div>
                </div>
            </div>
        )}

        {/* Botón Flotante para Seguir al Host */}
        {!canModify && !isEditingRepertoire && !selectedSongId && (
            <div className="fixed bottom-24 right-6 z-40 flex items-center gap-2 glass-ui p-2 rounded-full shadow-lg animate-in fade-in duration-300">
                <span className="text-[10px] font-black uppercase px-2 text-slate-400">Host</span>
                <button 
                    onClick={() => setIsFollowingHost(prev => !prev)}
                    className={`w-12 h-8 rounded-full p-1 transition-colors duration-300 ${isFollowingHost ? 'bg-misionero-verde' : (darkMode ? 'bg-slate-700' : 'bg-slate-200')}`}
                >
                    <div className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-300 ${isFollowingHost ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </button>
            </div>
        )}

        {/* Input de Chat o Botones de Acción */}
        <div className={`fixed bottom-0 left-0 right-0 z-30 transition-all duration-300 max-w-md mx-auto
            ${selectedSongId || isChatOpen ? 'opacity-0 pointer-events-none -translate-y-4' : 'opacity-100'}`}
        >
             {isEditingRepertoire ? (
                 <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                    <button 
                        onClick={() => setIsAddSongDrawerOpen(true)}
                        className="w-full bg-misionero-azul text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-transform flex items-center justify-center gap-2"
                    >
                        <div className="scale-75"><PlusIcon /></div>
                        <span>Añadir música al repertorio</span>
                    </button>
                 </div>
            ) : (
                <div className={`p-3 border-t ${darkMode ? 'border-slate-800 bg-black' : 'border-slate-100 bg-slate-50'} pb-[calc(0.75rem+env(safe-area-inset-bottom))]`}>
                    <div className="flex gap-2 items-end">
                        <input 
                            ref={chatInputRef} 
                            value={chatMessage} 
                            onChange={e => { setChatMessage(e.target.value); updateTypingStatus(true); }} 
                            placeholder="Enviar mensaje..." 
                            className={`flex-1 min-w-0 rounded-2xl px-4 py-3 text-sm font-bold outline-none border transition-all ${darkMode ? 'bg-black border-white/5 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} 
                            onKeyDown={e => { 
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (replyingTo) setReplyingTo(null);
                                    handleSendChatMessage();
                                }
                            }}
                        />
                        <button 
                            onClick={() => {
                                if (replyingTo) setReplyingTo(null);
                                handleSendChatMessage();
                            }} 
                            className="bg-misionero-verde text-white font-black w-12 h-12 rounded-2xl shadow-md active:scale-95 transition-transform flex items-center justify-center shrink-0"
                        >
                            <svg className="w-5 h-5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
        
        {/* Modals y Vistas Flotantes */}
        {selectedSong && (
            <SongViewer 
                song={selectedSong} 
                onBack={handleCloseSong} 
                darkMode={darkMode} 
                onNext={handleNextSong}
                onPrev={handlePrevSong}
                hasNext={selectedSongIndex < repertoireSongs.length - 1}
                hasPrev={selectedSongIndex > 0}
                externalTranspose={room.globalTranspositions?.[selectedSong.id] || 0} 
                onTransposeChange={canModify ? (val) => handleTransposeChange(selectedSong.id, val) : undefined} 
                onEdit={canModify ? () => onEditSong(selectedSong) : undefined} 
                onDelete={canModify ? () => handleDeleteRequest(selectedSong) : undefined}
            />
        )}
        {showParticipants && <ParticipantsPanel room={room} onlineParticipants={onlineParticipants} currentUser={currentUser} participantDetails={participantDetails} canModify={canModify} kickUser={kickUser} banUser={banUser} onClose={handleCloseSubView} onViewProfile={onViewProfile} darkMode={darkMode} transferHost={transferHost} />}
        {isChatOpen && <ChatPanel messages={liveChat} currentUser={currentUser} onClose={handleCloseSubView} chatMessage={chatMessage} setChatMessage={setChatMessage} handleSendChatMessage={handleSendChatMessage} chatScrollRef={chatScrollRef} chatInputRef={chatInputRef} replyingTo={replyingTo} setReplyingTo={setReplyingTo} darkMode={darkMode} typingUsers={typingUsers} updateTypingStatus={updateTypingStatus} />}
        {isAddSongDrawerOpen && <AddSongDrawer allSongs={songsNotInRepertoire} onToggle={toggleSongInTemp} selectedIds={tempRepertoire} onClose={() => setIsAddSongDrawerOpen(false)} filter={addSongFilter} setFilter={setAddSongFilter} categories={categories} darkMode={darkMode} />}
        {confirmModal && <ConfirmModal title={confirmModal.title} message={confirmModal.message} action={confirmModal.action} type={confirmModal.type} onClose={() => setConfirmModal(null)} darkMode={darkMode} />}
        {isShareMenuOpen && <ShareMenu room={room} allUsers={allUsers} currentUser={currentUserData} onClose={() => setIsShareMenuOpen(false)} onSendInvitation={handleSendInvitation} darkMode={darkMode} />}

    </div>
  );
};

const ShareMenu: React.FC<{ room: Room, allUsers: AppUser[], currentUser: AppUser, onClose: () => void, onSendInvitation: (partner: AppUser) => void, darkMode: boolean }> = ({ room, allUsers, currentUser, onClose, onSendInvitation, darkMode }) => {
    const [search, setSearch] = useState('');
    const [sent, setSent] = useState<string[]>([]);
    
    const shareMessage = `¡Únete a mi sala en ADJStudios! Código: ${room.code}. Entra a la app aquí: https://myadjstudios.netlify.app`;
    const whatsappLink = `whatsapp://send?text=${encodeURIComponent(shareMessage)}`;
    const smsLink = `sms:?&body=${encodeURIComponent(shareMessage)}`;

    const filteredUsers = useMemo(() => {
        const lowerCaseSearch = search.toLowerCase();
        return allUsers.filter(u => 
            u.id !== currentUser.id &&
            (u.username_lowercase ? u.username_lowercase.includes(lowerCaseSearch) : (u.username && u.username.toLowerCase().includes(lowerCaseSearch)))
        );
    }, [allUsers, search, currentUser.id]);

    const handleSend = (user: AppUser) => {
        onSendInvitation(user);
        setSent(prev => [...prev, user.id]);
        setTimeout(() => setSent(prev => prev.filter(id => id !== user.id)), 2000);
    };

    return (
        <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}>
            <div className={`w-full max-h-[85%] rounded-t-[2.5rem] shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-300 ${darkMode ? 'bg-slate-900 border-t border-slate-800' : 'bg-white border-t border-slate-200'}`} onClick={e => e.stopPropagation()}>
                <div className="flex justify-center pt-4 pb-2 shrink-0"><div className={`w-12 h-1.5 rounded-full ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}></div></div>
                <h3 className={`text-center font-black text-sm uppercase mb-4 px-6 pb-2 shrink-0`}>Compartir Sala</h3>

                <div className="px-4 space-y-4 shrink-0">
                    <div className="grid grid-cols-2 gap-3">
                        <a href={whatsappLink} data-action="share/whatsapp/share" className="flex items-center justify-center gap-2 p-3 rounded-2xl bg-[#25D366] text-white font-bold text-sm shadow-lg active:scale-95 transition-transform"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M16.75,13.96C17,14.26 17.2,14.76 17,15.26C16.8,15.76 16.3,16.06 15.9,16.26C15.5,16.46 14.8,16.66 14,16.36C12.4,15.76 11.1,14.76 10.1,13.46C9.3,12.36 8.9,11.16 9,10.06C9.1,9.56 9.3,9.26 9.5,9.06C9.7,8.86 9.9,8.76 10.1,8.76C10.3,8.76 10.5,8.76 10.6,8.86C10.8,8.96 11,9.06 11.1,9.36C11.2,9.66 11.3,9.86 11.3,10.06C11.4,10.26 11.4,10.46 11.3,10.66C11.3,10.86 11.2,11.06 11.1,11.16C11,11.26 10.9,11.36 10.8,11.46C10.7,11.56 10.6,11.66 10.5,11.66C10.4,11.76 10.5,11.86 10.6,11.96C10.8,12.26 11.1,12.66 11.5,13.06C12.1,13.66 12.6,13.96 12.9,14.06C13,14.16 13.1,14.16 13.2,14.06C13.3,13.96 13.4,13.86 13.5,13.76C13.6,13.56 13.8,13.46 14,13.46C14.2,13.46 14.4,13.56 14.6,13.76C14.8,13.86 15.1,14.26 15.3,14.56C15.5,14.86 15.7,15.06 15.8,15.16C15.9,15.26 16.1,15.36 16.2,15.36C16.5,15.36 16.8,15.16 16.9,14.86C15.2,12.66 14.9,10.26 15.7,8.36C16.6,6.46 18.2,5.16 20.1,4.46C20.6,4.26 21,4.46 21.3,4.86L22,5.56C22.3,5.86 22.4,6.36 22.2,6.76C19.9,10.56 19.4,14.66 21.2,18.46C21.4,18.86 21.2,19.36 20.8,19.66L20.1,20.36C19.7,20.66 19.2,20.76 18.8,20.56C14.5,18.56 12.3,13.76 13.3,9.56C13.5,8.76 13.8,7.96 14.3,7.26L13.1,6.16C11.3,6.06 9.6,6.66 8.3,7.76C5.2,10.16 5,14.26 7.4,17.36C9.1,19.56 11.8,20.86 14.5,20.86C15.9,20.86 17.3,20.46 18.5,19.76L19.4,20.66C19.8,21.06 20.5,21.06 20.9,20.66L22.3,19.26C22.7,18.86 22.7,18.16 22.3,17.76C21.8,17.26 21.3,16.76 20.9,16.16C20.5,15.56 20.2,14.86 20.1,14.16C19.9,13.46 20,12.76 20.2,12.06C20.4,11.36 20.8,10.76 21.3,10.26L21.5,10.06C21.9,9.66 22.5,9.86 22.5,10.46C22.5,10.96 22.3,11.56 22,12.06C20.4,15.46 21.2,19.46 24,22.26C24,22.26 24,22.26 24,22.26C24,22.76 23.5,23.26 23,23.26C22.5,23.26 22,22.76 22,22.26C21.8,22.06 21.7,21.86 21.5,21.66C18.1,17.86 18.8,13.16 20.8,9.86L20.6,9.66C17.7,11.26 17.3,15.16 19.5,18.26L18.6,19.16C17.7,18.26 16.9,17.56 16.3,16.66C15.6,15.76 15.1,14.76 15,13.76C14.9,12.76 15,11.76 15.3,10.86L15.5,10.36C15.7,9.86 15.6,9.26 15.1,8.96L14.4,8.26C14,7.96 13.4,8.06 13.1,8.46C12.8,8.86 12.6,9.36 12.5,9.86C12.3,11.06 12.6,12.26 13.2,13.36C13.9,14.56 14.9,15.46 16.2,15.96C16.4,16.06 16.6,15.96 16.75,13.96Z"/></svg><span>WhatsApp</span></a>
                        <a href={smsLink} className="flex items-center justify-center gap-2 p-3 rounded-2xl bg-[#007BFF] text-white font-bold text-sm shadow-lg active:scale-95 transition-transform"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M22 4H2.01L2 20h20V4zm-2 14H4V8l8 5 8-5v10zM12 11L4 6h16l-8 5z"/></svg><span>SMS</span></a>
                    </div>
                </div>

                <div className="px-4 shrink-0"><h4 className={`text-center text-[10px] font-black text-slate-400 uppercase tracking-widest my-2`}>O invitar a un usuario de la app</h4></div>
                
                <div className="px-4 pb-2 shrink-0">
                    <input type="text" placeholder="Buscar usuario..." value={search} onChange={e => setSearch(e.target.value)} className={`w-full text-xs font-bold rounded-xl px-4 py-3 outline-none ${darkMode ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-900'}`} />
                </div>

                <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-2">
                    {filteredUsers.map(user => (
                        <div key={user.id} className="p-2 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.username}&background=3b82f6&color=fff`} alt={user.username} className="w-10 h-10 rounded-full object-cover" />
                                <span className="font-bold text-sm">{user.username}</span>
                            </div>
                            <button onClick={() => handleSend(user)} disabled={sent.includes(user.id)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all active:scale-95 ${sent.includes(user.id) ? 'bg-misionero-verde text-white' : (darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600')}`}>
                                {sent.includes(user.id) ? 'Enviado' : 'Enviar'}
                            </button>
                        </div>
                    ))}
                    {filteredUsers.length === 0 && <p className="text-center text-xs text-slate-400 py-6">No se encontraron usuarios.</p>}
                </div>
            </div>
        </div>
    );
};


const AddSongDrawer = ({ allSongs, onToggle, selectedIds, onClose, filter, setFilter, categories, darkMode }: any) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSongs = useMemo(() => {
      return allSongs.filter((s: Song) => 
          s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
          s.author.toLowerCase().includes(searchQuery.toLowerCase())
      );
  }, [allSongs, searchQuery]);

  return (
  <div className="fixed inset-0 z-[160] bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
    <div className={`w-full h-full flex flex-col animate-in slide-in-from-bottom duration-300 ${darkMode ? 'bg-black' : 'bg-white'}`}>
      
      {/* Header */}
      <header className={`px-6 pt-12 pb-4 shrink-0 flex items-center justify-between border-b ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
         <h3 className={`font-black text-2xl uppercase tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>Añadir</h3>
         <button onClick={onClose} className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all bg-misionero-verde text-white`}>
            Listo
         </button>
      </header>
      
      {/* Search & Filters */}
      <div className="p-4 space-y-4 shrink-0">
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl transition-colors ${darkMode ? 'bg-slate-900 border border-slate-800' : 'bg-slate-100 border border-slate-200'}`}>
              <SearchIcon className={`w-4 h-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
              <input 
                  type="text" 
                  placeholder="Buscar canción..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`bg-transparent outline-none w-full text-xs font-bold ${darkMode ? 'text-white placeholder:text-slate-600' : 'text-slate-900 placeholder:text-slate-400'}`}
              />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="text-slate-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 custom-scroll no-scrollbar">
              {['Todos', ...categories].map((f: string) => (
                <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-full text-[9px] font-black uppercase shrink-0 transition-all ${filter === f ? 'bg-misionero-azul text-white shadow-lg shadow-misionero-azul/20' : 'glass-ui text-slate-400 border border-transparent'}`}>{f}</button>
              ))}
          </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll px-4 pb-24 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start auto-rows-max">
        {filteredSongs.map((song: Song, index: number) => {
          const isSelected = selectedIds.includes(song.id);
          return (
            <div 
                key={song.id} 
                onClick={() => onToggle(song.id)} 
                className={`relative glass-ui rounded-[1.8rem] overflow-hidden active:scale-[0.98] transition-all cursor-pointer h-fit ${isSelected ? (darkMode ? 'border border-misionero-verde/50 bg-misionero-verde/5' : 'border border-misionero-verde/50 bg-misionero-verde/5') : ''} animate-stagger-in`}
                style={{ animationDelay: `${index * 30}ms` }}
            >
                {/* Source Tag if needed */}
                {song.source === 'lacuerda' && (
                    <span className="absolute top-3 left-3 z-20 text-[7px] font-black text-orange-500 bg-orange-500/10 px-2 py-1 rounded-full border border-orange-500/20">LaCuerda.net</span>
                )}

                {/* Action Button */}
                <button 
                    className={`absolute top-3 right-3 z-20 p-2 rounded-full transition-all duration-300 ${isSelected ? 'bg-misionero-verde text-white shadow-lg scale-110' : (darkMode ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-white text-slate-400 hover:text-slate-600 shadow-sm')}`}
                >
                    {isSelected ? <CheckIcon className="w-5 h-5" /> : <PlusSymbolIcon className="w-5 h-5" />}
                </button>
                
                {/* Content */}
                <div className={`p-4 ${song.source === 'lacuerda' ? 'pt-8' : ''}`}>
                    <p className={`text-[7px] font-black uppercase mb-1 ${getLiturgicalColorClass(song.category)}`}>{song.category}</p>
                    <h4 className={`font-black text-sm uppercase truncate pr-8 ${darkMode ? 'text-white' : 'text-slate-800'} ${isSelected ? 'text-misionero-verde' : ''}`}>{song.title}</h4>
                    <p className={`text-[9px] font-bold mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Tono: <span className="text-misionero-rojo">{song.key}</span> • Por: {song.author}
                    </p>
                </div>
            </div>
          );
        })}
        {filteredSongs.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 opacity-50">
                <p className="text-[10px] font-black uppercase text-slate-400">No se encontraron canciones.</p>
            </div>
        )}
      </div>
    </div>
  </div>
)};

const ParticipantsPanel = ({ room, onlineParticipants, currentUser, participantDetails, canModify, kickUser, banUser, onClose, onViewProfile, darkMode, transferHost }: any) => (
    <div className={`fixed inset-0 z-[150] flex flex-col ${darkMode ? 'bg-black' : 'bg-slate-50'} animate-in slide-in-from-right duration-300`}>
        <header className={`px-4 pt-12 pb-3 border-b ${darkMode ? 'border-slate-800 bg-black' : 'border-slate-100 bg-white'} flex items-center justify-between shrink-0`}>
          <button onClick={onClose} className="p-2 rounded-full active:scale-90 text-slate-500 dark:text-slate-400"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg></button>
          <h3 className="text-sm font-black uppercase tracking-tight">Participantes ({onlineParticipants.length})</h3>
          <div className="w-10"></div>
        </header>
        <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-2">
            {onlineParticipants.sort((a: string, b: string) => {
                 if (a === room.host) return -1;
                 if (b === room.host) return 1;
                 return a.localeCompare(b);
            }).map((p: string) => (
                <ParticipantItem 
                    key={p}
                    name={p}
                    details={participantDetails[p]}
                    isHost={p === room.host}
                    isMe={p === currentUser}
                    canModify={canModify}
                    kickUser={kickUser}
                    banUser={banUser}
                    onViewProfile={onViewProfile}
                    darkMode={darkMode}
                    transferHost={transferHost}
                />
            ))}
        </div>
    </div>
);

const ChatPanel = ({ messages, currentUser, onClose, chatMessage, setChatMessage, handleSendChatMessage, chatScrollRef, chatInputRef, replyingTo, setReplyingTo, darkMode, typingUsers, updateTypingStatus }: any) => {
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
            {(messages || []).map((msg: ChatMessage, index: number) => (
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
