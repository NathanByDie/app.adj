
import { openDB, DBSchema } from 'idb';
import { DirectMessage } from '../types';

const DB_NAME = 'adjstudios-db';
const DB_VERSION = 2;
const MESSAGES_STORE = 'direct-messages';
const MEDIA_STORE = 'media-cache';

interface MediaCache {
  url: string;
  blob: Blob;
  timestamp: number;
}

interface AdjStudiosDB extends DBSchema {
  [MESSAGES_STORE]: {
    key: string;
    value: DirectMessage & { chatId: string };
    indexes: { chatId: string };
  };
  [MEDIA_STORE]: {
    key: string; // The remote URL
    value: MediaCache;
  };
}

const dbPromise = openDB<AdjStudiosDB>(DB_NAME, DB_VERSION, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
        const store = db.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
        store.createIndex('chatId', 'chatId');
      }
    }
    if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(MEDIA_STORE)) {
            db.createObjectStore(MEDIA_STORE, { keyPath: 'url' });
        }
    }
  },
});

export const saveMessagesToCache = async (chatId: string, messages: DirectMessage[]): Promise<void> => {
  const db = await dbPromise;
  const tx = db.transaction(MESSAGES_STORE, 'readwrite');
  const store = tx.objectStore(MESSAGES_STORE);

  // Primero, borramos los mensajes viejos de este chat para evitar duplicados
  const oldMessages = await store.index('chatId').getAllKeys(chatId);
  await Promise.all(oldMessages.map(key => store.delete(key)));

  // Luego, añadimos los nuevos
  await Promise.all(messages.map(msg => store.put({ ...msg, chatId })));
  
  await tx.done;
};

export const getMessagesFromCache = async (chatId: string): Promise<DirectMessage[]> => {
  const db = await dbPromise;
  const messages = await db.getAllFromIndex(MESSAGES_STORE, 'chatId', chatId);

  // IndexedDB no garantiza el orden al consultar por índice, así que re-ordenamos
  return messages.sort((a, b) => {
    const timeA = a.timestamp?.seconds || 0;
    const timeB = b.timestamp?.seconds || 0;
    return timeA - timeB;
  });
};

export const getMediaFromCache = async (url: string): Promise<Blob | null> => {
    if (!url) return null;
    const db = await dbPromise;
    const item = await db.get(MEDIA_STORE, url);
    return item?.blob || null;
};

export const saveMediaToCache = async (url: string, blob: Blob): Promise<void> => {
    if (!url || !blob) return;
    const db = await dbPromise;
    await db.put(MEDIA_STORE, {
        url,
        blob,
        timestamp: Date.now(),
    });
};