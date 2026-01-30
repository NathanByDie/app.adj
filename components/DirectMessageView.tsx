
import React, { useState, useEffect, useRef } from 'react';
import { User as AppUser, DirectMessage } from '../types';
import { Firestore, collection, query, orderBy, onSnapshot, serverTimestamp, writeBatch, doc, setDoc, increment, updateDoc, getDoc, runTransaction } from 'firebase/firestore';
import { ref as refRtdb, onValue as onValueRtdb, set as setRtdb, remove as removeRtdb } from 'firebase/database';
import { triggerHapticFeedback } from '../services/haptics';
import { getMessagesFromCache, saveMessagesToCache } from '../services/cache';

interface DirectMessageViewProps {
    currentUser: AppUser;
    partner: AppUser;
    onBack: () => void;
    db: Firestore;
    rtdb: any;
    darkMode: boolean;
    partnerStatus: { state: 'online' } | { state: 'offline', last_changed: number } | undefined;
    onViewProfile: (userId: string) => void;
}

const generateChatId = (uid1: string, uid2: string): string => {
    return [uid1, uid2].sort().join('_');
};

const formatLastSeen = (timestamp: number) => {
    const now = new Date();
    const lastSeenDate = new Date(timestamp);
    
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const lastSeenTime = lastSeenDate.toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit', hour12: true });

    if (lastSeenDate >= startOfToday) {
        return `hoy a las ${lastSeenTime}`;
    }
    
    if (lastSeenDate >= startOfYesterday) {
        return `ayer a las ${lastSeenTime}`;
    }

    const diffSeconds = Math.floor((now.getTime() - lastSeenDate.getTime()) / 1000);
    if (diffSeconds < 60) return "hace un momento";
    if (diffSeconds < 3600) return `hace ${Math.floor(diffSeconds / 60)} min`;

    return `el ${lastSeenDate.toLocaleDateString()}`;
};


const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// Sub-component to handle individual message gestures (Swipe & Long Press)
interface SwipeableDirectMessageProps {
    msg: DirectMessage;
    currentUser: AppUser;
    darkMode: boolean;
    isSelected: boolean;
    selectedMessageForAction: { msg: DirectMessage, position: 'top' | 'bottom' } | null;
    onLongPress: (msg: DirectMessage, target: HTMLDivElement) => void;
    onReply: (msg: DirectMessage) => void;
    onReaction: (emoji: string) => void | Promise<void>;
    formatTime: (timestamp: any) => string;
}

const SwipeableDirectMessage: React.FC<SwipeableDirectMessageProps> = ({ 
    msg, 
    currentUser, 
    darkMode, 
    isSelected, 
    selectedMessageForAction, 
    onLongPress, 
    onReply, 
    onReaction, 
    formatTime 
}) => {
    const isMe = msg.senderId === currentUser.id;
    const [translateX, setTranslateX] = useState(0);
    const touchStartCoords = useRef<{x: number, y: number} | null>(null);
    const longPressTimerRef = useRef<number | null>(null);
    const isSwipingRef = useRef(false);
    const longPressTriggered = useRef(false);

    const onTouchStart = (e: React.TouchEvent) => {
        if (isSelected) return;
        touchStartCoords.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        isSwipingRef.current = false;
        longPressTriggered.current = false;

        const target = e.currentTarget as HTMLDivElement;

        longPressTimerRef.current = window.setTimeout(() => {
            longPressTriggered.current = true;
            triggerHapticFeedback('light');
            onLongPress(msg, target);
            longPressTimerRef.current = null;
            touchStartCoords.current = null;
        }, 400);
    };

    const onTouchMove = (e: React.TouchEvent) => {
        if (!touchStartCoords.current) return;
        
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const diffX = currentX - touchStartCoords.current.x;
        const diffY = currentY - touchStartCoords.current.y;

        if (Math.abs(diffY) > 10 && !isSwipingRef.current) {
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
            }
            touchStartCoords.current = null;
            return;
        }

        if (Math.abs(diffX) > 10) {
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
            }
            isSwipingRef.current = true;
            
            if (isMe) { // My message, swipe left
                if (diffX < 0) {
                    setTranslateX(Math.max(diffX, -80));
                }
            } else { // Partner's message, swipe right
                if (diffX > 0) {
                    setTranslateX(Math.min(diffX, 80));
                }
            }
        }
    };

    const onTouchEnd = (e: React.TouchEvent) => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }

        if (longPressTriggered.current) {
            e.preventDefault();
        } else if (Math.abs(translateX) > 50) {
            triggerHapticFeedback('light');
            onReply(msg);
        }

        setTranslateX(0);
        touchStartCoords.current = null;
        isSwipingRef.current = false;
        longPressTriggered.current = false;
    };

    // Legacy reply parsing for backward compatibility
    const legacyReplyMatch = !msg.replyTo && msg.text.match(/^> ([^\n]*)\n\n([\s\S]*)/);
    const isLegacyReply = !!legacyReplyMatch;
    const legacyReplySnippet = isLegacyReply ? legacyReplyMatch[1] : '';
    const actualMessage = isLegacyReply ? legacyReplyMatch[2] : msg.text;
    
    return (
        <div 
            className={`relative flex flex-col ${isMe ? 'items-end' : 'items-start'} select-none w-full ${isSelected ? 'z-40' : ''}`}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
             {/* Reply Icon Indicator (Visible on Swipe) */}
             <div 
                className="absolute top-1/2 -translate-y-1/2 text-slate-400 transition-opacity duration-300 flex items-center justify-center w-10"
                style={{ 
                    [isMe ? 'right' : 'left']: '0.5rem',
                    opacity: Math.abs(translateX) > 10 ? Math.min(Math.abs(translateX) / 50, 1) : 0, 
                }}
            >
                <svg className="w-5 h-5" style={{ transform: isMe ? 'scaleX(-1)' : 'scaleX(1)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
            </div>

            <div 
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] transition-transform duration-150 ease-out`}
                style={{ transform: `translateX(${translateX}px)` }}
            >
                <div 
                    className={`relative ${isSelected ? 'z-50' : ''}`} 
                    onContextMenu={(e) => e.preventDefault()}
                >
                    {isSelected && !msg.deleted && (
                        <div className={`absolute z-50 flex items-center gap-1 p-1.5 rounded-full shadow-xl animate-in zoom-in-75 duration-200 ${darkMode ? 'bg-slate-800' : 'bg-slate-900'} ${selectedMessageForAction?.position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} ${isMe ? 'right-0' : 'left-0'}`}>
                            {REACTIONS.map(emoji => (
                                <button key={emoji} onClick={() => onReaction(emoji)} className="text-2xl active:scale-125 transition-transform p-1 rounded-full">{emoji}</button>
                            ))}
                        </div>
                    )}
                    <div 
                        className={`p-3.5 rounded-2xl shadow-sm transition-all duration-200 ${msg.deleted ? 'italic' : ''} ${isSelected ? (darkMode ? 'bg-slate-700' : 'bg-slate-200') : (isMe ? 'bg-misionero-azul text-white' : (darkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'))}`}
                    >
                         {msg.replyTo && (
                            <div className={`p-2 rounded-lg text-xs font-medium border-l-4 mb-2 ${isMe ? 'border-white bg-black/20' : `border-misionero-azul ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}`}>
                                <p className={`font-black ${isMe ? 'text-slate-300' : 'text-misionero-azul'}`}>{msg.replyTo.senderUsername}</p>
                                <p className={`opacity-80 truncate ${isMe ? 'text-slate-200' : ''}`}>{msg.replyTo.textSnippet}</p>
                            </div>
                        )}
                        <p className="text-sm font-medium leading-tight whitespace-pre-wrap">{msg.deleted ? 'Este mensaje fue eliminado' : actualMessage}</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2 mt-1 px-1">
                    <span className={`text-[8px] font-black uppercase ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>{formatTime(msg.timestamp)}</span>
                    {Object.entries(msg.reactions || {}).length > 0 && (
                        <div className="flex gap-1">
                            {Object.entries((msg.reactions || {}) as Record<string, string[]>).map(([emoji, uids]) => (
                                uids.length > 0 && (
                                    <div key={emoji} className={`text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1 transition-colors ${(uids.includes(currentUser.id)) ? 'bg-misionero-azul/20 text-misionero-azul' : (darkMode ? 'bg-slate-700' : 'bg-slate-200')}`}>
                                        <span>{emoji}</span>
                                        {uids.length > 1 && <span className="text-[9px] font-bold">{uids.length}</span>}
                                    </div>
                                )
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const DirectMessageView: React.FC<DirectMessageViewProps> = ({ currentUser, partner, onBack, db, rtdb, darkMode, partnerStatus, onViewProfile }) => {
    const [messages, setMessages] = useState<DirectMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [showOptions, setShowOptions] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isBlocked, setIsBlocked] = useState(false);
    const [isLoadingCache, setIsLoadingCache] = useState(true);
    
    const [selectedMessageForAction, setSelectedMessageForAction] = useState<{ msg: DirectMessage, position: 'top' | 'bottom' } | null>(null);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [replyingTo, setReplyingTo] = useState<DirectMessage | null>(null);
    const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    
    const typingTimeoutRef = useRef<number | null>(null);

    const chatId = generateChatId(currentUser.id, partner.id);

    const updateTypingStatus = (isTyping: boolean) => {
        if (!rtdb) return;
        const myTypingRef = refRtdb(rtdb, `typing/${chatId}/${currentUser.id}`);
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
        if (!rtdb) return;
        const partnerTypingRef = refRtdb(rtdb, `typing/${chatId}/${partner.id}`);
        const unsubscribe = onValueRtdb(partnerTypingRef, (snapshot) => {
            setIsPartnerTyping(snapshot.val() === true);
        });
        
        return () => {
            unsubscribe();
            updateTypingStatus(false);
        };
    }, [rtdb, chatId, partner.id]);

    useEffect(() => {
        const chatInfoRef = doc(db, 'user_chats', currentUser.id, 'chats', chatId);
        const unsubscribe = onSnapshot(chatInfoRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setIsBlocked(data.isBlocked === true);
                setIsMuted(data.mutedUntil ? data.mutedUntil > Date.now() : false);
            }
        });
        return () => unsubscribe();
    }, [db, currentUser.id, chatId]);

    useEffect(() => {
        // 1. Cargar mensajes desde la caché inmediatamente
        const loadInitialMessages = async () => {
            try {
                const cachedMessages = await getMessagesFromCache(chatId);
                if (cachedMessages.length > 0) {
                    setMessages(cachedMessages);
                }
            } catch (error) {
                console.error("Error al cargar mensajes de la caché:", error);
            } finally {
                setIsLoadingCache(false);
            }
        };

        loadInitialMessages();

        // 2. Escuchar cambios en tiempo real desde Firestore
        const messagesRef = collection(db, 'direct_messages', chatId, 'messages');
        const q = query(messagesRef, orderBy('timestamp', 'asc'));

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const fetchedMessages: DirectMessage[] = [];
            const unreadMessagesToUpdate: string[] = [];
            let foundPinned = null;
            
            snapshot.forEach(doc => {
                const msg = { id: doc.id, ...doc.data() } as DirectMessage;
                if (!msg.deletedBy?.[currentUser.id]) {
                    fetchedMessages.push(msg);
                }
                if (msg.senderId === partner.id && !msg.read) {
                    unreadMessagesToUpdate.push(doc.id);
                }
                if (msg.pinned) {
                    foundPinned = msg.id;
                }
            });
            
            // Actualizar el estado y la caché
            setMessages(fetchedMessages);
            setPinnedMessageId(foundPinned);
            await saveMessagesToCache(chatId, fetchedMessages);

            // Marcar mensajes como leídos
            if (unreadMessagesToUpdate.length > 0) {
                const batch = writeBatch(db);
                unreadMessagesToUpdate.forEach(msgId => {
                    batch.update(doc(db, 'direct_messages', chatId, 'messages', msgId), { read: true });
                });
                const myChatInfoRef = doc(db, 'user_chats', currentUser.id, 'chats', chatId);
                batch.set(myChatInfoRef, { unreadCount: 0 }, { merge: true });
                await batch.commit();
            }
        });
        
        return () => unsubscribe();
    }, [chatId, db, currentUser.id, partner.id]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, isPartnerTyping]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newMessage.trim() === '' || isBlocked) return;

        updateTypingStatus(false);

        const timestamp = serverTimestamp();
        const messagesRef = collection(db, 'direct_messages', chatId, 'messages');
        const myChatInfoRef = doc(db, 'user_chats', currentUser.id, 'chats', chatId);
        const partnerChatInfoRef = doc(db, 'user_chats', partner.id, 'chats', chatId);

        const batch = writeBatch(db);
        const isReply = !!replyingTo;

        const newMsgData: Partial<DirectMessage> = {
            senderId: currentUser.id,
            text: newMessage,
            timestamp: timestamp,
            read: false,
        };

        if (replyingTo) {
            // Remove legacy reply format from snippet if it exists
            const snippetText = replyingTo.text.split('\n\n').pop() || '';
            newMsgData.replyTo = {
                messageId: replyingTo.id,
                senderId: replyingTo.senderId,
                senderUsername: replyingTo.senderId === currentUser.id ? currentUser.username : partner.username,
                textSnippet: snippetText.substring(0, 50),
            };
        }

        batch.set(doc(messagesRef), newMsgData);
        
        const commonChatInfo = {
            lastMessageText: newMessage,
            lastMessageTimestamp: timestamp,
            lastMessageSenderId: currentUser.id,
            isReply: isReply,
        };

        batch.set(myChatInfoRef, {
            ...commonChatInfo,
            partnerId: partner.id,
            partnerUsername: partner.username
        }, { merge: true });
        
        batch.set(partnerChatInfoRef, {
            ...commonChatInfo,
            partnerId: currentUser.id,
            partnerUsername: currentUser.username,
            unreadCount: increment(1)
        }, { merge: true });

        await batch.commit();
        setNewMessage('');
        setReplyingTo(null);
    };

    const handleMute = async (duration: number) => {
        const mutedUntil = duration === -1 ? 9999999999999 : Date.now() + (duration * 60 * 1000);
        const myChatInfoRef = doc(db, 'user_chats', currentUser.id, 'chats', chatId);
        await setDoc(myChatInfoRef, { mutedUntil }, { merge: true });
        setShowOptions(false);
    };

    const handleUnmute = async () => {
        const myChatInfoRef = doc(db, 'user_chats', currentUser.id, 'chats', chatId);
        await updateDoc(myChatInfoRef, { mutedUntil: 0 });
        setShowOptions(false);
    };

    const handleToggleBlock = async () => {
        const myChatInfoRef = doc(db, 'user_chats', currentUser.id, 'chats', chatId);
        await setDoc(myChatInfoRef, { isBlocked: !isBlocked }, { merge: true });
        setShowOptions(false);
    };
    
    // Handlers for SwipeableDirectMessage
    const handleLongPress = (msg: DirectMessage, target: HTMLDivElement) => {
        if (target) {
            const rect = target.getBoundingClientRect();
            const isTopHalf = rect.top < window.innerHeight / 2;
            setSelectedMessageForAction({ msg, position: isTopHalf ? 'bottom' : 'top' });
        }
    };

    const handleReplyAction = (msg: DirectMessage) => {
        setReplyingTo(msg);
        setSelectedMessageForAction(null);
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    const handleCopyMessage = async () => {
        if (!selectedMessageForAction) return;
        try {
            await navigator.clipboard.writeText(selectedMessageForAction.msg.text);
            setSelectedMessageForAction(null);
        } catch (err) {
            console.error('Failed to copy!', err);
        }
    };
    
    const handleReaction = async (emoji: string) => {
        if (!selectedMessageForAction) return;

        const reactingToMessage = selectedMessageForAction.msg;
        const msgRef = doc(db, 'direct_messages', chatId, 'messages', reactingToMessage.id);
        
        try {
            await runTransaction(db, async (transaction) => {
                const msgDoc = await transaction.get(msgRef);
                if (!msgDoc.exists()) throw "Message does not exist!";
                const data = msgDoc.data();
                const newReactions = { ...(data.reactions || {}) };
                
                let userPreviousReaction: string | null = null;
                for (const key in newReactions) {
                    const index = (newReactions[key] || []).indexOf(currentUser.id);
                    if (index > -1) {
                        userPreviousReaction = key;
                        newReactions[key].splice(index, 1);
                        if (newReactions[key].length === 0) delete newReactions[key];
                        break;
                    }
                }
                
                if (userPreviousReaction !== emoji) {
                    if (!newReactions[emoji]) newReactions[emoji] = [];
                    newReactions[emoji].push(currentUser.id);
                }
                transaction.update(msgRef, { reactions: newReactions });
            });
        } catch (e) { console.error("Transaction failed: ", e); }
        setSelectedMessageForAction(null);
    };
    
    const handleDeleteForMe = async () => {
        if (!selectedMessageForAction) return;
        const msgRef = doc(db, 'direct_messages', chatId, 'messages', selectedMessageForAction.msg.id);
        await updateDoc(msgRef, { [`deletedBy.${currentUser.id}`]: true });
        setDeleteModalVisible(false);
        setSelectedMessageForAction(null);
    };

    const handleDeleteForEveryone = async () => {
        if (!selectedMessageForAction) return;
    
        const isLastMessage = messages.length > 0 && selectedMessageForAction.msg.id === messages[messages.length - 1].id;
    
        const msgRef = doc(db, 'direct_messages', chatId, 'messages', selectedMessageForAction.msg.id);
        const batch = writeBatch(db);
    
        batch.update(msgRef, {
            text: 'Este mensaje fue eliminado',
            deleted: true,
            reactions: {},
            pinned: false,
            replyTo: null
        });
    
        if (isLastMessage) {
            const newLastMessage = messages.length > 1 ? messages[messages.length - 2] : null;
            const myChatInfoRef = doc(db, 'user_chats', currentUser.id, 'chats', chatId);
            const partnerChatInfoRef = doc(db, 'user_chats', partner.id, 'chats', chatId);
    
            if (newLastMessage) {
                const newLastMessageInfo = {
                    lastMessageText: newLastMessage.deleted ? 'Este mensaje fue eliminado' : newLastMessage.text,
                    lastMessageTimestamp: newLastMessage.timestamp,
                    lastMessageSenderId: newLastMessage.senderId,
                    isReply: !!newLastMessage.replyTo,
                };
                batch.set(myChatInfoRef, newLastMessageInfo, { merge: true });
                batch.set(partnerChatInfoRef, newLastMessageInfo, { merge: true });
            } else {
                const updatedInfo = {
                    lastMessageText: 'Este mensaje fue eliminado',
                };
                batch.set(myChatInfoRef, updatedInfo, { merge: true });
                batch.set(partnerChatInfoRef, updatedInfo, { merge: true });
            }
        }
    
        await batch.commit();
        setDeleteModalVisible(false);
        setSelectedMessageForAction(null);
    };

    const formatTime = (timestamp: any): string => {
        if (timestamp && typeof timestamp.seconds === 'number') {
            return new Date(timestamp.seconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
        }
        return '...';
    };

    const myLastMessage = [...messages].reverse().find(m => m.senderId === currentUser.id);
    const pinnedMessage = messages.find(m => m.id === pinnedMessageId);
    
    const getMessageAge = (msg: DirectMessage) => {
        if (!msg.timestamp) return 0; // Just sent (pending write)
        if (typeof msg.timestamp.toMillis === 'function') return Date.now() - msg.timestamp.toMillis();
        return 999999999; // Treat as old if format is unknown
    };

    const canDeleteForEveryone = selectedMessageForAction && 
        selectedMessageForAction.msg.senderId === currentUser.id && 
        getMessageAge(selectedMessageForAction.msg) < 3 * 60 * 1000;

    return (
        <div className={`fixed inset-0 z-[150] flex flex-col animate-in slide-in-from-right duration-300 ${darkMode ? 'bg-black' : 'bg-white'}`}>
            {selectedMessageForAction && (
                <div className="fixed inset-0 z-40" onClick={() => setSelectedMessageForAction(null)}></div>
            )}
            <header className={`px-4 pt-12 pb-3 border-b ${darkMode ? 'border-slate-800 bg-black' : 'border-slate-100 bg-white'} flex flex-col shrink-0 ${selectedMessageForAction ? 'z-50' : 'z-20'}`}>
                {selectedMessageForAction ? (
                     <div className="flex items-center justify-between w-full h-[52px]">
                        <button onClick={() => setSelectedMessageForAction(null)} className="p-2 rounded-full active:scale-90">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                        <div className="flex items-center gap-2">
                             <button onClick={() => handleReplyAction(selectedMessageForAction.msg)} className="p-2 rounded-full active:scale-90 text-misionero-azul">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                            </button>
                            <button onClick={handleCopyMessage} className={`p-2 rounded-full active:scale-90 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                            </button>
                            <button onClick={() => setDeleteModalVisible(true)} className="p-2 rounded-full active:scale-90 text-misionero-rojo">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-between w-full h-[52px]">
                        <div className="flex items-center gap-3">
                            <button onClick={onBack} className="p-2 rounded-full active:scale-90">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <button onClick={() => onViewProfile(partner.id)} className="flex items-center gap-3 text-left">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-md text-white bg-misionero-azul`}>
                                    {partner.username.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h3 className="font-black uppercase text-sm flex items-center gap-2">
                                        {partner.username}
                                        {isBlocked && <span className="text-[8px] bg-red-500 text-white px-1.5 rounded">BLOQUEADO</span>}
                                        {isMuted && !isBlocked && <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>}
                                    </h3>
                                    <p className={`text-xs font-bold ${isPartnerTyping ? 'text-misionero-amarillo animate-pulse' : partnerStatus?.state === 'online' ? 'text-misionero-verde' : 'text-slate-400'}`}>
                                        {isPartnerTyping ? 'Escribiendo...' : (partnerStatus?.state === 'online' ? 'En línea' : (partnerStatus ? `Últ. vez ${formatLastSeen(partnerStatus.last_changed)}` : 'Desconectado'))}
                                    </p>
                                </div>
                            </button>
                        </div>
                        <div className="relative">
                            <button onClick={() => setShowOptions(true)} className={`p-2 rounded-full active:bg-slate-100 dark:active:bg-slate-800 transition-colors`}>
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                            </button>
                        </div>
                    </div>
                )}
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 custom-scroll">
                {isLoadingCache && messages.length === 0 && (
                    <div className="flex justify-center items-center h-full">
                        <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-slate-500 dark:border-t-slate-400 rounded-full animate-spin"></div>
                    </div>
                )}
                {messages.map(msg => (
                    <SwipeableDirectMessage
                        key={msg.id}
                        msg={msg}
                        currentUser={currentUser}
                        darkMode={darkMode}
                        isSelected={selectedMessageForAction?.msg.id === msg.id}
                        selectedMessageForAction={selectedMessageForAction}
                        onLongPress={handleLongPress}
                        onReply={handleReplyAction}
                        onReaction={handleReaction}
                        formatTime={formatTime}
                    />
                ))}
                
                {isPartnerTyping && (
                    <div className="flex items-end gap-2 flex-row animate-in fade-in duration-300">
                        <div className="flex flex-col items-start max-w-[85%]">
                            <div className={`p-3.5 rounded-2xl shadow-sm ${darkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>
                                <div className={`flex items-center justify-center h-5 gap-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                    <span className="typing-dot"></span>
                                    <span className="typing-dot" style={{ animationDelay: '0.2s' }}></span>
                                    <span className="typing-dot" style={{ animationDelay: '0.4s' }}></span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                 {myLastMessage && (
                    <div className="w-full flex justify-end">
                        <span className={`text-[9px] font-bold mt-1 px-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {myLastMessage.read ? 'Visto' : 'Enviado'}
                        </span>
                    </div>
                 )}
            </div>

            <form onSubmit={handleSendMessage} className={`p-3 border-t shrink-0 ${darkMode ? 'border-white/5 bg-black' : 'border-slate-100 bg-white'} pb-[calc(0.75rem+env(safe-area-inset-bottom))]`}>
                {replyingTo && (
                    <div className={`flex items-center justify-between px-4 py-2 mb-2 rounded-xl text-xs font-medium border-l-4 border-misionero-azul ${darkMode ? 'bg-slate-900 text-slate-300' : 'bg-slate-50 text-slate-600'}`}>
                        <div className="flex flex-col max-w-[80%]">
                            <span className="text-[8px] font-black uppercase text-misionero-azul">Respondiendo a {replyingTo.senderId === currentUser.id ? currentUser.username : partner.username}</span>
                            <span className="truncate">{replyingTo.text}</span>
                        </div>
                        <button type="button" onClick={() => setReplyingTo(null)} className="p-1"><svg className="w-4 h-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
                    </div>
                )}
                <div className="flex gap-2 items-center w-full">
                    {isBlocked ? (
                        <div className="w-full text-center p-3 text-xs font-bold text-red-500 bg-red-500/10 rounded-2xl">
                            Has bloqueado este chat.
                        </div>
                    ) : (
                        <>
                            <input
                                ref={inputRef}
                                type="text"
                                value={newMessage}
                                onChange={e => {
                                    setNewMessage(e.target.value);
                                    updateTypingStatus(true);
                                }}
                                placeholder="Escribe un mensaje..."
                                className={`flex-1 min-w-0 rounded-2xl px-4 py-3.5 text-sm font-bold outline-none border transition-all ${darkMode ? 'bg-black border-white/5 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                            />
                            <button type="submit" disabled={!newMessage.trim()} className="bg-misionero-verde text-white font-black w-12 h-12 rounded-2xl text-[10px] uppercase shadow-md active:scale-95 transition-transform disabled:opacity-30 flex items-center justify-center shrink-0">
                                <svg className="w-5 h-5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                            </button>
                        </>
                    )}
                </div>
            </form>

            {showOptions && (
                <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowOptions(false)}>
                    <div className={`w-full rounded-t-[2.5rem] shadow-2xl animate-in slide-in-from-bottom duration-300 pb-10 ${darkMode ? 'bg-slate-900 border-t border-slate-800' : 'bg-white border-t border-slate-200'}`} onClick={e => e.stopPropagation()}>
                        <div className="flex justify-center pt-4 pb-2">
                            <div className={`w-12 h-1.5 rounded-full ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}></div>
                        </div>
                        <div className="px-6 pb-2 text-center border-b border-slate-100 dark:border-slate-800">
                            <h3 className={`text-sm font-black uppercase ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                Ajustes del Chat
                            </h3>
                        </div>
                        <div className="p-4 space-y-2">
                            {isMuted ? (
                                <button onClick={handleUnmute} className={`w-full py-4 rounded-2xl text-xs font-bold uppercase transition-colors ${darkMode ? 'bg-slate-800 text-white active:bg-slate-700' : 'bg-slate-100 text-slate-800 active:bg-slate-200'}`}>
                                    Desactivar Silencio
                                </button>
                            ) : (
                                <div className="space-y-2">
                                    <p className={`text-[10px] font-black uppercase ml-2 mb-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Silenciar por</p>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button onClick={() => handleMute(60)} className={`py-3 rounded-xl text-[10px] font-bold uppercase transition-colors ${darkMode ? 'bg-slate-800 text-white active:bg-slate-700' : 'bg-slate-100 text-slate-800 active:bg-slate-200'}`}>1 Hora</button>
                                        <button onClick={() => handleMute(480)} className={`py-3 rounded-xl text-[10px] font-bold uppercase transition-colors ${darkMode ? 'bg-slate-800 text-white active:bg-slate-700' : 'bg-slate-100 text-slate-800 active:bg-slate-200'}`}>8 Horas</button>
                                        <button onClick={() => handleMute(-1)} className={`py-3 rounded-xl text-[10px] font-bold uppercase transition-colors ${darkMode ? 'bg-slate-800 text-white active:bg-slate-700' : 'bg-slate-100 text-slate-800 active:bg-slate-200'}`}>Siempre</button>
                                    </div>
                                </div>
                            )}
                            <button onClick={handleToggleBlock} className={`w-full py-4 mt-2 rounded-2xl text-xs font-bold uppercase transition-colors ${isBlocked ? 'bg-misionero-verde/10 text-misionero-verde active:bg-misionero-verde/20' : 'bg-red-500/10 text-red-500 active:bg-red-500/20'}`}>
                                {isBlocked ? 'Desbloquear' : 'Bloquear'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {deleteModalVisible && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in duration-200" onClick={() => setDeleteModalVisible(false)}>
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
                    <div className={`relative w-full max-w-sm rounded-[2.5rem] shadow-2xl p-6 animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-slate-100'}`} onClick={e => e.stopPropagation()}>
                        <h3 className={`text-center font-black text-lg uppercase mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Eliminar Mensaje</h3>
                        <p className={`text-center text-xs font-bold mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            {canDeleteForEveryone 
                                ? "¿Cómo deseas eliminar este mensaje?" 
                                : "Este mensaje solo se eliminará para ti."}
                        </p>
                        
                        <div className="space-y-3">
                            {canDeleteForEveryone && (
                                <button onClick={handleDeleteForEveryone} className={`w-full py-4 rounded-2xl text-xs font-bold uppercase transition-colors ${darkMode ? 'bg-slate-800 text-misionero-rojo active:bg-slate-700' : 'bg-slate-100 text-misionero-rojo active:bg-slate-200'}`}>
                                    Eliminar para Todos
                                </button>
                            )}
                             <button onClick={handleDeleteForMe} className={`w-full py-4 rounded-2xl text-xs font-bold uppercase transition-colors ${darkMode ? 'bg-slate-800 text-misionero-rojo active:bg-slate-700' : 'bg-slate-100 text-misionero-rojo active:bg-slate-200'}`}>
                                Eliminar para Mí
                            </button>
                            <button onClick={() => setDeleteModalVisible(false)} className={`w-full py-4 rounded-2xl text-xs font-bold uppercase transition-colors ${darkMode ? 'bg-black text-white active:bg-slate-900' : 'bg-slate-200 text-slate-800 active:bg-slate-300'}`}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DirectMessageView;
