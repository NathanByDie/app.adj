
export enum LiturgicalTime {
  ADVIENTO = 'Adviento',
  NAVIDAD = 'Navidad',
  CUARESMA = 'Cuaresma',
  PASCUA = 'Pascua',
  ORDINARIO = 'Tiempo Ordinario',
  ANIMACION = 'Animación',
  MEDITACION = 'Meditación',
  PURISIMA = 'Purísima'
}

export type UserRole = 'admin' | 'member';

export interface Song {
  id: string;
  title: string;
  key: string;
  category: LiturgicalTime;
  content: string; // The full text including chord lines
  author: string;
  createdAt: number;
}

export interface ChatMessage {
  sender: string;
  text: string;
  timestamp: number;
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
}