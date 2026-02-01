
import React, { useState, useRef } from 'react';
import { User as AppUser, ChatInfo } from '../types';
import { triggerHapticFeedback } from '../services/haptics';
import { Firestore, doc, setDoc, updateDoc } from 'firebase/firestore';

interface ChatListViewProps {
    userChats: ChatInfo[];
    onlineStatuses: Record<string, { state: 'online' } | { state: 'offline', last_changed: number }>;
    typingStatuses: Record<string, string[]>;
    onUserSelect: (partner: { id: string; username: string; }) => void;
    onViewProfile: (userId: string) => void;
    darkMode: boolean;
    currentUser: AppUser;
    db: Firestore;
    rtdb: any;
}

const MuteIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-4 h-4"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
    </svg>
);

const BlockIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-4 h-4"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
);

const ImageIcon = () => <svg className="w-4 h-4 inline -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>;
const MicIcon = () => <svg className="w-4 h-4 inline -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>;
const FileIcon = () => <svg className="w-4 h-4 inline -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>;


const generateChatId = (uid1: string, uid2: string): string => {
    return [uid1, uid2].sort().join('_');
};

const ChatListView: React.FC<ChatListViewProps> = ({ userChats, onlineStatuses, onUserSelect, onViewProfile, darkMode, currentUser, db, typingStatuses }) => {
    const [filter, setFilter] = useState('');
    const [selectedChatForOptions, setSelectedChatForOptions] = useState<ChatInfo | null>(null);
    const longPressTimerRef = useRef<number | null>(null);
    const touchStartCoords = useRef<{x: number, y: number} | null>(null);
    const isLongPress = useRef(false);
    const touchStartTargetRef = useRef<EventTarget | null>(null);

    const filteredChats = userChats.filter(chat => 
        chat.partnerUsername.toLowerCase().includes(filter.toLowerCase())
    );

    const handleTouchStart = (chat: ChatInfo, e: React.TouchEvent) => {
        isLongPress.current = false;
        touchStartCoords.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        touchStartTargetRef.current = e.target;

        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
        }

        longPressTimerRef.current = window.setTimeout(() => {
            isLongPress.current = true;
            triggerHapticFeedback('light');
            setSelectedChatForOptions(chat);
            
            longPressTimerRef.current = null;
            touchStartCoords.current = null; 
        }, 500);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!touchStartCoords.current || isLongPress.current) return;
        const moveX = Math.abs(e.touches[0].clientX - touchStartCoords.current.x);
        const moveY = Math.abs(e.touches[0].clientY - touchStartCoords.current.y);
        
        if (moveX > 10 || moveY > 10) { 
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
            }
        }
    };

    const handleTouchEnd = (chat: ChatInfo) => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;

            if ((touchStartTargetRef.current as HTMLElement)?.closest('[data-avatar-button="true"]')) {
                onViewProfile(chat.partnerId);
            } else {
                onUserSelect({ id: chat.partnerId, username: chat.partnerUsername });
            }
        }
        
        isLongPress.current = false;
        touchStartCoords.current = null;
        touchStartTargetRef.current = null;
    };


    const handleMute = async (duration: number) => {
        if (!selectedChatForOptions) return;
        const chatId = generateChatId(currentUser.id, selectedChatForOptions.partnerId);
        const mutedUntil = duration === -1 ? 9999999999999 : Date.now() + (duration * 60 * 1000);
        const myChatInfoRef = doc(db, 'user_chats', currentUser.id, 'chats', chatId);
        await setDoc(myChatInfoRef, { mutedUntil }, { merge: true });
        setSelectedChatForOptions(null);
    };

    const handleUnmute = async () => {
        if (!selectedChatForOptions) return;
        const chatId = generateChatId(currentUser.id, selectedChatForOptions.partnerId);
        const myChatInfoRef = doc(db, 'user_chats', currentUser.id, 'chats', chatId);
        await updateDoc(myChatInfoRef, { mutedUntil: 0 });
        setSelectedChatForOptions(null);
    };

    const handleToggleBlock = async () => {
        if (!selectedChatForOptions) return;
        const chatId = generateChatId(currentUser.id, selectedChatForOptions.partnerId);
        const myChatInfoRef = doc(db, 'user_chats', currentUser.id, 'chats', chatId);
        const isBlocked = selectedChatForOptions.isBlocked === true;
        await setDoc(myChatInfoRef, { isBlocked: !isBlocked }, { merge: true });
        setSelectedChatForOptions(null);
    };

    const renderPreview = (text?: string) => {
        if (!text) return null;
        if (text.startsWith('📷')) return <span className="flex items-center gap-1.5"><ImageIcon/> {text.substring(2)}</span>;
        if (text.startsWith('🎤')) return <span className="flex items-center gap-1.5"><MicIcon/> {text.substring(2)}</span>;
        if (text.startsWith('📄')) return <span className="flex items-center gap-1.5"><FileIcon/> {text.substring(2)}</span>;
        return text;
    };

    return (
        <div className="w-full h-full flex flex-col relative">
            <div className="px-4 py-2 shrink-0">
                <input 
                    type="text" 
                    placeholder="Buscar chats..." 
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className={`w-full glass-ui rounded-xl px-4 py-3 text-xs font-bold outline-none transition-colors ${darkMode ? 'bg-slate-900 border-slate-800 text-white placeholder:text-slate-600' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                />
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scroll px-4 pt-2 pb-48 space-y-2">
                {filteredChats.length === 0 && (
                    <div className="text-center py-10 opacity-50">
                        <p className="text-[10px] font-black uppercase">No se encontraron chats</p>
                    </div>
                )}
                {filteredChats.map((chat, index) => {
                    const partnerStatus = onlineStatuses[chat.partnerId];
                    const isOnline = partnerStatus?.state === 'online';
                    const unreadCount = chat.unreadCount || 0;
                    const hasUnread = unreadCount > 0;
                    const isBlocked = chat.isBlocked === true;
                    const isMuted = chat.mutedUntil && chat.mutedUntil > Date.now();
                    const isMe = chat.partnerId === currentUser.id;
                    const isMeSender = chat.lastMessageSenderId === currentUser.id;

                    const chatId = generateChatId(currentUser.id, chat.partnerId);
                    const isPartnerTyping = (typingStatuses[chatId] || []).includes(chat.partnerId);

                    const lastMsgContent = chat.lastMessageText ? chat.lastMessageText.split('\n')[0] : '';
                    
                    let prefix = '';
                    if (isMeSender && lastMsgContent) {
                        prefix = 'Tú: ';
                    }

                    const previewText = isPartnerTyping 
                        ? <span className="text-misionero-verde animate-pulse">Escribiendo...</span>
                        : (lastMsgContent 
                            ? <>{prefix}{renderPreview(lastMsgContent)}</>
                            : (isOnline ? 'En línea' : 'Desconectado'));

                    return (
                        <div
                            key={chat.partnerId}
                            onTouchStart={(e) => handleTouchStart(chat, e)}
                            onTouchEnd={() => handleTouchEnd(chat)}
                            onTouchMove={handleTouchMove}
                            onClick={(e) => {
                                if (!(e.target as HTMLElement).closest('[data-avatar-button="true"]')) {
                                    onUserSelect({ id: chat.partnerId, username: chat.partnerUsername });
                                }
                            }}
                            className={`relative glass-ui rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-transform animate-stagger-in cursor-pointer ${isBlocked ? 'opacity-60 grayscale' : ''}`}
                            style={{ animationDelay: `${index * 20}ms` }}
                        >
                            <div 
                                className="relative shrink-0 active:scale-90 transition-transform z-10"
                                data-avatar-button="true"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onViewProfile(chat.partnerId);
                                }}
                            >
                                {chat.partnerPhotoURL ? (
                                    <img src={chat.partnerPhotoURL} alt={chat.partnerUsername} className="w-12 h-12 rounded-full object-cover shadow-lg" />
                                ) : (
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-lg text-white bg-misionero-azul shadow-lg`}>
                                        {chat.partnerUsername.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 ${darkMode ? 'border-black' : 'border-slate-50'} ${isOnline ? 'bg-misionero-verde' : 'bg-slate-400'}`}></div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <h4 className={`font-black text-sm uppercase truncate ${darkMode ? 'text-white' : 'text-slate-800'} ${hasUnread ? 'font-extrabold' : ''}`}>
                                        {isMe ? <span className="text-slate-500 mr-1">(Tú)</span> : null}
                                        {chat.partnerUsername}
                                    </h4>
                                </div>
                                <p className={`text-xs truncate ${hasUnread ? `font-bold ${darkMode ? 'text-white' : 'text-slate-900'}` : `font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}`}>
                                    {previewText}
                                </p>
                            </div>
                            
                            <div className="flex flex-col items-end gap-1">
                                {hasUnread && !isBlocked && (
                                    <div className="shrink-0 w-5 h-5 bg-misionero-rojo rounded-full flex items-center justify-center text-white text-[10px] font-black animate-in zoom-in-50">
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </div>
                                )}
                                <div className="flex items-center gap-1">
                                    {isMuted && !isBlocked && <MuteIcon className={`w-3.5 h-3.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />}
                                    {isBlocked && <BlockIcon className="w-3.h-3.5 text-misionero-rojo" />}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {selectedChatForOptions && (
                <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedChatForOptions(null)}>
                    <div className={`w-full rounded-t-[2.5rem] shadow-2xl animate-in slide-in-from-bottom duration-300 pb-10 ${darkMode ? 'bg-slate-900 border-t border-slate-800' : 'bg-white border-t border-slate-200'}`} onClick={e => e.stopPropagation()}>
                        <div className="flex justify-center pt-4 pb-2">
                            <div className={`w-12 h-1.5 rounded-full ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}></div>
                        </div>
                        <div className="px-6 pb-2 text-center border-b border-slate-100 dark:border-slate-800">
                            <h3 className={`text-sm font-black uppercase ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                {selectedChatForOptions.partnerUsername}
                            </h3>
                        </div>
                        <div className="p-4 space-y-2">
                            {selectedChatForOptions.mutedUntil && selectedChatForOptions.mutedUntil > Date.now() ? (
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
                            <button onClick={handleToggleBlock} className={`w-full py-4 mt-2 rounded-2xl text-xs font-bold uppercase transition-colors ${selectedChatForOptions.isBlocked ? 'bg-misionero-verde/10 text-misionero-verde active:bg-misionero-verde/20' : 'bg-red-500/10 text-red-500 active:bg-red-500/20'}`}>
                                {selectedChatForOptions.isBlocked ? 'Desbloquear' : 'Bloquear'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatListView;
