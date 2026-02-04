import React, { useEffect, useRef } from 'react';
import { User as AppUser, ChatInfo, DirectMessage } from '../types';
import { Firestore, collection, query, orderBy, onSnapshot, doc, setDoc, increment, limit, Unsubscribe, updateDoc, getDoc } from 'firebase/firestore';
import { triggerHapticFeedback } from '../services/haptics';

interface ChatSyncManagerProps {
    currentUser: AppUser;
    db: Firestore;
}

const generateChatId = (uid1: string, uid2: string): string => {
    return [uid1, uid2].sort().join('_');
};

const ChatSyncManager: React.FC<ChatSyncManagerProps> = ({ currentUser, db }) => {
    // Ref to hold a map of partnerId -> unsubscribe function for message listeners
    const messageListeners = useRef(new Map<string, Unsubscribe>());

    useEffect(() => {
        if (!currentUser?.id) {
            return;
        }

        // 1. Main listener for the user's list of chats
        const userChatsQuery = query(collection(db, 'user_chats', currentUser.id, 'chats'));
        
        const unsubscribeUserChats = onSnapshot(userChatsQuery, (snapshot) => {
            const currentPartnerIds = new Set<string>();

            snapshot.docs.forEach(docSnap => {
                const data = docSnap.data();
                
                let realPartnerId = data.partnerId;

                if (!realPartnerId) {
                    const docId = docSnap.id;
                    const parts = docId.split('_');
                    
                    if (parts.length === 2) {
                        if (parts[0] === currentUser.id) {
                            realPartnerId = parts[1];
                        } else if (parts[1] === currentUser.id) {
                            realPartnerId = parts[0];
                        }
                    } 
                    
                    if (!realPartnerId && docId !== currentUser.id) {
                        realPartnerId = docId;
                    }
                }
                
                if (!realPartnerId) return;

                const chatInfo = { ...data, partnerId: realPartnerId } as ChatInfo;
                
                currentPartnerIds.add(chatInfo.partnerId);

                if (!messageListeners.current.has(chatInfo.partnerId)) {
                    const chatId = generateChatId(currentUser.id, chatInfo.partnerId);
                    const messagesQuery = query(
                        collection(db, 'chats', chatId, 'messages'),
                        orderBy('timestamp', 'desc'),
                        limit(1)
                    );

                    const unsubscribeMessages = onSnapshot(messagesQuery, async (msgSnapshot) => {
                        if (msgSnapshot.empty) return;

                        const latestMessage = msgSnapshot.docs[0].data() as DirectMessage;
                        
                        const myChatInfoRef = doc(db, 'user_chats', currentUser.id, 'chats', chatId);
                        
                        try {
                            const myChatInfoSnap = await getDoc(myChatInfoRef);
                            const currentData = myChatInfoSnap.exists() ? myChatInfoSnap.data() : {};
                            
                            const latestMessageTimestamp = latestMessage.timestamp;
                            const chatInfoTimestamp = currentData.lastMessageTimestamp;

                            let shouldUpdate = false;
                            let isNewMessage = false;
                            let performWrite = false;
                            
                            if (!chatInfoTimestamp || (latestMessageTimestamp?.seconds > chatInfoTimestamp?.seconds)) {
                                shouldUpdate = true;
                                isNewMessage = true;
                            } else if (latestMessageTimestamp?.seconds === chatInfoTimestamp?.seconds) {
                                shouldUpdate = true; 
                            }

                            const updates: any = { partnerId: realPartnerId };

                            try {
                                const partnerUserDoc = await getDoc(doc(db, 'users', realPartnerId));
                                if (partnerUserDoc.exists()) {
                                    const pData = partnerUserDoc.data();
                                    
                                    const isProfileValidated = pData.profileValidated === true;
                                    updates.partnerValidated = isProfileValidated;
                                    if (currentData.partnerValidated !== isProfileValidated) performWrite = true;

                                    if (pData.username && pData.username !== currentData.partnerUsername) {
                                        updates.partnerUsername = pData.username;
                                        performWrite = true;
                                    }
                                    
                                    if (pData.photoURL !== currentData.partnerPhotoURL) {
                                        updates.partnerPhotoURL = pData.photoURL || null;
                                        performWrite = true;
                                    }
                                }
                            } catch (e) {
                                // Silent failure
                            }

                            if (shouldUpdate) {
                                let previewText = '';
                                if (latestMessage.deleted) {
                                    previewText = 'Mensaje eliminado';
                                } else {
                                    previewText = latestMessage.text || '';
                                    if (!previewText) {
                                        if (latestMessage.type === 'image') previewText = '📷 Imagen';
                                        else if (latestMessage.type === 'audio') previewText = '🎤 Audio';
                                        else if (latestMessage.type === 'file') previewText = `📄 ${latestMessage.fileName || 'Archivo'}`;
                                        else previewText = 'Mensaje';
                                    }
                                }
                                
                                updates.lastMessageText = previewText;
                                updates.lastMessageTimestamp = latestMessage.timestamp;
                                updates.lastMessageSenderId = latestMessage.senderId;

                                if (currentData.lastMessageText !== updates.lastMessageText ||
                                    currentData.lastMessageTimestamp?.seconds !== updates.lastMessageTimestamp?.seconds) {
                                    performWrite = true;
                                }

                                // If it's a new message for me, trigger haptic feedback.
                                // The Cloud Function is now responsible for incrementing the unread count.
                                if (latestMessage.senderId !== currentUser.id && isNewMessage) {
                                    triggerHapticFeedback('notification');
                                }
                            }

                            if (performWrite) {
                                await setDoc(myChatInfoRef, updates, { merge: true });
                            }
                        } catch (err) {
                             console.error(`Failed to get doc for sync check on chat ${chatId}:`, err);
                        }
                    }, (error) => {
                        console.warn(`Permission denied syncing messages for chat ${chatId}. Ignoring.`, error);
                    });
                    
                    messageListeners.current.set(chatInfo.partnerId, unsubscribeMessages);
                }
            });

            // 3. Clean up listeners for chats that no longer exist
            messageListeners.current.forEach((unsubscribe, partnerId) => {
                if (!currentPartnerIds.has(partnerId)) {
                    unsubscribe();
                    messageListeners.current.delete(partnerId);
                }
            });
        }, (error) => {
            console.error("Error in ChatSyncManager listener for user_chats:", error);
        });

        // Cleanup on component unmount
        return () => {
            unsubscribeUserChats();
            messageListeners.current.forEach(unsubscribe => unsubscribe());
            messageListeners.current.clear();
        };
    }, [currentUser?.id, db]);

    return null; // This is a background component
};

export default ChatSyncManager;
