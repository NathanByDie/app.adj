import React, { useState, useRef, useEffect, useMemo } from 'react';
import { User as AppUser, ChatInfo } from '../types';
import { triggerHapticFeedback } from '../services/haptics';
import { Firestore, doc, setDoc, updateDoc } from 'firebase/firestore';
import useCachedMedia from '../hooks/useCachedMedia';
import { SecureMessenger } from '../services/security';

interface ChatListViewProps {
    userChats: ChatInfo[];
    allValidatedUsers: AppUser[];
    onlineStatuses: Record<string, { state: 'online' } | { state: 'offline', last_changed: number }>;
    typingStatuses: Record<string, any>;
    onUserSelect: (partner: AppUser) => void;
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

const VerifiedIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-3 h-3"} viewBox="0 0 24 24" fill="currentColor">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
    </svg>
);

const ImageIcon = () => <svg className="w-4 h-4 inline -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>;
const MicIcon = () => <svg className="w-4 h-4 inline -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>;
const FileIcon = () => <svg className="w-4 h-4 inline -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>;
const VideoIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-6 h-6"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);


const generateChatId = (uid1: string, uid2: string): string => {
    return [uid1, uid2].sort().join('_');
};

const ChatListItem: React.FC<{
    chat: ChatInfo, darkMode: boolean, onlineStatuses: Record<string, any>, currentUser: AppUser, 
    typingStatuses: Record<string, any>, handleTouchStart: (e: React.TouchEvent) => void, handleTouchEnd: () => void, 
    handleTouchMove: (e: React.TouchEvent) => void, onViewProfile: () => void, onUserSelect: () => void 
}> = ({ chat, darkMode, onlineStatuses, currentUser, typingStatuses, handleTouchStart, handleTouchEnd, handleTouchMove, onViewProfile, onUserSelect }) => {
    
    // Si no hay timestamp NI texto, es un chat nuevo sin uso.
    // Si hay texto pero no timestamp (null), es un mensaje enviándose ahora mismo (pending).
    const isNewChat = !chat.lastMessageTimestamp && !chat.lastMessageText;
    const cachedPhotoUrl = useCachedMedia(chat.partnerPhotoURL);

    const partnerStatus = onlineStatuses[chat.partnerId];
    const isOnline = partnerStatus?.state === 'online';
    const unreadCount = chat.unreadCount || 0;
    const hasUnread = unreadCount > 0;
    const isBlocked = chat.isBlocked === true;
    const isMuted = chat.mutedUntil && chat.mutedUntil > Date.now();
    
    const isMeSender = Boolean(chat.lastMessageSenderId && String(chat.lastMessageSenderId) === String(currentUser.id));
    const isSelfChat = String(chat.partnerId) === String(currentUser.id);

    const chatId = generateChatId(currentUser.id, chat.partnerId);
    
    const isPartnerTyping = typingStatuses[chatId] && typingStatuses[chatId][chat.partnerId];

    // Estado para almacenar el texto descifrado
    const [decryptedPreview, setDecryptedPreview] = useState<string>('');
    const [isDecrypting, setIsDecrypting] = useState(false);

    // Efecto para descifrar el mensaje
    useEffect(() => {
        let isMounted = true;
        
        if (chat.lastMessageText) {
            setIsDecrypting(true);
            SecureMessenger.decrypt(chat.lastMessageText, chatId).then(text => {
                if (isMounted) {
                    setDecryptedPreview(text);
                    setIsDecrypting(false);
                }
            });
        } else {
            setDecryptedPreview('');
            setIsDecrypting(false);
        }
        
        return () => { isMounted = false; };
    }, [chat.lastMessageText, chatId]);

    let prefix = isMeSender && decryptedPreview ? 'Tú: ' : '';

    const renderPreview = (text?: string) => {
        if (!text) return null;
        if (text.startsWith('📷')) return <span className="flex items-center gap-1.5"><ImageIcon/> Imagen</span>;
        if (text.startsWith('🎤')) return <span className="flex items-center gap-1.5"><MicIcon/> Nota de voz</span>;
        if (text.startsWith('📹')) return <span className="flex items-center gap-1.5"><VideoIcon className="w-4 h-4 inline -mt-0.5" /> Video</span>;
        if (text.startsWith('📄')) return <span className="flex items-center gap-1.5"><FileIcon/> {text.substring(2).trim()}</span>;
        if (text === '🔒 Texto cifrado') return <span className="opacity-80">Mensaje cifrado</span>;
        return text;
    };
    
    const previewText = isPartnerTyping 
        ? <span className="text-misionero-verde animate-pulse font-bold">Escribiendo...</span>
        : isNewChat 
            ? <span className="italic opacity-70">Toca para iniciar un chat</span>
            : (decryptedPreview 
                ? <>{prefix}{renderPreview(decryptedPreview)}</> 
                : (isDecrypting 
                    ? <span className="opacity-50 animate-pulse">...</span> 
                    : (isOnline ? 'En línea' : 'Desconectado')
                  )
              );

    return (
        <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchMove={handleTouchMove}
            onClick={(e) => {
                if (!(e.target as HTMLElement).closest('[data-avatar-button="true"]')) {
                    onUserSelect();
                }
            }}
            className={`relative glass-ui rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-transform animate-stagger-in cursor-pointer ${isBlocked ? 'opacity-60 grayscale' : ''}`}
        >
            <div 
                className="relative shrink-0 active:scale-90 transition-transform z-10"
                data-avatar-button="true"
                onClick={(e) => {
                    e.stopPropagation();
                    onViewProfile();
                }}
            >
                {cachedPhotoUrl ? (
                    <img src={cachedPhotoUrl} alt={chat.partnerUsername} className="w-12 h-12 rounded-full object-cover shadow-lg" />
                ) : (
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-lg text-white ${isNewChat ? 'bg-slate-400' : 'bg-misionero-azul'} shadow-lg`}>{
                        chat.partnerUsername?.charAt(0).toUpperCase() || '?'
                    }</div>
                )}
                <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 ${darkMode ? 'border-black' : 'border-slate-50'} ${isOnline ? 'bg-misionero-verde' : 'bg-slate-400'}`}></div>
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                    <h4 className={`font-black text-sm uppercase truncate ${darkMode ? 'text-white' : 'text-slate-800'} ${hasUnread ? 'font-extrabold' : ''}`}>
                        {isSelfChat ? <span className="text-slate-500 mr-1">(Tú)</span> : null}
                        {chat.partnerUsername}
                    </h4>
                    {chat.partnerValidated && (
                        <div className="text-blue-500 bg-blue-500/10 rounded-full p-0.5" title="Perfil Verificado">
                            <VerifiedIcon />
                        </div>
                    )}
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
};


const ChatListView: React.FC<ChatListViewProps> = ({ userChats, allValidatedUsers, onlineStatuses, onUserSelect, onViewProfile, darkMode, currentUser, db, typingStatuses }) => {
    const [filter, setFilter] = useState('');
    const [selectedChatForOptions, setSelectedChatForOptions] = useState<ChatInfo | null>(null);
    const [showSecurityInfo, setShowSecurityInfo] = useState(false); // Estado para el modal de seguridad
    const longPressTimerRef = useRef<number | null>(null);
    const touchStartCoords = useRef<{x: number, y: number} | null>(null);
    const isLongPress = useRef(false);
    const touchStartTargetRef = useRef<EventTarget | null>(null);

    const handleSelectChat = (chat: ChatInfo) => {
        const partnerUser = allValidatedUsers.find(u => u.id === chat.partnerId);
        if (partnerUser) {
            onUserSelect(partnerUser);
        } else {
            // Fallback for new/unvalidated users
            // FIX: Removed `isAuthenticated` as it does not exist on the AppUser type.
            const partialPartner: AppUser = {
                id: chat.partnerId,
                username: chat.partnerUsername,
                username_lowercase: chat.partnerUsername.toLowerCase(),
                photoURL: chat.partnerPhotoURL,
                profileValidated: chat.partnerValidated,
                email: '', // Not available in ChatInfo
                role: 'member', // Assume
            };
            onUserSelect(partialPartner);
        }
    };

    const combinedAndFilteredChats = useMemo(() => {
        const existingPartnerIds = new Set(userChats.map(c => c.partnerId));

        const newContactChats: ChatInfo[] = allValidatedUsers
            .filter(user => !existingPartnerIds.has(user.id))
            .map(user => ({
                partnerId: user.id,
                partnerUsername: user.username,
                partnerPhotoURL: user.photoURL,
                partnerValidated: user.profileValidated,
                // No last message info for new contacts
            }));
        
        // Combine existing chats with new contacts
        const combined = [...userChats, ...newContactChats];

        // Filter the combined list
        const filtered = filter
            ? combined.filter(chat => chat.partnerUsername.toLowerCase().includes(filter.toLowerCase()))
            : combined;

        // Sort: existing chats first by timestamp, then new contacts alphabetically
        return filtered.sort((a, b) => {
            // Helper para obtener el valor del tiempo
            // Si el timestamp es null (escritura pendiente) pero hay texto, se considera "Ahora" (prioridad máxima)
            const getTimestamp = (c: ChatInfo) => {
                if (c.lastMessageTimestamp?.seconds) return c.lastMessageTimestamp.seconds;
                // Si no hay timestamp pero hay texto, está enviándose ahora mismo.
                // Retornamos un número muy grande para que quede arriba.
                if (c.lastMessageText) return Number.MAX_SAFE_INTEGER;
                return 0; // Chat vacío/nuevo real
            };

            const timeA = getTimestamp(a);
            const timeB = getTimestamp(b);

            if (timeA !== timeB) {
                return timeB - timeA; // Más reciente primero
            }
            // Si los timestamps son iguales (o ambos son 0 para nuevos contactos), ordenar alfabéticamente
            return a.partnerUsername.localeCompare(b.partnerUsername);
        });

    }, [userChats, allValidatedUsers, filter]);

    const handleTouchStart = (chat: ChatInfo, e: React.TouchEvent) => {
        isLongPress.current = false;
        touchStartCoords.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        touchStartTargetRef.current = e.target;

        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);

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
                handleSelectChat(chat);
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

    return (
        <div className="w-full h-full flex flex-col relative">
            <div className="px-4 py-2 shrink-0">
                <input 
                    type="text" 
                    placeholder="Buscar chats y personas..." 
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className={`w-full glass-ui rounded-xl px-4 py-3 text-xs font-bold outline-none transition-colors ${darkMode ? 'bg-slate-900 border-slate-800 text-white placeholder:text-slate-600' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                />
            </div>

            <div className="px-4 pb-2 text-center">
                <button 
                    onClick={() => setShowSecurityInfo(true)}
                    className="flex items-center justify-center gap-1.5 text-[9px] font-bold text-amber-700/80 dark:text-amber-600/70 hover:underline active:scale-95 transition-transform mx-auto w-full"
                >
                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>Todos los mensajes del chat estan cifrados de extremo a extremo. Ni ADJStudios ni nadie puede acceder a tu información</span>
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scroll px-4 pt-2 pb-48 space-y-2">
                {combinedAndFilteredChats.map((chat) => (
                    <ChatListItem
                        key={chat.partnerId}
                        chat={chat}
                        darkMode={darkMode}
                        onlineStatuses={onlineStatuses}
                        currentUser={currentUser}
                        typingStatuses={typingStatuses}
                        handleTouchStart={(e) => handleTouchStart(chat, e)}
                        handleTouchEnd={() => handleTouchEnd(chat)}
                        handleTouchMove={handleTouchMove}
                        onViewProfile={() => onViewProfile(chat.partnerId)}
                        onUserSelect={() => handleSelectChat(chat)}
                    />
                ))}

                {combinedAndFilteredChats.length === 0 && (
                    <div className="text-center py-10 opacity-50">
                        <p className="text-[10px] font-black uppercase">
                            {filter ? "No se encontraron resultados" : "No hay usuarios validados para mostrar"}
                        </p>
                    </div>
                )}
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
                                <button onClick={handleUnmute} className={`w-full py-4 rounded-2xl text-xs font-bold uppercase transition-colors ${darkMode ? 'bg-slate-800 text-white active:bg-slate-700' : 'bg-slate-100 text-slate-700 active:bg-slate-200'}`}>Desactivar Silencio</button>
                            ) : (
                                <>
                                    <button onClick={() => handleMute(60)} className={`w-full py-4 rounded-2xl text-xs font-bold uppercase transition-colors ${darkMode ? 'bg-slate-800 text-white active:bg-slate-700' : 'bg-slate-100 text-slate-700 active:bg-slate-200'}`}>Silenciar 1 hora</button>
                                    <button onClick={() => handleMute(480)} className={`w-full py-4 rounded-2xl text-xs font-bold uppercase transition-colors ${darkMode ? 'bg-slate-800 text-white active:bg-slate-700' : 'bg-slate-100 text-slate-700 active:bg-slate-200'}`}>Silenciar 8 horas</button>
                                    <button onClick={() => handleMute(-1)} className={`w-full py-4 rounded-2xl text-xs font-bold uppercase transition-colors ${darkMode ? 'bg-slate-800 text-white active:bg-slate-700' : 'bg-slate-100 text-slate-700 active:bg-slate-200'}`}>Silenciar Siempre</button>
                                </>
                            )}
                            <div className={`h-px my-2 ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}></div>
                             <button onClick={handleToggleBlock} className={`w-full py-4 rounded-2xl text-xs font-bold uppercase transition-colors text-red-500 ${darkMode ? 'bg-red-500/10 active:bg-red-500/20' : 'bg-red-500/5 active:bg-red-500/10'}`}>
                                {selectedChatForOptions.isBlocked ? "Desbloquear Usuario" : "Bloquear Usuario"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Información de Seguridad */}
            {showSecurityInfo && (
                <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300 p-4">
                    <div className={`w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border ${darkMode ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'}`}>
                        {/* Header del Modal */}
                        <div className={`p-6 border-b shrink-0 flex items-center justify-between ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                </div>
                                <h3 className={`text-lg font-black uppercase leading-none ${darkMode ? 'text-white' : 'text-slate-900'}`}>Protocolo de Seguridad <span className="text-amber-500 block text-xs mt-1">ASMP v1.0</span></h3>
                            </div>
                            <button onClick={() => setShowSecurityInfo(false)} className={`p-2 rounded-full transition-colors ${darkMode ? 'bg-slate-800 text-slate-400 active:bg-slate-700' : 'bg-slate-100 text-slate-500 active:bg-slate-200'}`}>
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Contenido Scrollable */}
                        <div className="flex-1 overflow-y-auto custom-scroll p-6 space-y-6">
                            <section>
                                <h4 className={`text-xs font-black uppercase mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Cifrado de Extremo a Extremo (E2EE)</h4>
                                <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                    Tus conversaciones están protegidas por el <strong>ADJStudios Secure Mobile Protocol (ASMP)</strong>. Esto significa que los mensajes se cifran en tu dispositivo antes de salir y solo se descifran en el dispositivo del destinatario.
                                </p>
                            </section>

                            <div className={`h-px ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}></div>

                            <section>
                                <h4 className={`text-xs font-black uppercase mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Detalles Técnicos</h4>
                                <ul className={`space-y-3 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                    <li className="flex gap-3">
                                        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5"></span>
                                        <span>
                                            <strong>AES-GCM 256-bit:</strong> Utilizamos el estándar de cifrado avanzado (AES) en modo Galois/Counter Mode (GCM), que garantiza tanto la confidencialidad como la integridad de los datos.
                                        </span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5"></span>
                                        <span>
                                            <strong>Derivación de Claves (PBKDF2):</strong> Las llaves de cifrado no viajan por la red. Se generan matemáticamente en cada dispositivo (cliente) utilizando identificadores únicos de la sesión y una "salt" criptográfica, procesadas mediante 100,000 iteraciones del algoritmo SHA-256.
                                        </span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5"></span>
                                        <span>
                                            <strong>Vector de Inicialización (IV) Único:</strong> Cada mensaje individual tiene su propio código aleatorio de 12 bytes (IV), asegurando que incluso si envías el mismo texto dos veces, el código cifrado resultante será completamente diferente.
                                        </span>
                                    </li>
                                </ul>
                            </section>

                            <div className={`h-px ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}></div>

                            <section>
                                <h4 className={`text-xs font-black uppercase mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Privacidad y Servidores</h4>
                                <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                    Nuestros servidores (Google Cloud Firestore) actúan meramente como un canal de transporte ciego. Almacenan cadenas de texto aleatorias (ej: <code>7ilDfWoYmDx42...</code>) que son matemáticamente imposibles de leer sin las llaves que residen exclusivamente en los teléfonos de los participantes.
                                </p>
                                <div className={`mt-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-[10px] font-bold ${darkMode ? 'text-amber-500' : 'text-amber-700'}`}>
                                    NI LOS ADMINISTRADORES DE ADJSTUDIOS, NI GOOGLE, NI TERCEROS PUEDEN LEER TUS MENSAJES PRIVADOS.
                                </div>
                            </section>
                        </div>

                        {/* Footer */}
                        <div className={`p-4 border-t ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-slate-50'}`}>
                            <button 
                                onClick={() => setShowSecurityInfo(false)}
                                className={`w-full py-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all ${darkMode ? 'bg-white text-black' : 'bg-slate-900 text-white'}`}
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatListView;