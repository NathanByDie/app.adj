
export enum LiturgicalTime {
  ADVIENTO = 'Adviento',
  NAVIDAD = 'Navidad',
  CUARESMA = 'Cuaresma',
  PASCUA = 'Pascua',
  ORDINARIO = 'Tiempo Ordinario',
  ANIMACION = 'Animación',
  MEDITACION = 'Meditación',
  PURISIMA = 'Purísima',
  VIRGEN = 'Cantos de la Virgen'
}

export type UserRole = 'admin' | 'member';

export interface Song {
  id: string;
  title: string;
  key: string;
  category: string; // Changed from LiturgicalTime to string for dynamic categories
  content: string; // The full text including chord lines
  author: string;
  createdAt: number;
}

export interface ChatMessage {
  sender: string;
  text: string;
  timestamp: number;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: any;
  read: boolean;
  deleted?: boolean;
  pinned?: boolean;
  reactions?: { [emoji: string]: string[] }; // user IDs who reacted
  deletedBy?: { [userId: string]: boolean };
  replyTo?: {
    messageId: string;
    senderId: string;
    senderUsername: string;
    textSnippet: string;
  };
}

export interface Room {
  id: string;
  code: string;
  host: string;
  repertoire: string[]; // Song IDs
  currentSongId?: string; // ID de la canción que el host está viendo
  participants: string[]; // Nombres de usuarios conectados
  banned?: string[]; // Nombres de usuarios expulsados que no pueden reingresar
  globalTranspositions?: Record<string, number>;
  chat?: ChatMessage[];
  createdAt?: number;
  expiresAt?: number;
}

export interface User {
  id: string;
  username: string;
  username_lowercase: string;
  email: string;
  role: UserRole;
  isAuthenticated: boolean;
  createdAt?: string;
  hasPasswordProvider?: boolean;
  hasGoogleProvider?: boolean;
  biography?: string;
  favorites?: string[];
}

export interface ChatInfo {
    partnerUsername: string;
    lastMessageText?: string;
    lastMessageTimestamp?: any;
    unreadCount?: number;
    partnerId: string;
    lastMessageSenderId?: string;
    mutedUntil?: number; // Timestamp until which the chat is muted
    isBlocked?: boolean; // Whether the user blocked this chat
    isReply?: boolean;
}