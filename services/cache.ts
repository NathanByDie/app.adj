import { openDB, DBSchema } from 'idb';
import { DirectMessage } from '../types';

const DB_NAME = 'adjstudios-db';
const DB_VERSION = 1;
const STORE_NAME = 'direct-messages';

interface AdjStudiosDB extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: DirectMessage & { chatId: string };
    indexes: { chatId: string };
  };
}

const dbPromise = openDB<AdjStudiosDB>(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('chatId', 'chatId');
    }
  },
});

export const saveMessagesToCache = async (chatId: string, messages: DirectMessage[]): Promise<void> => {
  const db = await dbPromise;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  // Primero, borramos los mensajes viejos de este chat para evitar duplicados
  const oldMessages = await store.index('chatId').getAllKeys(chatId);
  await Promise.all(oldMessages.map(key => store.delete(key)));

  // Luego, añadimos los nuevos
  await Promise.all(messages.map(msg => store.put({ ...msg, chatId })));
  
  await tx.done;
};

export const getMessagesFromCache = async (chatId: string): Promise<DirectMessage[]> => {
  const db = await dbPromise;
  const messages = await db.getAllFromIndex(STORE_NAME, 'chatId', chatId);

  // IndexedDB no garantiza el orden al consultar por índice, así que re-ordenamos
  return messages.sort((a, b) => {
    const timeA = a.timestamp?.seconds || 0;
    const timeB = b.timestamp?.seconds || 0;
    return timeA - timeB;
  });
};
