import React, { useEffect, useRef } from 'react';
import { User as AppUser, ChatInfo, DirectMessage } from '../types';
import { Firestore, collection, query, orderBy, onSnapshot, doc, setDoc, increment, limit, Unsubscribe, updateDoc, getDoc } from 'firebase/firestore';

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
                
                // --- CRITICAL FIX START ---
                // Robust logic to determine who the chat partner is.
                // 1. Prefer explicit 'partnerId' field.
                let realPartnerId = data.partnerId;

                // 2. If missing, parse the document ID (which is usually the chatId: uidA_uidB)
                if (!realPartnerId) {
                    const docId = docSnap.id;
                    const parts = docId.split('_');
                    
                    if (parts.length === 2) {
                        // Standard case: "myId_partnerId" or "partnerId_myId"
                        // We strictly look for the part that is NOT the current user.
                        if (parts[0] === currentUser.id) {
                            realPartnerId = parts[1];
                        } else if (parts[1] === currentUser.id) {
                            realPartnerId = parts[0];
                        }
                    } 
                    
                    // Edge case: If the ID format is weird or it's a legacy ID that is just the partnerId
                    if (!realPartnerId && docId !== currentUser.id) {
                        realPartnerId = docId;
                    }
                }
                // --- CRITICAL FIX END ---

                // If we still can't identify a partner, skip this doc to prevent errors
                if (!realPartnerId) return;

                const chatInfo = { ...data, partnerId: realPartnerId } as ChatInfo;
                
                currentPartnerIds.add(chatInfo.partnerId);

                // 2. If we don't have a listener for this chat, create one
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
                        
                        // Sync logic: update preview if local version is outdated
                        // We check timestamp logic inside to avoid infinite loops if we are the sender
                        
                        // The document ID in 'user_chats' collection IS usually the chatId
                        const myChatInfoRef = doc(db, 'user_chats', currentUser.id, 'chats', chatId);
                        
                        try {
                            const myChatInfoSnap = await getDoc(myChatInfoRef);
                            
                            // If doc doesn't exist, create it (restores deleted chat references when new msg arrives)
                            // or update if exists.
                            const currentData = myChatInfoSnap.exists() ? myChatInfoSnap.data() : {};
                            
                            const latestMessageTimestamp = latestMessage.timestamp;
                            const chatInfoTimestamp = currentData.lastMessageTimestamp;

                            // Timestamp check logic
                            let shouldUpdate = false;
                            
                            if (!chatInfoTimestamp) {
                                shouldUpdate = true;
                            } else if (latestMessageTimestamp?.seconds && chatInfoTimestamp?.seconds) {
                                if (latestMessageTimestamp.seconds > chatInfoTimestamp.seconds) {
                                    shouldUpdate = true;
                                }
                            }

                            if (shouldUpdate) {
                                let previewText = latestMessage.text || '';
                                if (!previewText) {
                                    if (latestMessage.type === 'image') previewText = '📷 Imagen';
                                    else if (latestMessage.type === 'audio') previewText = '🎤 Audio';
                                    else if (latestMessage.type === 'file') previewText = `📄 ${latestMessage.fileName || 'Archivo'}`;
                                    else previewText = 'Mensaje';
                                }
                                
                                const updates: any = {
                                    lastMessageText: previewText,
                                    lastMessageTimestamp: latestMessage.timestamp,
                                    lastMessageSenderId: latestMessage.senderId,
                                    // Ensure partner info is preserved/restored if missing
                                    partnerId: realPartnerId 
                                };

                                // Check validation status for the partner
                                try {
                                    const partnerUserDoc = await getDoc(doc(db, 'users', realPartnerId));
                                    if (partnerUserDoc.exists()) {
                                        const isProfileValidated = partnerUserDoc.data().profileValidated === true;
                                        updates.partnerValidated = isProfileValidated;
                                    }
                                } catch (e) {
                                    // Silent failure for profile fetch
                                }

                                // Only increment unread if I am NOT the sender
                                if (latestMessage.senderId !== currentUser.id) {
                                    updates.unreadCount = increment(1);
                                }

                                await setDoc(myChatInfoRef, updates, { merge: true });
                            }
                        } catch (err) {
                             console.error(`Failed to get doc for sync check on chat ${chatId}:`, err);
                        }
                    }, (error) => {
                        // Gracefully handle permission denied errors for specific chats
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