import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { User as AppUser, DirectMessage } from '../types';
import { Firestore, collection, query, orderBy, onSnapshot, serverTimestamp, writeBatch, doc, setDoc, increment, updateDoc, getDoc, runTransaction, arrayUnion, arrayRemove } from 'firebase/firestore';
import { FirebaseStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { ref as refRtdb, onValue as onValueRtdb, set as setRtdb, remove as removeRtdb, onDisconnect } from 'firebase/database';
import { triggerHapticFeedback } from '../services/haptics';
import useCachedMedia from '../hooks/useCachedMedia';
import CustomAudioPlayer from './CustomAudioPlayer';
import ImageViewer from './ImageViewer';
import ImageEditor from './ImageEditor';
import VideoEditor from './VideoEditor';
import VideoViewer from './VideoViewer';
import { saveMessagesToCache, getMessagesFromCache } from '../services/cache';
import { SecureMessenger } from '../services/security';
import { UsersIcon } from '../constants';

// --- ICONOS ---
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const PlusIcon = () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>;
const MicIcon = () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>;
const SendIcon = () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>;
const XIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>;
const TrashIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-6 h-6"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);
const CopyIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-6 h-6"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);
const ReplyIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-6 h-6"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
);
const VerifiedIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-3 h-3"} viewBox="0 0 24 24" fill="currentColor">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
    </svg>
);
const ClockIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-3 h-3"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);
const LockIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-3 h-3"} viewBox="0 0 24 24" fill="currentColor">
        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
    </svg>
);


interface DirectMessageViewProps {
    currentUser: AppUser;
    partner: AppUser;
    onBack: () => void;
    db: Firestore;
    rtdb: any;
    storage: FirebaseStorage;
    darkMode: boolean;
    partnerStatus: { state: 'online' } | { state: 'offline', last_changed: number } | undefined;
    onViewProfile: (userId: string) => void;
    onJoinRoom: (code: string) => void;
}

const generateChatId = (uid1: string, uid2: string): string => [uid1, uid2].sort().join('_');
const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} Bytes`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
};
const formatLastSeen = (timestamp: number) => {
    const now = new Date();
    const lastSeenDate = new Date(timestamp);
    const diffSeconds = Math.floor((now.getTime() - lastSeenDate.getTime()) / 1000);
    if (diffSeconds < 60) return "hace un momento";
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastSeenTime = lastSeenDate.toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (lastSeenDate >= startOfToday) return `hoy a las ${lastSeenTime}`;
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    if (lastSeenDate >= startOfYesterday) return `ayer a las ${lastSeenTime}`;
    return `el ${lastSeenDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
};

const SwipeableDirectMessage: React.FC<{
    msg: DirectMessage, currentUser: AppUser, partner: AppUser, darkMode: boolean, 
    onReply: (msg: DirectMessage) => void, onLongPress: (msg: DirectMessage, target: HTMLDivElement) => void, 
    onViewImage: (url: string) => void,
    onViewVideo: (url: string) => void,
    onImageLoad?: () => void,
    onJoinRoom: (code: string) => void
}> = ({ msg, currentUser, partner, darkMode, onReply, onLongPress, onViewImage, onViewVideo, onImageLoad, onJoinRoom }) => {
    const isMe = msg.senderId === currentUser.id;
    const [translateX, setTranslateX] = useState(0);
    const touchStartCoords = useRef<{x: number, y: number} | null>(null);
    const longPressTimerRef = useRef<number | null>(null);
    const msgRef = useRef<HTMLDivElement>(null);
    const cachedMediaUrl = useCachedMedia(msg.mediaUrl);
    
    const onTouchStart = (e: React.TouchEvent) => {
        touchStartCoords.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        longPressTimerRef.current = window.setTimeout(() => {
            if (msgRef.current) {
                triggerHapticFeedback('light');
                onLongPress(msg, msgRef.current);
            }
            longPressTimerRef.current = null;
        }, 500);
    };
    const onTouchMove = (e: React.TouchEvent) => {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        if (!touchStartCoords.current) return;
        const diffX = e.touches[0].clientX - touchStartCoords.current.x;
        if (diffX > 0 && !isMe) setTranslateX(Math.min(diffX, 80));
        if (diffX < 0 && isMe) setTranslateX(Math.max(diffX, -80));
    };
    const onTouchEnd = () => {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        if (Math.abs(translateX) > 50) onReply(msg);
        setTranslateX(0); 
        touchStartCoords.current = null;
    };
    const formatTime = (timestamp: any) => {
        if (!timestamp) return '';
        if (msg.pending) return 'Enviando...';
        if (typeof timestamp.toDate === 'function') return timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (typeof timestamp.seconds === 'number') return new Date(timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (timestamp instanceof Date) return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return ''; 
    };
    
    const inviteMatch = msg.text?.match(/^\[INVITE_SALA\]([A-Z0-9]{4,8})/);
    
    const renderContent = () => {
        if (msg.deleted) return <p className="text-xs italic opacity-70">Mensaje eliminado</p>;
        if (inviteMatch) {
            const code = inviteMatch[1];
            return (
                <div className="w-full">
                    <div className="flex items-center gap-3 p-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}><UsersIcon /></div>
                        <div>
                            <p className="font-bold text-sm">Invitación a Sala</p>
                            <p className="text-xs opacity-80">{isMe ? 'Invitaste a' : ''} {partner.username} a unirse</p>
                        </div>
                    </div>
                    <div className={`border-t ${darkMode ? 'border-white/10' : 'border-black/10'}`}>
                        {!isMe && (
                             <button onClick={() => onJoinRoom(code)} className="w-full text-center py-3 font-bold text-misionero-azul text-sm">
                                Unirme a la Sala
                            </button>
                        )}
                    </div>
                </div>
            );
        }
        switch (msg.type) {
            case 'image': return <img 
                src={cachedMediaUrl || msg.mediaUrl} 
                alt="Imagen adjunta" 
                className={`rounded-lg max-w-[200px] sm:max-w-xs cursor-pointer min-h-[50px] bg-slate-100 dark:bg-slate-800 ${msg.pending ? 'opacity-50' : ''}`}
                onClick={() => onViewImage(cachedMediaUrl || msg.mediaUrl || '')} 
                onLoad={onImageLoad}
            />;
            case 'video': return (
                <div className="relative max-w-[200px] sm:max-w-xs cursor-pointer" onClick={() => onViewVideo(cachedMediaUrl || msg.mediaUrl || '')}>
                    <video 
                        src={cachedMediaUrl || msg.mediaUrl}
                        className={`rounded-lg w-full min-h-[50px] bg-slate-100 dark:bg-slate-800 ${msg.pending ? 'opacity-50' : ''}`}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg pointer-events-none">
                        <div className="w-12 h-12 bg-white/80 rounded-full flex items-center justify-center">
                            <svg className="w-6 h-6 text-black ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                    </div>
                </div>
            );
            case 'audio': return <CustomAudioPlayer src={cachedMediaUrl || msg.mediaUrl || ''} darkMode={darkMode} isSender={isMe} />;
            case 'file': return <div className="flex items-center gap-2"><p className="font-bold">{msg.fileName}</p><span className="text-xs opacity-70">{formatFileSize(msg.fileSize || 0)}</span></div>
            default: return <p className="text-sm font-medium leading-tight whitespace-pre-wrap">{msg.text}</p>;
        }
    };

    return (
        <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} w-full animate-in fade-in slide-in-from-bottom-2 duration-200`}>
            <div className="relative w-full flex" style={{ justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                <div className={`absolute top-1/2 -translate-y-1/2 text-slate-400 transition-opacity duration-300 ${isMe ? 'right-full mr-4' : 'left-full ml-4'}`} style={{ opacity: Math.abs(translateX) > 10 ? Math.min(Math.abs(translateX) / 50, 1) : 0 }}><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></div>
                <div ref={msgRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} className="transition-transform duration-100 ease-out max-w-[85%] z-10" style={{ transform: `translateX(${translateX}px)` }}>
                    <div className={`rounded-2xl shadow-sm relative overflow-hidden ${isMe ? 'bg-misionero-azul text-white' : (darkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700')} ${inviteMatch ? 'p-0' : 'p-3'}`}>
                        {msg.replyTo && !inviteMatch && <div className={`p-2 rounded-lg text-xs font-medium border-l-4 mb-2 ${isMe ? 'border-white bg-white/20' : `border-misionero-azul bg-misionero-azul/10`}`}><p className="font-black">{msg.replyTo.senderUsername}</p><p className="opacity-80 truncate">{msg.replyTo.textSnippet}</p></div>}
                        {renderContent()}
                        {msg.encrypted && !msg.pending && !msg.deleted && (
                            <div className={`absolute -right-1 -top-1 p-0.5 rounded-full ${isMe ? 'bg-white text-misionero-azul' : 'bg-misionero-azul text-white'}`}>
                                <LockIcon className="w-2 h-2" />
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-1.5 mt-1 px-1">
                <span className={`text-[9px] font-black uppercase flex items-center gap-1 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                    {msg.pending && <ClockIcon className="animate-spin" />}
                    {formatTime(msg.timestamp)}
                </span>
            </div>
             {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                <div className={`flex gap-1 p-1 rounded-full -mt-2 shadow-sm ${darkMode ? 'bg-slate-700' : 'bg-white'}`}>
                    {Object.entries(msg.reactions).map(([emoji, users]) => {
                        const userList = users as string[];
                        return userList.length > 0 && (
                            <span key={emoji} className="text-xs">
                                {emoji}
                                {userList.length > 1 && <span className="text-[9px] font-bold">{userList.length}</span>}
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const DirectMessageView: React.FC<DirectMessageViewProps> = ({ currentUser, partner, onBack, db, rtdb, storage, darkMode, partnerStatus, onViewProfile, onJoinRoom }) => {
    const [messages, setMessages] = useState<DirectMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const chatId = useMemo(() => generateChatId(currentUser.id, partner.id), [currentUser.id, partner.id]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const partnerCachedPhotoUrl = useCachedMedia(partner.photoURL);
    const [replyingTo, setReplyingTo] = useState<DirectMessage | null>(null);
    const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
    const [selectedMessageForAction, setSelectedMessageForAction] = useState<{ msg: DirectMessage, position: DOMRect } | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingTimerRef = useRef<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const shouldSendAudio = useRef(false);
    const [inputContent, setInputContent] = useState('');
    
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);
    const typingTimeoutRef = useRef<number | null>(null);
    const [imageToEdit, setImageToEdit] = useState<File | null>(null);
    const [videoToEdit, setVideoToEdit] = useState<File | null>(null);
    const [viewingVideoUrl, setViewingVideoUrl] = useState<string | null>(null);

    useEffect(() => {
        const typingRef = refRtdb(rtdb, `typing/${chatId}/${partner.id}`);
        const unsubscribe = onValueRtdb(typingRef, (snapshot) => {
             setIsPartnerTyping(snapshot.val() === true);
        });
        return () => unsubscribe();
    }, [chatId, partner.id, rtdb]);

    const updateTypingStatus = (isTyping: boolean) => {
        const myTypingRef = refRtdb(rtdb, `typing/${chatId}/${currentUser.id}`);
        if (isTyping) {
            setRtdb(myTypingRef, true);
            const onDisc = onDisconnect(myTypingRef);
            onDisc.remove();
            
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = window.setTimeout(() => updateTypingStatus(false), 3000);
        } else {
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            removeRtdb(myTypingRef);
        }
    };

    useEffect(() => {
        if (isPartnerTyping) scrollToBottom(true);
    }, [isPartnerTyping]);

    useEffect(() => {
        let isMounted = true;
        getMessagesFromCache(chatId).then(async (cachedMessages) => {
            if (isMounted && cachedMessages.length > 0) {
                const decrypted = await Promise.all(cachedMessages.map(async (m) => {
                    if (m.encrypted && m.text) {
                        return { ...m, text: await SecureMessenger.decrypt(m.text, chatId) };
                    }
                    return m;
                }));
                setMessages(decrypted);
                setIsLoading(false);
            }
        });

        const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
        const unsubscribe = onSnapshot(q, 
            async (snap) => {
                if (isMounted) {
                    const processedMessages = await Promise.all(snap.docs.map(async (d) => {
                        const data = d.data() as DirectMessage;
                        let text = data.text;
                        if (data.encrypted && text) {
                            text = await SecureMessenger.decrypt(text, chatId);
                        }
                        return { id: d.id, ...data, text };
                    }));
                    setMessages(prev => {
                        const existingPending = prev.filter(m => m.pending);
                        const remainingPending = existingPending.filter(pm => !processedMessages.some(rm => rm.id === pm.id));
                        return [...processedMessages, ...remainingPending];
                    });
                    setIsLoading(false);
                    if (processedMessages.length > 0) {
                        saveMessagesToCache(chatId, processedMessages);
                    }
                }
            },
            (error) => {
                console.error("Permission error fetching chat messages:", error);
                if (isMounted) setIsLoading(false);
            }
        );
        return () => { isMounted = false; unsubscribe(); };
    }, [chatId, db]);

    const scrollToBottom = useCallback((smooth = true) => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
        }
    }, []);

    useEffect(() => {
        scrollToBottom(false);
        const scrollTimeout = setTimeout(() => scrollToBottom(true), 100);
        const myChatInfoRef = doc(db, 'user_chats', currentUser.id, 'chats', chatId);
        updateDoc(myChatInfoRef, { unreadCount: 0 }).catch(() => {});
        return () => clearTimeout(scrollTimeout);
    }, [messages.length, chatId, currentUser.id, db, scrollToBottom]);
    
    const sendChatMessage = async (type: DirectMessage['type'], text?: string, mediaUrl?: string, mediaType?: string, fileName?: string, fileSize?: number) => {
        updateTypingStatus(false);
        const newMsgRef = doc(collection(db, 'chats', chatId, 'messages'));
        const tempId = newMsgRef.id;
        const now = new Date();

        const messageData: Partial<DirectMessage> = {
            id: tempId, senderId: currentUser.id, timestamp: now, read: false, type, text: text || '',
        };
        if (mediaUrl) messageData.mediaUrl = mediaUrl;
        if (mediaType) messageData.mediaType = mediaType;
        if (fileName) messageData.fileName = fileName;
        if (fileSize) messageData.fileSize = fileSize;

        if (replyingTo) {
            messageData.replyTo = {
                messageId: replyingTo.id,
                senderId: replyingTo.senderId,
                senderUsername: replyingTo.senderId === currentUser.id ? currentUser.username : partner.username,
                textSnippet: replyingTo.text?.substring(0, 50) || (replyingTo.type === 'image' ? 'Imagen' : 'Archivo'),
            };
            if (replyingTo.mediaUrl) messageData.replyTo.imagePreviewUrl = replyingTo.mediaUrl;
        }

        const optimisticMessage = { ...messageData, pending: true } as DirectMessage;
        setMessages(prev => [...prev, optimisticMessage]);
        setInputContent('');
        setReplyingTo(null);
        scrollToBottom(true);

        const finalMessageData = { ...messageData, timestamp: serverTimestamp() };

        if (text) {
            const encryptedText = await SecureMessenger.encrypt(text, chatId);
            finalMessageData.text = encryptedText;
            finalMessageData.encrypted = true;
        }

        let lastMessageText = text ? '🔒 Texto cifrado' : '';
        if (type === 'image') lastMessageText = '📷 Imagen';
        else if (type === 'audio') lastMessageText = '🎤 Audio';
        else if (type === 'video') lastMessageText = '📹 Video';
        else if (type === 'file') lastMessageText = `📄 Archivo`;
        else if (text?.startsWith('[INVITE_SALA]')) lastMessageText = 'Te ha invitado a una sala';

        const commonChatInfo = { lastMessageText, lastMessageTimestamp: serverTimestamp(), lastMessageSenderId: String(currentUser.id) };

        try {
            const batch = writeBatch(db);
            batch.set(newMsgRef, finalMessageData as Omit<DirectMessage, 'pending' | 'id'>);
            batch.set(doc(db, 'user_chats', currentUser.id, 'chats', chatId), { ...commonChatInfo, partnerId: partner.id, partnerUsername: partner.username, partnerPhotoURL: partner.photoURL || null, unreadCount: 0 }, { merge: true });
            await batch.commit();

            try {
                await setDoc(doc(db, 'user_chats', partner.id, 'chats', chatId), { ...commonChatInfo, partnerId: currentUser.id, partnerUsername: currentUser.username, partnerPhotoURL: currentUser.photoURL || null, unreadCount: increment(1) }, { merge: true });
            } catch (partnerUpdateError) {
                console.warn("Could not update recipient's chat list. Sync will handle it.", partnerUpdateError);
            }
        } catch (error: any) {
            console.error("Error sending message:", error);
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, text: 'Error al enviar', pending: false } : m));
            alert("Fallo al enviar mensaje.");
        }
    };

    const handleSendFile = async (file: File) => {
        const fileId = doc(collection(db, 'chats')).id;
        const filePath = `chat_media/${currentUser.id}/${chatId}/${fileId}_${file.name}`;
        
        const fileRef = storageRef(storage, filePath);
        try {
            await uploadBytes(fileRef, file);
            const url = await getDownloadURL(fileRef);
            let type: DirectMessage['type'] = 'file';
            if (file.type.startsWith('image/')) type = 'image';
            if (file.type.startsWith('video/')) type = 'video';
            await sendChatMessage(type, undefined, url, file.type, file.name, file.size);
        } catch (error: any) {
            console.error("Error uploading file:", error);
            alert("No se pudo enviar el archivo.");
        }
    };
    
    const startRecording = async () => {
        if (isRecording) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = recorder;
            const audioChunks: Blob[] = [];
            recorder.ondataavailable = e => audioChunks.push(e.data);
            recorder.onstop = async () => {
                stream.getTracks().forEach(track => track.stop());
                if (!shouldSendAudio.current) return;
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                if (audioBlob.size === 0) return;
                const fileId = doc(collection(db, 'chats')).id;
                const fileName = `nota_de_voz_${fileId}.webm`;
                const filePath = `chat_media/${currentUser.id}/${chatId}/${fileName}`;
                const fileRef = storageRef(storage, filePath);
                try {
                    await uploadBytes(fileRef, audioBlob);
                    const url = await getDownloadURL(fileRef);
                    await sendChatMessage('audio', undefined, url, audioBlob.type, fileName, audioBlob.size);
                } catch (error: any) {
                    console.error("Error uploading audio:", error);
                    alert("Error enviando audio.");
                }
            };
            recorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            setInputContent('');
            recordingTimerRef.current = window.setInterval(() => setRecordingTime(t => t + 1), 1000);
        } catch (err) {
            console.error(err);
            alert("Necesitas permiso para usar el micrófono para grabar notas de voz.");
        }
    };

    const stopRecording = (send: boolean) => {
        if (mediaRecorderRef.current?.state === 'recording') {
            shouldSendAudio.current = send;
            mediaRecorderRef.current.stop();
        }
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        setIsRecording(false);
        setRecordingTime(0);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.type.startsWith('image/')) {
                setImageToEdit(file);
            } else if (file.type.startsWith('video/')) {
                setVideoToEdit(file);
            } else {
                handleSendFile(file);
            }
        }
        if (e.target) {
            e.target.value = '';
        }
    };

    const handleReaction = async (emoji: string) => {
        if (!selectedMessageForAction) return;
        const { msg } = selectedMessageForAction;
        const msgRef = doc(db, 'chats', chatId, 'messages', msg.id);
        const currentUsers = msg.reactions?.[emoji] || [];
        const isRemoving = currentUsers.includes(currentUser.id);
        setMessages(prev => prev.map(m => {
            if (m.id === msg.id) {
                const updatedReactions = { ...(m.reactions || {}) };
                if (isRemoving) updatedReactions[emoji] = (updatedReactions[emoji] || []).filter(uid => uid !== currentUser.id);
                else updatedReactions[emoji] = [...(updatedReactions[emoji] || []), currentUser.id];
                return { ...m, reactions: updatedReactions };
            }
            return m;
        }));
        try {
            await updateDoc(msgRef, { [`reactions.${emoji}`]: isRemoving ? arrayRemove(currentUser.id) : arrayUnion(currentUser.id) });
        } catch (e) {
            console.error("Error reacting:", e);
        }
        setSelectedMessageForAction(null);
    };

    const handleDelete = async () => {
         if (!selectedMessageForAction) return;
         const { msg } = selectedMessageForAction;
         if (msg.senderId !== currentUser.id) return;
         setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, deleted: true } : m));
         try {
             await updateDoc(doc(db, 'chats', chatId, 'messages', msg.id), { deleted: true });
         } catch (e) {
             console.error("Error deleting:", e);
         }
         setSelectedMessageForAction(null);
    };

    const handleCopy = () => {
        if (!selectedMessageForAction || !selectedMessageForAction.msg.text) return;
        navigator.clipboard.writeText(selectedMessageForAction.msg.text);
        triggerHapticFeedback('light');
        setSelectedMessageForAction(null);
    };
    
    const partnerStatusText = partnerStatus?.state === 'online' ? 'En línea' : partnerStatus?.last_changed ? `Últ. vez ${formatLastSeen(partnerStatus.last_changed)}` : 'Desconectado';

    return (
        <div className={`fixed inset-0 z-[200] flex flex-col animate-in slide-in-from-right duration-300 ${darkMode ? 'bg-black' : 'bg-slate-50'}`}>
            <header className={`px-4 pt-12 pb-3 border-b ${darkMode ? 'border-slate-800 bg-black/80' : 'border-slate-100 bg-white/80'} backdrop-blur-sm flex items-center gap-3 shrink-0 z-20`}>
                <button onClick={onBack} className="p-2 rounded-full active:scale-90 text-slate-500 dark:text-slate-400"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"/></svg></button>
                <button onClick={() => onViewProfile(partner.id)} className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="relative shrink-0">{partnerCachedPhotoUrl ? <img src={partnerCachedPhotoUrl} alt={partner.username} className="w-10 h-10 rounded-full object-cover"/> : <div className="w-10 h-10 rounded-full bg-misionero-azul flex items-center justify-center font-black text-white">{partner.username.charAt(0).toUpperCase()}</div>} {partnerStatus?.state === 'online' && <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 ${darkMode ? 'border-black' : 'border-slate-50'} bg-misionero-verde`}></div>}</div>
                    <div className="text-left min-w-0">
                        <div className="flex items-center gap-1.5">
                            <h3 className={`font-black text-sm uppercase truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>{partner.username}</h3>
                            {partner.profileValidated && (<div className="text-blue-500 bg-blue-500/10 rounded-full p-0.5"><VerifiedIcon /></div>)}
                        </div>
                        <p className="text-[10px] font-bold text-slate-400">{partnerStatusText}</p>
                    </div>
                </button>
                <div className="w-10"></div>
            </header>
            
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 custom-scroll">
                {isLoading ? <div className="flex justify-center items-center h-full"><div className="w-6 h-6 border-2 border-misionero-azul/30 border-t-misionero-azul rounded-full animate-spin"></div></div> : messages.map(msg => (
                    <SwipeableDirectMessage key={msg.id} msg={msg} currentUser={currentUser} partner={partner} darkMode={darkMode} onReply={setReplyingTo} onLongPress={(msg, target) => setSelectedMessageForAction({ msg, position: target.getBoundingClientRect() })} onViewImage={setViewingImageUrl} onViewVideo={setViewingVideoUrl} onImageLoad={() => scrollToBottom(true)} onJoinRoom={onJoinRoom} />
                ))}
                
                {isPartnerTyping && (
                    <div className="w-full flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-200 mb-2">
                        <div className={`p-3.5 rounded-2xl shadow-sm ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                            <div className={`flex gap-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}><span className="typing-dot"></span><span className="typing-dot" style={{animationDelay: '0.2s'}}></span><span className="typing-dot" style={{animationDelay: '0.4s'}}></span></div>
                        </div>
                    </div>
                )}
                
                <div ref={messagesEndRef} />
            </div>

            <div className={`p-3 border-t shrink-0 ${darkMode ? 'border-slate-800 bg-black' : 'border-slate-100 bg-slate-50'} pb-[calc(0.75rem+env(safe-area-inset-bottom))]`}>
                {replyingTo && <div className={`flex items-center justify-between px-4 py-2 mb-2 rounded-xl text-xs font-medium border-l-4 border-misionero-azul ${darkMode ? 'bg-slate-900 text-slate-300' : 'bg-slate-50 text-slate-600'}`}><div className="min-w-0"><span className="text-[8px] font-black uppercase text-misionero-azul">Respondiendo a {replyingTo.senderId === currentUser.id ? "ti mismo" : partner.username}</span><p className="truncate">{replyingTo.text}</p></div><button onClick={() => setReplyingTo(null)} className="p-1"><XIcon/></button></div>}
                <div className="flex gap-2 items-end">
                    {isRecording ? (
                        <>
                            <div className="flex-1 flex items-center justify-between rounded-2xl px-4 py-3 bg-red-500/10 text-red-500 animate-pulse"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-red-500 rounded-full"></div><span className="font-bold text-sm">Grabando...</span></div><span className="font-mono text-sm">{Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}</span></div>
                            <button onClick={() => stopRecording(false)} className="p-3.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shadow-md active:scale-95"><TrashIcon className="w-6 h-6 text-red-500" /></button>
                            <button onClick={() => stopRecording(true)} className="bg-misionero-verde text-white font-black w-12 h-12 rounded-2xl shadow-md active:scale-95 transition-transform flex items-center justify-center shrink-0"><SendIcon /></button>
                        </>
                    ) : (
                        <>
                            <button className={`p-3 rounded-full active:scale-90 transition-colors ${darkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`} onClick={() => fileInputRef.current?.click()}><PlusIcon/></button>
                            <input type="file" ref={fileInputRef} hidden onChange={handleFileSelect} accept="image/*,audio/*,video/*,.pdf,.doc,.docx" />
                            <textarea value={inputContent} onChange={e => { setInputContent(e.target.value); updateTypingStatus(true); }} placeholder="Escribe un mensaje..." className={`flex-1 min-w-0 rounded-2xl px-4 py-3 text-sm font-bold outline-none border transition-all resize-none max-h-32 ${darkMode ? 'bg-black border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`} rows={1} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage('text', inputContent); } }} />
                            {inputContent ? (<button onClick={() => sendChatMessage('text', inputContent)} className="bg-misionero-verde text-white font-black w-12 h-12 rounded-2xl shadow-md active:scale-95 transition-transform flex items-center justify-center shrink-0"><SendIcon/></button>) : (<button onClick={startRecording} className="p-3.5 rounded-full bg-misionero-rojo text-white shadow-md active:scale-95"><MicIcon/></button>)}
                        </>
                    )}
                </div>
            </div>
            
            {selectedMessageForAction && (
                <div className="fixed inset-0 z-[250] flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedMessageForAction(null)}>
                    <div className={`w-full p-6 rounded-t-[2.5rem] shadow-2xl animate-in slide-in-from-bottom duration-300 ${darkMode ? 'bg-slate-900 border-t border-slate-800' : 'bg-white border-t border-slate-200'}`} onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between mb-6 px-2">{REACTIONS.map(emoji => (<button key={emoji} onClick={() => handleReaction(emoji)} className="text-3xl hover:scale-125 transition-transform active:scale-90">{emoji}</button>))}</div>
                        <div className="space-y-2">
                            <button onClick={() => { setReplyingTo(selectedMessageForAction.msg); setSelectedMessageForAction(null); }} className={`w-full py-4 rounded-2xl text-xs font-bold uppercase flex items-center justify-center gap-2 ${darkMode ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}`}><ReplyIcon /> Responder</button>
                             <button onClick={handleCopy} className={`w-full py-4 rounded-2xl text-xs font-bold uppercase flex items-center justify-center gap-2 ${darkMode ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}`}><CopyIcon /> Copiar</button>
                            {selectedMessageForAction.msg.senderId === currentUser.id && (<button onClick={handleDelete} className={`w-full py-4 rounded-2xl text-xs font-bold uppercase flex items-center justify-center gap-2 text-red-500 ${darkMode ? 'bg-red-500/10' : 'bg-red-500/5'}`}><TrashIcon /> Eliminar</button>)}
                        </div>
                    </div>
                </div>
            )}
            
            {viewingImageUrl && <ImageViewer imageUrl={viewingImageUrl} onClose={() => setViewingImageUrl(null)} onDelete={()=>{}} darkMode={darkMode} />}
            {viewingVideoUrl && <VideoViewer videoUrl={viewingVideoUrl} onClose={() => setViewingVideoUrl(null)} darkMode={darkMode} />}

            {imageToEdit && (
                <ImageEditor
                    imageFile={imageToEdit}
                    onCancel={() => setImageToEdit(null)}
                    onSend={(editedBlob) => {
                        const newName = imageToEdit.name.replace(/\.[^/.]+$/, "") + ".jpg";
                        const editedFile = new File([editedBlob], newName, { type: 'image/jpeg' });
                        handleSendFile(editedFile);
                        setImageToEdit(null);
                    }}
                    darkMode={darkMode}
                />
            )}
            {videoToEdit && (
                <VideoEditor
                    videoFile={videoToEdit}
                    onCancel={() => setVideoToEdit(null)}
                    onSend={(editedBlob) => {
                        const newName = videoToEdit.name.replace(/\.[^/.]+$/, "") + ".webm";
                        const editedFile = new File([editedBlob], newName, { type: 'video/webm' });
                        handleSendFile(editedFile);
                        setVideoToEdit(null);
                    }}
                    darkMode={darkMode}
                />
            )}
        </div>
    );
};

export default DirectMessageView;