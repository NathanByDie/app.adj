import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  GoogleAuthProvider,
  signInWithPopup,
  linkWithPopup,
  signInWithCredential,
  reauthenticateWithPopup,
  deleteUser
} from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  where,
  getDocs,
  orderBy,
  limit,
  setDoc,
  getDoc,
  arrayUnion,
  arrayRemove,
  writeBatch,
  deleteField,
  Unsubscribe
} from "firebase/firestore";
import { getDatabase, ref, onValue, set, onDisconnect, serverTimestamp, update as updateRtdb, remove as removeRtdb } from "firebase/database";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

import { User as AppUser, Song, LiturgicalTime, Room, UserRole, ChatInfo } from './types';
import { PlusIcon, UsersIcon } from './constants';
import SongForm from './components/SongForm';
import SongViewer from './components/SongViewer';
import RoomView from './components/RoomView';
import ChatListView from './components/ChatListView';
import DirectMessageView from './components/DirectMessageView';
import UserProfileView from './components/UserProfileView';
import ChatSyncManager from './components/ChatSyncManager';
import { triggerHapticFeedback } from './services/haptics';
import useCachedMedia from './hooks/useCachedMedia';
import { AudioPlayerProvider } from './contexts/AudioPlayerContext';
import { initializePushNotifications } from './services/notifications';

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyCDmkiclfBD3qP8K7ILakcl_JwJiiZXSBI",
  authDomain: "adjstudios.firebaseapp.com",
  databaseURL: "https://adjstudios-default-rtdb.firebaseio.com",
  projectId: "adjstudios",
  storageBucket: "adjstudios.firebasestorage.app",
  messagingSenderId: "85914193622",
  appId: "1:85914193622:web:a52f2a32877f0d321e0377",
  measurementId: "G-BN1E0ZEHX4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);
const storage = getStorage(app);

setPersistence(auth, browserLocalPersistence).catch(err => console.error("Error de persistencia:", err));

type AppView = 'feed' | 'favorites' | 'chat' | 'room' | 'settings';
const VIEW_ORDER: AppView[] = ['feed', 'favorites', 'chat', 'room', 'settings'];
type AnimationDirection = 'left' | 'right' | 'fade';
type Theme = 'light' | 'dark' | 'system';

const SUPER_ADMIN_EMAIL = 'biden.inf@gmail.com';
const APP_ICON_URI = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512' viewBox='0 0 512 512'><defs><linearGradient id='gold' x1='0' y1='0' x2='0' y2='1'><stop offset='0%25' stop-color='%23FFE89A'/><stop offset='50%25' stop-color='%23E2B84A'/><stop offset='100%25' stop-color='%23B8901E'/></linearGradient><radialGradient id='halo' cx='50%25' cy='45%25' r='45%25'><stop offset='0%25' stop-color='%23FFD966' stop-opacity='0.9'/><stop offset='60%25' stop-color='%23FFD966' stop-opacity='0.3'/><stop offset='100%25' stop-color='%23FFD966' stop-opacity='0'/></radialGradient><linearGradient id='pages' x1='0' y1='0' x2='0' y2='1'><stop offset='0%25' stop-color='%23FFFFFF'/><stop offset='100%25' stop-color='%23EFEFEF'/></linearGradient><linearGradient id='edge' x1='0' y1='0' x2='0' y2='1'><stop offset='0%25' stop-color='%231F6B3F'/><stop offset='100%25' stop-color='%230B3D25'/></linearGradient></defs><circle cx='256' cy='150' r='110' fill='url(%23halo)'/><path fill='url(%23gold)' d='M242 55 H270 V118 H328 V146 H270 V245 H242 V146 H184 V118 H242 Z'/><path fill='url(%23edge)' d='M60 260 C150 210, 240 215, 256 240 C272 215, 362 210, 452 260 V350 C362 310, 272 315, 256 340 C240 315, 150 310, 60 350 Z'/><path fill='url(%23pages)' d='M78 268 C150 230, 225 235, 252 258 V330 C225 315, 150 315, 78 338 Z'/><path fill='url(%23pages)' d='M434 268 C362 230, 287 235, 260 258 V330 C287 315, 362 315, 434 338 Z'/><g stroke='%233E8C5A' stroke-width='3' fill='none'><path d='M110 295 C160 275, 205 278, 235 292'/><path d='M110 315 C160 295, 205 298, 235 312'/><path d='M402 295 C352 275, 307 278, 277 292'/><path d='M402 315 C352 295, 307 298, 277 312'/></g><path d='M256 258 V338' stroke='%230B3D25' stroke-width='6'/><path fill='url(%23gold)' d='M246 338 L256 355 L266 338 Z'/></svg>";

const LoadingSpinner = () => (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-50/50 dark:bg-black/50 backdrop-blur-sm z-50">
        <div className="w-10 h-10 border-4 border-misionero-azul/30 border-t-misionero-azul rounded-full animate-spin"></div>
    </div>
);


const LogoutIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

const EyeIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-5 h-5"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542 7z" />
    </svg>
);

const EyeOffIcon = ({ className }: { className?: string }) => (
    <svg className={className || "w-5 h-5"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
    </svg>
);

const getLiturgicalColorClass = (category: string) => {
  const map: Record<string, string> = {
    [LiturgicalTime.ADVIENTO]: 'text-misionero-azul',
    [LiturgicalTime.NAVIDAD]: 'text-misionero-amarillo',
    [LiturgicalTime.CUARESMA]: 'text-misionero-rojo',
    [LiturgicalTime.PASCUA]: 'text-misionero-amarillo',
    [LiturgicalTime.ORDINARIO]: 'text-misionero-verde',
    [LiturgicalTime.ANIMACION]: 'text-misionero-amarillo',
    [LiturgicalTime.MEDITACION]: 'text-misionero-azul',
    [LiturgicalTime.PURISIMA]: 'text-misionero-azul',
    [LiturgicalTime.VIRGEN]: 'text-misionero-azul',
  };
  return map[category] || 'text-slate-400';
};

const translateAuthError = (errorCode: string): string => {
  switch (errorCode) {
    case 'auth/invalid-email': return 'El formato del correo electrónico no es válido.';
    case 'auth/user-not-found': return 'No se encontró ninguna cuenta con este correo.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'La contraseña es incorrecta.';
    case 'auth/email-already-in-use': return 'Este correo ya está registrado por otra persona.';
    case 'auth/weak-password': return 'La contraseña es muy débil (mínimo 6 caracteres).';
    case 'auth/too-many-requests': return 'Muchos intentos fallidos. Espera unos minutos.';
    case 'auth/network-request-failed': return 'Error de conexión. Verifica tu internet.';
    case 'auth/internal-error': return 'Error interno del servidor. Intenta de nuevo.';
    case 'auth/popup-closed-by-user': return 'La ventana de inicio de sesión fue cerrada.';
    case 'auth/account-exists-with-different-credential': return 'Ya existe una cuenta con este email. Inicia sesión con el método original.';
    case 'auth/operation-not-allowed': return 'El registro con correo y contraseña no está habilitado en Firebase.';
    case 'permission-denied': return 'Permiso denegado: Verifica las reglas de Firestore.';
    case 'auth/credential-already-in-use': return 'Esta cuenta de Google ya está vinculada a otro usuario.';
    case 'auth/unauthorized-domain': {
        const hostname = window.location.hostname;
        const origin = window.location.origin;
        if (!hostname || hostname === '') {
            return `Dominio desconocido (vacío). Probablemente estás ejecutando el archivo localmente (file://) o en un entorno restringido. Google Auth requiere un dominio web válido (http/https). Intenta servir la app en localhost.`;
        }
        return `Dominio NO AUTORIZADO: "${hostname}". Debes agregar este dominio exacto en Firebase Console -> Authentication -> Settings -> Authorized Domains.`;
    }
    default: return `Ocurrió un error inesperado (${errorCode}). Inténtalo más tarde.`;
  }
};

const translatePasswordChangeError = (errorCode: string): string => {
  switch (errorCode) {
    case 'auth/wrong-password': return 'La contraseña actual es incorrecta.';
    case 'auth/weak-password': return 'La nueva contraseña es demasiado débil.';
    case 'auth/requires-recent-login': return 'Requiere inicio de sesión reciente.';
    default: return 'Error al cambiar la contraseña.';
  }
};

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path>
    <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path>
    <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.222,0-9.657-3.356-11.303-7.918l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path>
    <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.574l6.19,5.238C39.986,36.639,44,31.023,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
  </svg>
);

const NavBar = ({ view, navigateTo, darkMode, totalUnreadCount }: any) => {
  const navItems = [
    { id: 'feed', label: 'Repertorio', activeClass: 'text-misionero-azul', activeBg: 'bg-misionero-azul/10', icon: (active: boolean) => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 22V12h6v10" /></svg> },
    { id: 'favorites', label: 'Favoritos', activeClass: 'text-misionero-rojo', activeBg: 'bg-misionero-rojo/10', icon: (active: boolean) => <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg> },
    { id: 'chat', label: 'Chat', activeClass: 'text-misionero-amarillo', activeBg: 'bg-misionero-amarillo/10', icon: (active: boolean) => (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
    )},
    { id: 'room', label: 'Sala', activeClass: 'text-misionero-verde', activeBg: 'bg-misionero-verde/10', icon: (active: boolean) => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg> },
    { id: 'settings', label: 'Ajustes', activeClass: 'text-misionero-amarillo', activeBg: 'bg-misionero-amarillo/10', icon: (active: boolean) => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.5 : 2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6h9m-9 6h9m-9 6h9M6 6h.01M6 12h.01M6 18h.01" /></svg> }
  ];

  const handleNav = (id: string) => {
      triggerHapticFeedback('light');
      navigateTo(id);
  };

  return (
    <>
      {/* Mobile Bottom Bar */}
      <div className={`md:hidden fixed bottom-0 left-0 right-0 ${darkMode ? 'bg-black/90 border-slate-800' : 'bg-white/90 border-slate-200'} backdrop-blur-lg border-t pb-[env(safe-area-inset-bottom)] z-40 transition-colors duration-500`}>
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const isActive = view === item.id;
            return (
              <button 
                key={item.id} 
                onClick={() => handleNav(item.id)} 
                className={`flex flex-col items-center justify-center h-full gap-1 active:scale-90 transition-all duration-300 px-4 ${isActive ? item.activeClass : 'text-slate-400'}`}
              >
                <div className={`relative p-2 rounded-full transition-all duration-300 ${isActive ? (darkMode ? 'bg-slate-800' : item.activeBg) : 'bg-transparent'}`}>
                  {item.icon(isActive)}
                  {item.id === 'chat' && totalUnreadCount > 0 && (
                     <div className="absolute -top-1 -right-1 w-4 h-4 bg-misionero-rojo rounded-full flex items-center justify-center text-white text-[8px] font-black animate-in zoom-in-75">
                         {totalUnreadCount > 9 ? '9+' : totalUnreadCount}
                     </div>
                  )}
                </div>
                <span className={`text-[9px] font-black uppercase transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-0 scale-0'}`}>{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className={`hidden md:flex fixed left-0 top-0 bottom-0 w-20 flex-col items-center py-8 z-50 border-r ${darkMode ? 'bg-black border-slate-800' : 'bg-white border-slate-200'} transition-colors duration-500`}>
         <img 
            src={APP_ICON_URI} 
            alt="ADJStudios Logo" 
            className="w-12 h-12 rounded-2xl shadow-lg mb-8" 
         />
         <div className="flex flex-col gap-6 w-full px-2">
            {navItems.map((item) => {
                const isActive = view === item.id;
                return (
                  <button 
                    key={item.id} 
                    onClick={() => handleNav(item.id)} 
                    className={`relative flex flex-col items-center justify-center p-3 rounded-2xl transition-all hover:bg-slate-100 dark:hover:bg-slate-800 ${isActive ? `${item.activeBg} ${item.activeClass}` : 'text-slate-400'}`}
                    title={item.label}
                  >
                    {item.icon(isActive)}
                     {item.id === 'chat' && totalUnreadCount > 0 && (
                       <div className="absolute top-1 right-1 w-4 h-4 bg-misionero-rojo rounded-full flex items-center justify-center text-white text-[8px] font-black animate-in zoom-in-75">
                           {totalUnreadCount > 9 ? '9+' : totalUnreadCount}
                       </div>
                    )}
                  </button>
                )
            })}
         </div>
      </div>
    </>
  );
};

const LoginView = ({ handleAuthSubmit, authData, setAuthData, authMode, setAuthMode, authMsg, isAuthenticating, showPassword, setShowPassword, setAuthMsg, handleGoogleSignIn }: any) => (
  <div className="fixed inset-0 login-background flex flex-col items-center justify-start pt-20 p-4 text-white font-sans overflow-y-auto">
    <div className="w-full max-w-sm space-y-8 text-center relative z-10">
      <h1 className="text-4xl font-black tracking-tighter uppercase italic leading-tight login-text-shadow">Amiguitos de Jesus<br/><span className="text-3xl font-semibold tracking-widest">Studios</span></h1>
      <form onSubmit={handleAuthSubmit} className="space-y-3">
        {authMode === 'register' && <input type="text" placeholder="Usuario" className="w-full glass-ui rounded-2xl px-4 py-3.5 text-sm font-bold text-white outline-none placeholder:text-white/40" required value={authData.user} onChange={(e: any) => setAuthData({...authData, user: e.target.value})} />}
        <input type="email" placeholder="Correo" className="w-full glass-ui rounded-2xl px-4 py-3.5 text-sm font-bold text-white outline-none placeholder:text-white/40" required value={authData.email} onChange={(e: any) => setAuthData({...authData, email: e.target.value})} />
        
        {authMode !== 'forgot' && (
          <div className="relative w-full">
            <input 
              type={showPassword ? 'text' : 'password'} 
              placeholder="Contraseña" 
              className="w-full glass-ui rounded-2xl px-4 py-3.5 text-sm font-bold text-white outline-none placeholder:text-white/40" 
              required 
              value={authData.pass} 
              onChange={(e: any) => setAuthData({...authData, pass: e.target.value})} 
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center pr-4 text-white/50">
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        )}

        {authMode === 'register' && (
          <div className="relative w-full">
            <input 
              type={showPassword ? 'text' : 'password'} 
              placeholder="Confirmar" 
              className="w-full glass-ui rounded-2xl px-4 py-3.5 text-sm font-bold text-white outline-none placeholder:text-white/40" 
              required 
              value={authData.confirmPass} 
              onChange={(e: any) => setAuthData({...authData, confirmPass: e.target.value})} 
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center pr-4 text-white/50">
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        )}

        <button type="submit" disabled={isAuthenticating} className="w-full glass-ui glass-interactive bg-misionero-verde/50 text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-widest active:scale-95 transition-all">
          {authMode === 'login' ? 'Entrar' : authMode === 'register' ? 'Registrar' : 'Recuperar'}
        </button>
      </form>

      <div className="relative flex py-2 items-center">
        <div className="flex-grow border-t border-white/20"></div>
        <span className="flex-shrink mx-4 text-white/50 text-[9px] font-bold uppercase">O</span>
        <div className="flex-grow border-t border-white/20"></div>
      </div>

      <button 
        type="button" 
        onClick={handleGoogleSignIn} 
        disabled={isAuthenticating}
        className="w-full glass-ui glass-interactive bg-white/20 flex items-center justify-center gap-3 text-white font-black py-3 rounded-2xl uppercase text-[10px] tracking-widest active:scale-95 transition-all"
      >
        <GoogleIcon />
        Continuar con Google
      </button>

      <div className="flex flex-col gap-4 mt-2">
        <button onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthMsg(null); }} className="text-[10px] font-bold text-white uppercase text-center login-text-shadow">{authMode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Entra'}</button>
        {authMode === 'login' && <button onClick={() => { setAuthMode('forgot'); setAuthMsg(null); }} className="text-[9px] font-bold text-white/60 uppercase text-center underline login-text-shadow">Olvidé mi contraseña</button>}
      </div>
      {authMsg && <div className={`mt-4 p-3 rounded-xl text-[10px] font-bold text-center ${authMsg.type === 'error' ? 'text-red-300' : 'text-green-300'}`}>{authMsg.text}</div>}
    </div>

    {/* PANEL DE CARGA DE LOGIN */}
    {isAuthenticating && (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
         <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4 shadow-lg"></div>
         <p className="text-xs font-black uppercase tracking-[0.2em] text-white animate-pulse text-shadow-lg">
           {authMode === 'login' ? 'Iniciando Sesión...' : authMode === 'register' ? 'Creando Cuenta...' : 'Procesando...'}
         </p>
      </div>
    )}
  </div>
);

// --- VISTAS INDIVIDUALES ---
const FeedView = ({ songs, favorites, openSongViewer, toggleFavorite, darkMode }: any) => (
    <div className="w-full h-full overflow-y-auto custom-scroll px-4 pt-4 pb-48 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start auto-rows-max">
       {songs.map((song: Song, index: number) => (
          <div 
            key={song.id} 
            className="relative glass-ui rounded-[1.8rem] overflow-hidden active:scale-[0.98] transition-all animate-stagger-in h-fit"
            style={{ animationDelay: `${index * 30}ms` }}
            onClick={() => openSongViewer(song)}
          >
            {song.source === 'lacuerda' && (
              <span className="absolute top-3 left-3 z-20 text-[7px] font-black text-orange-500 bg-orange-500/10 px-2 py-1 rounded-full border border-orange-500/20">LaCuerda.net</span>
            )}
            <button onClick={(e) => toggleFavorite(e, song.id)} className={`absolute top-3 right-3 z-20 p-2 transition-colors ${favorites.includes(song.id) ? 'text-misionero-rojo' : `${darkMode ? 'text-white/30 hover:text-white/60' : 'text-black/20 hover:text-black/50'}`}`}>
              <svg className="w-5 h-5" fill={favorites.includes(song.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
            </button>
            <div className={`p-4 ${song.source === 'lacuerda' ? 'pt-8' : ''}`}>
              <p className={`text-[7px] font-black uppercase mb-1 ${getLiturgicalColorClass(song.category)}`}>{song.category}</p>
              <h4 className={`font-black text-sm uppercase truncate pr-8 ${darkMode ? 'text-white' : 'text-slate-800'}`}>{song.title}</h4>
              <p className={`text-[9px] font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tono: <span className={`${darkMode ? 'text-misionero-rojo/80' : 'text-misionero-rojo'}`}>{song.key}</span> • Por: {song.author}</p>
            </div>
          </div>
       ))}
    </div>
);

const FavoritesView = ({ songs, favorites, openSongViewer, toggleFavorite, darkMode }: any) => (
    <div className="w-full h-full overflow-y-auto custom-scroll px-4 pt-4 pb-48 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start auto-rows-max">
       {songs.length === 0 ? (
         <div className="flex flex-col items-center justify-center h-full opacity-20 md:col-span-2 lg:col-span-3 xl:col-span-4"><p className="text-[10px] font-black uppercase">Sin favoritos</p></div>
       ) : songs.map((song: Song, index: number) => (
          <div 
            key={song.id} 
            className="relative glass-ui rounded-[1.8rem] overflow-hidden active:scale-[0.98] transition-all animate-stagger-in h-fit"
            style={{ animationDelay: `${index * 30}ms` }}
            onClick={() => openSongViewer(song)}
          >
            {song.source === 'lacuerda' && (
              <span className="absolute top-3 left-3 z-20 text-[7px] font-black text-orange-500 bg-orange-500/10 px-2 py-1 rounded-full border border-orange-500/20">LaCuerda.net</span>
            )}
            <button onClick={(e) => toggleFavorite(e, song.id)} className={`absolute top-3 right-3 z-20 p-2 transition-colors ${favorites.includes(song.id) ? 'text-misionero-rojo' : `${darkMode ? 'text-white/30 hover:text-white/60' : 'text-black/20 hover:text-black/50'}`}`}>
              <svg className="w-5 h-5" fill={favorites.includes(song.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
            </button>
            <div className={`p-4 ${song.source === 'lacuerda' ? 'pt-8' : ''}`}>
               <p className={`text-[7px] font-black uppercase mb-1 ${getLiturgicalColorClass(song.category)}`}>{song.category}</p>
              <h4 className={`font-black text-sm uppercase truncate pr-8 ${darkMode ? 'text-white' : 'text-slate-800'}`}>{song.title}</h4>
               <p className={`text-[9px] font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tono: <span className={`${darkMode ? 'text-misionero-rojo/80' : 'text-misionero-rojo'}`}>{song.key}</span> • Por: {song.author}</p>
            </div>
          </div>
       ))}
    </div>
);

const RoomLobbyView = ({ roomCodeInput, setRoomCodeInput, handleJoinRoom, handleCreateRoom, isAdmin, isJoiningRoom }: any) => (
    <div className="w-full h-full flex flex-col items-center justify-center px-8 py-4 text-center space-y-6 relative max-w-sm mx-auto">
        {isJoiningRoom && (
           <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/30 dark:bg-black/30 backdrop-blur-md animate-in fade-in duration-300 rounded-[2.5rem]">
              <div className="w-12 h-12 border-4 border-misionero-azul border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-[10px] font-black uppercase tracking-widest animate-pulse">Cargando Sala...</p>
           </div>
        )}
        <div className="w-20 h-20 bg-misionero-azul/10 rounded-[2rem] flex items-center justify-center text-misionero-azul"><UsersIcon /></div>
        <div><h3 className="text-xl font-black uppercase mb-2">Sincronización</h3><p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed">Únete a una sala para ver los acordes en tiempo real.</p></div>
        <input type="text" placeholder="CÓDIGO" className="w-full glass-ui rounded-2xl px-6 py-4 text-center font-black text-lg uppercase outline-none" value={roomCodeInput} onChange={e => setRoomCodeInput(e.target.value)} />
        <button onClick={() => handleJoinRoom()} className="w-full glass-ui glass-interactive bg-misionero-azul/70 text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-widest active:scale-95 transition-all">UNIRME</button>
        {isAdmin && <button onClick={handleCreateRoom} className="w-full glass-ui glass-interactive bg-misionero-verde/30 text-misionero-verde font-black py-4 rounded-2xl uppercase text-[10px] tracking-widest active:scale-95 transition-all">CREAR SALA</button>}
    </div>
);

const SettingsView = ({ 
    darkMode, theme, setTheme, isAdmin, isSuperAdmin, categories, newCategoryName, setNewCategoryName, onAddCategory, 
    editingCategory, setEditingCategory, onSaveEditCategory, handleDeleteCategory,
    passwordChangeData, setPasswordChangeData, showChangePassword, toggleShowChangePassword, 
    passwordChangeMsg, isUpdatingPassword, handleChangePassword, setCategoryConfirmModal, canLinkGoogle, onLinkGoogle, 
    isLinkingGoogle, adminUsers, onAddAdmin, onRevokeAdmin, currentUser, onViewProfile
}: any) => {
    
    const [newAdminEmail, setNewAdminEmail] = useState('');
    const cachedPhotoUrl = useCachedMedia(currentUser.photoURL);

    const EditIcon = ({ className }: { className?: string }) => (
      <svg className={className || "w-3 h-3"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    );

    return (
    <div className="w-full h-full overflow-y-auto custom-scroll px-6 py-4 pb-48 grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-8">
        <section>
            <button 
                onClick={() => onViewProfile(currentUser.id)}
                className="w-full flex items-center gap-4 p-4 rounded-[2.5rem] glass-ui glass-interactive text-left active:scale-[0.98] transition-transform"
            >
                {cachedPhotoUrl ? (
                    <img src={cachedPhotoUrl} alt={currentUser.username} className="w-16 h-16 rounded-full object-cover shadow-lg shrink-0" />
                ) : (
                    <div className="w-16 h-16 rounded-full bg-misionero-azul flex items-center justify-center text-3xl font-black text-white shadow-lg shrink-0">
                        {currentUser.username?.charAt(0).toUpperCase() || '?'}
                    </div>
                )}
                <div className="flex-1">
                    <h3 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{currentUser.username}</h3>
                    <p className="text-xs text-slate-400 font-bold">Ver y editar perfil</p>
                </div>
                <svg className="w-5 h-5 ml-auto text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
            </button>
        </section>

        <section className="space-y-4">
           <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Apariencia</h3>
           <div className="glass-ui p-4 rounded-[2.5rem] flex flex-col gap-3">
              <div className={`p-1 rounded-full grid grid-cols-3 gap-1 ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                {(['light', 'dark', 'system'] as const).map((t) => {
                  let label = 'Claro';
                  if (t === 'dark') label = 'Oscuro';
                  if (t === 'system') label = 'Sistema';
                  return (
                    <button 
                      key={t} 
                      onClick={() => setTheme(t)}
                      className={`px-4 py-2 rounded-full text-[9px] font-black uppercase transition-all ${theme === t ? (darkMode ? 'bg-slate-700 text-white' : 'bg-white text-slate-900 shadow-sm') : 'text-slate-400'}`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
        </section>
        
        <section className="space-y-4">
           <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Seguridad</h3>
           
           {canLinkGoogle && (
             <div className="glass-ui p-4 rounded-[2.5rem]">
                <button 
                    onClick={onLinkGoogle} 
                    disabled={isLinkingGoogle}
                    className={`w-full glass-ui glass-interactive flex items-center justify-center gap-3 font-black py-3 rounded-2xl uppercase text-[10px] tracking-widest active:scale-95 transition-all disabled:opacity-50 ${darkMode ? 'bg-slate-800/50 text-slate-300' : 'bg-white/50 text-slate-700'}`}
                >
                    {isLinkingGoogle ? (
                        <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                    ) : (
                        <GoogleIcon />
                    )}
                    <span>{isLinkingGoogle ? 'Vinculando...' : 'Vincular con Google'}</span>
                </button>
                <p className={`text-center text-[9px] font-bold mt-3 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Vincula tu cuenta para un inicio de sesión más rápido.</p>
             </div>
           )}

           <form onSubmit={handleChangePassword} className="glass-ui p-6 rounded-[2.5rem]">
              <div className="space-y-3">
                <div className="relative">
                  <input type={showChangePassword.current.current ? 'text' : 'password'} placeholder="Contraseña Actual" value={passwordChangeData.current} onChange={e => setPasswordChangeData(p => ({...p, current: e.target.value}))} required className={`w-full glass-ui rounded-2xl px-4 py-4 text-sm font-bold outline-none ${darkMode ? 'bg-slate-800/50' : 'bg-white/50'}`} />
                  <button type="button" onClick={() => toggleShowChangePassword('current')} className={`absolute inset-y-0 right-0 flex items-center pr-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{showChangePassword.current.current ? <EyeOffIcon/> : <EyeIcon/>}</button>
                </div>
                <div className="relative">
                  <input type={showChangePassword.current.newPass ? 'text' : 'password'} placeholder="Nueva Contraseña" value={passwordChangeData.newPass} onChange={e => setPasswordChangeData(p => ({...p, newPass: e.target.value}))} required className={`w-full glass-ui rounded-2xl px-4 py-4 text-sm font-bold outline-none ${darkMode ? 'bg-slate-800/50' : 'bg-white/50'}`} />
                  <button type="button" onClick={() => toggleShowChangePassword('newPass')} className={`absolute inset-y-0 right-0 flex items-center pr-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{showChangePassword.current.newPass ? <EyeOffIcon/> : <EyeIcon/>}</button>
                </div>
                <div className="relative">
                  <input type={showChangePassword.current.confirm ? 'text' : 'password'} placeholder="Confirmar" value={passwordChangeData.confirm} onChange={e => setPasswordChangeData(p => ({...p, confirm: e.target.value}))} required className={`w-full glass-ui rounded-2xl px-4 py-4 text-sm font-bold outline-none ${darkMode ? 'bg-slate-800/50' : 'bg-white/50'}`} />
                   <button type="button" onClick={() => toggleShowChangePassword('confirm')} className={`absolute inset-y-0 right-0 flex items-center pr-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{showChangePassword.current.confirm ? <EyeOffIcon/> : <EyeIcon/>}</button>
                </div>
              </div>
              {passwordChangeMsg && <div className={`mt-4 text-[9px] font-black text-center uppercase ${passwordChangeMsg.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>{passwordChangeMsg.text}</div>}
              <button type="submit" disabled={isUpdatingPassword} className="w-full mt-4 glass-ui glass-interactive bg-misionero-verde/70 text-white font-black py-4 rounded-2xl text-[9px] uppercase tracking-widest active:scale-95 transition-all">{isUpdatingPassword ? '...' : 'Actualizar Pass'}</button>
           </form>
        </section>
      </div>
      <div className="space-y-8">
         {isSuperAdmin && (
          <section className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Panel Super Admin</h3>
              <div className="glass-ui p-6 rounded-[2.5rem] space-y-4">
                  <div className="flex gap-2">
                      <input 
                          type="email" 
                          placeholder="Correo del usuario" 
                          className={`flex-1 glass-ui rounded-xl px-3 py-2 text-xs font-bold outline-none ${darkMode ? 'bg-slate-800/50' : 'bg-white/50'}`}
                          value={newAdminEmail}
                          onChange={e => setNewAdminEmail(e.target.value)}
                      />
                      <button onClick={() => { onAddAdmin(newAdminEmail); setNewAdminEmail(''); }} className="bg-misionero-verde text-white p-2 rounded-xl active:scale-90 transition-transform">
                          <PlusIcon />
                      </button>
                  </div>
                  <p className="text-[9px] font-bold text-slate-400">Asignar rol de administrador a un usuario por su correo.</p>
                  <div className="space-y-2">
                      {adminUsers.map((admin: AppUser) => (
                          <div key={admin.id} className={`flex items-center justify-between pl-4 pr-2 py-2 rounded-lg text-sm font-black glass-ui ${darkMode ? 'bg-slate-800/40' : 'bg-white/40'}`}>
                              <span>{admin.username}</span>
                              {admin.email !== SUPER_ADMIN_EMAIL && (
                                  <button onClick={() => onRevokeAdmin(admin)} className={`p-2 rounded-md transition-colors ${darkMode ? 'hover:bg-red-500/10 text-red-400/70' : 'hover:bg-red-500/5 text-red-500/70'}`}>
                                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                                  </button>
                              )}
                          </div>
                      ))}
                  </div>
              </div>
          </section>
        )}
         {isAdmin && (
          <section className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Administrar Categorías</h3>
              <div className="glass-ui p-6 rounded-[2.5rem] space-y-4">
                  <div className="flex gap-2">
                      <input 
                          type="text" 
                          placeholder="Nueva Categoría" 
                          className={`flex-1 glass-ui rounded-xl px-3 py-2 text-xs font-bold outline-none ${darkMode ? 'bg-slate-800/50' : 'bg-white/50'}`}
                          value={newCategoryName}
                          onChange={e => setNewCategoryName(e.target.value)}
                      />
                      <button onClick={onAddCategory} className="bg-misionero-verde text-white p-2 rounded-xl active:scale-90 transition-transform">
                          <PlusIcon />
                      </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                      {categories.length === 0 ? (
                          <p className={`text-xs font-bold w-full text-center py-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>No hay categorías definidas.</p>
                      ) : categories.map((cat: {id: string, name: string}) => (
                          <div key={cat.id} className={`flex items-center gap-2 pl-3 pr-1 py-1 rounded-lg text-[9px] font-black uppercase glass-ui ${darkMode ? 'bg-slate-800/40' : 'bg-white/40'}`}>
                              {editingCategory?.id === cat.id ? (
                                  <input 
                                      autoFocus
                                      className="bg-transparent outline-none w-20"
                                      value={editingCategory.name}
                                      onChange={e => setEditingCategory({...editingCategory, name: e.target.value})}
                                      onBlur={onSaveEditCategory}
                                      onKeyDown={e => e.key === 'Enter' && onSaveEditCategory()}
                                  />
                              ) : (
                                  <span>{cat.name}</span>
                              )}
                              <button onClick={() => setEditingCategory({id: cat.id, name: cat.name})} className={`p-1 rounded-md transition-colors ${darkMode ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-black/5 text-slate-500'}`}><EditIcon /></button>
                              <button onClick={() => { 
                                  triggerHapticFeedback('error');
                                  setCategoryConfirmModal({ title: 'Eliminar Categoría', message: `¿Seguro que quieres eliminar "${cat.name}"? Esta acción no se puede deshacer.`, action: () => { handleDeleteCategory(cat.id); setCategoryConfirmModal(null); }, type: 'danger' })
                              }} className={`p-1 rounded-md transition-colors ${darkMode ? 'hover:bg-red-500/10 text-red-400/70' : 'hover:bg-red-500/5 text-red-500/70'}`}>
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
                              </button>
                          </div>
                      ))}
                  </div>
              </div>
          </section>
        )}
      </div>
    </div>
    );
};


// --- COMPONENTE PRINCIPAL DE LA VISTA ---
const MainView = ({
  user, view, darkMode, theme, setTheme, isAdmin, isSuperAdmin, animationDirection, navigateTo, totalUnreadCount,
  // Props para todas las vistas
  songs, favorites, openSongViewer, toggleFavorite,
  searchQuery, setSearchQuery, activeFilter, setActiveFilter, categories,
  // Props para Chat
  userChats, allValidatedUsers, onlineStatuses, openDirectMessage, onViewProfile, typingStatuses,
  // Props para Sala
  roomCodeInput, setRoomCodeInput, handleJoinRoom, handleCreateRoom, isJoiningRoom,
  // Props para Ajustes
  newCategoryName, setNewCategoryName, onAddCategory,
  editingCategory, setEditingCategory, onSaveEditCategory, handleDeleteCategory, setCategoryConfirmModal,
  passwordChangeData, setPasswordChangeData, showChangePassword, toggleShowChangePassword, passwordChangeMsg, isUpdatingPassword, handleChangePassword,
  isLinkingGoogle, handleLinkGoogleAccount, adminUsers, handleAddAdmin, handleRevokeAdmin, handleSignOut, openSongEditor,
  onDeleteAccountRequest,
  sharedImportUrl // New prop
}: any) => {
  
  const touchStartCoords = useRef<{x: number, y: number} | null>(null);
  const minSwipeDistance = 60;

  const handleTouchStart = (e: React.TouchEvent) => {
    // Solo registrar el inicio si no hay un overlay activo (canción, sala, etc)
    if (document.querySelector('[data-is-overlay="true"]')) return;
    touchStartCoords.current = { x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      if (!touchStartCoords.current) return;

      const deltaX = e.changedTouches[0].clientX - touchStartCoords.current.x;
      const deltaY = e.changedTouches[0].clientY - touchStartCoords.current.y;

      // Asegurarse que es un swipe horizontal y no un scroll vertical
      if (Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && Math.abs(deltaX) > minSwipeDistance) {
          const currentIndex = VIEW_ORDER.indexOf(view);
          if (deltaX < 0) { // Swipe Izquierda (next)
              const nextIndex = (currentIndex + 1) % VIEW_ORDER.length;
              navigateTo(VIEW_ORDER[nextIndex], 'left');
          } else if (deltaX > 0) { // Swipe Derecha (previous)
              const prevIndex = (currentIndex - 1 + VIEW_ORDER.length) % VIEW_ORDER.length;
              navigateTo(VIEW_ORDER[prevIndex], 'right');
          }
      }
      touchStartCoords.current = null;
  };
  
  const categoryNames = useMemo(() => categories.map((c: any) => c.name), [categories]);
  const filteredSongs = useMemo(() => songs.filter((s: Song) => (s.title.toLowerCase().includes(searchQuery.toLowerCase()) || s.author.toLowerCase().includes(searchQuery.toLowerCase())) && (activeFilter === 'Todos' || s.category === activeFilter)).sort((a, b) => a.title.localeCompare(b.title)), [songs, searchQuery, activeFilter]);
  const favoriteSongs = useMemo(() => filteredSongs.filter((s: Song) => favorites.includes(s.id)), [filteredSongs, favorites]);

  const renderActiveView = () => {
      switch(view) {
          case 'feed':
              return <FeedView songs={filteredSongs} favorites={favorites} openSongViewer={openSongViewer} toggleFavorite={toggleFavorite} darkMode={darkMode} />;
          case 'favorites':
              return <FavoritesView songs={favoriteSongs} favorites={favorites} openSongViewer={openSongViewer} toggleFavorite={toggleFavorite} darkMode={darkMode} />;
          case 'chat':
              return <ChatListView userChats={userChats} allValidatedUsers={allValidatedUsers} onlineStatuses={onlineStatuses} onUserSelect={openDirectMessage} onViewProfile={onViewProfile} darkMode={darkMode} currentUser={user} db={db} rtdb={rtdb} typingStatuses={typingStatuses} />;
          case 'room':
              return <RoomLobbyView roomCodeInput={roomCodeInput} setRoomCodeInput={setRoomCodeInput} handleJoinRoom={handleJoinRoom} handleCreateRoom={handleCreateRoom} isAdmin={isAdmin} isJoiningRoom={isJoiningRoom} />;
          case 'settings':
              return <SettingsView 
                        darkMode={darkMode} theme={theme} setTheme={setTheme} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin}
                        categories={categories} newCategoryName={newCategoryName} setNewCategoryName={setNewCategoryName} onAddCategory={onAddCategory} 
                        editingCategory={editingCategory} setEditingCategory={setEditingCategory} onSaveEditCategory={onSaveEditCategory} handleDeleteCategory={handleDeleteCategory}
                        passwordChangeData={passwordChangeData} setPasswordChangeData={setPasswordChangeData} showChangePassword={showChangePassword}
                        toggleShowChangePassword={toggleShowChangePassword} passwordChangeMsg={passwordChangeMsg} isUpdatingPassword={isUpdatingPassword} handleChangePassword={handleChangePassword}
                        setCategoryConfirmModal={setCategoryConfirmModal}
                        canLinkGoogle={user?.hasPasswordProvider && !user?.hasGoogleProvider}
                        onLinkGoogle={handleLinkGoogleAccount}
                        isLinkingGoogle={isLinkingGoogle}
                        adminUsers={adminUsers} onAddAdmin={handleAddAdmin} onRevokeAdmin={handleRevokeAdmin}
                        currentUser={user}
                        onViewProfile={onViewProfile}
                        onDeleteAccountRequest={onDeleteAccountRequest}
                     />;
          default:
              return null;
      }
  };

  const animationClass = 
    animationDirection === 'left' ? 'animate-slide-in-from-right' :
    animationDirection === 'right' ? 'animate-slide-in-from-left' :
    'animate-view-fade-in';

  return (
    <div className={`fixed inset-0 transition-colors duration-500 ${darkMode ? 'text-white bg-black' : 'text-slate-900 bg-slate-50'} flex`}>
      <NavBar view={view} navigateTo={navigateTo} darkMode={darkMode} totalUnreadCount={totalUnreadCount} />
      <div className="md:pl-20 w-full flex flex-col">
        <header onTouchStart={(e) => e.stopPropagation()} className={`shrink-0 z-30 transition-colors duration-500 ${darkMode ? 'bg-black/80 backdrop-blur-sm' : 'bg-slate-50/80 backdrop-blur-sm'} border-b ${darkMode ? 'border-white/10' : 'border-slate-200'}`}>
          <div className="w-full max-w-7xl mx-auto px-4 pt-9 pb-3">
            <div className="flex justify-between items-center mb-3">
              <div>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] mb-0.5">ADJStudios</p>
                <h2 className="text-lg font-black tracking-tight">
                  {view === 'feed' ? `Hola, ${user.username}` : view === 'favorites' ? 'Mis Favoritos' : view === 'chat' ? 'Mensajes' : view === 'room' ? 'Sala en Vivo' : 'Ajustes'}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {view === 'feed' && isAdmin && (
                   <button onClick={() => openSongEditor(null)} className="hidden md:flex items-center gap-2 bg-misionero-rojo text-white px-4 py-2 rounded-xl font-black text-[9px] uppercase active:scale-95 transition-transform">
                      <PlusIcon /> <span>Añadir Música</span>
                   </button>
                )}
                {view === 'settings' && (
                  <button onClick={() => handleSignOut()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-misionero-rojo/10 text-misionero-rojo active:scale-95 transition-all">
                    <LogoutIcon />
                    <span className="text-[9px] font-black uppercase">Cerrar Sesión</span>
                  </button>
                )}
                {isAdmin && <span className="text-[7px] font-black bg-misionero-rojo text-white px-2 py-1 rounded-full uppercase animate-pulse">Admin</span>}
              </div>
            </div>
            {(view === 'feed' || view === 'favorites') && (
              <div className="space-y-3">
                <div className="relative w-full">
                  <input type="text" placeholder="Buscar música..." className={`w-full glass-ui rounded-2xl px-4 py-2 text-xs font-bold outline-none pr-10 ${darkMode ? 'text-white placeholder:text-slate-600' : 'text-slate-900 placeholder:text-slate-400'}`} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 right-0 flex items-center justify-center w-10 h-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                      aria-label="Limpiar búsqueda"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 pt-1 no-swipe custom-scroll">
                  {['Todos', ...categoryNames].map((f: string) => (
                    <button key={f} onClick={() => setActiveFilter(f as any)} className={`px-5 py-2 rounded-full text-[9px] font-black uppercase shrink-0 transition-all ${activeFilter === f ? 'bg-misionero-azul text-white' : 'glass-ui text-slate-400'}`}>{f}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 relative overflow-hidden" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <div key={view} className={`w-full h-full ${animationClass} max-w-7xl mx-auto`}>
              {renderActiveView()}
          </div>
        </main>
      </div>
      {view === 'feed' && isAdmin && (
        <button
          onClick={() => openSongEditor(null)}
          className="md:hidden fixed bottom-24 right-6 z-40 w-16 h-16 bg-misionero-rojo text-white rounded-full shadow-2xl flex items-center justify-center active:scale-95 transition-transform animate-in zoom-in-75"
          aria-label="Añadir Música"
        >
          <PlusIcon />
        </button>
      )}
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<AppView>('feed');
  const [theme, setTheme] = useState<Theme>('system');
  const [darkMode, setDarkMode] = useState(false);

  // Auth State
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [authData, setAuthData] = useState({ user: '', email: '', pass: '', confirmPass: '' });
  const [authMsg, setAuthMsg] = useState<{ type: 'error' | 'success', text: string } | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Data
  const [songs, setSongs] = useState<Song[]>([]);
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
  const [adminUsers, setAdminUsers] = useState<AppUser[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  
  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('Todos');
  const [animationDirection, setAnimationDirection] = useState<AnimationDirection>('fade');
  const [isSavingSong, setIsSavingSong] = useState(false);

  // Room
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const roomSubscription = useRef<Unsubscribe | null>(null);

  // Chat
  const [userChats, setUserChats] = useState<ChatInfo[]>([]);
  const [allValidatedUsers, setAllValidatedUsers] = useState<AppUser[]>([]);
  const [onlineStatuses, setOnlineStatuses] = useState<Record<string, any>>({});
  const [typingStatuses, setTypingStatuses] = useState<Record<string, any>>({});

  // Overlays
  const [viewerSong, setViewerSong] = useState<Song | null>(null);
  const [editorSong, setEditorSong] = useState<Song | null>(null);
  const [isSongEditorOpen, setIsSongEditorOpen] = useState(false);
  const [directMessagePartner, setDirectMessagePartner] = useState<AppUser | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [viewingProfileUser, setViewingProfileUser] = useState<AppUser | null>(null);
  const [categoryConfirmModal, setCategoryConfirmModal] = useState<any>(null);
  const [exitRoomConfirmModal, setExitRoomConfirmModal] = useState<any>(null);
  const [deleteAccountConfirmModal, setDeleteAccountConfirmModal] = useState<any>(null);
  const [deleteSongConfirmModal, setDeleteSongConfirmModal] = useState<any>(null);


  // Settings
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<{id: string, name: string} | null>(null);
  const [passwordChangeData, setPasswordChangeData] = useState({ current: '', newPass: '', confirm: '' });
  const [showChangePassword, setShowChangePassword] = useState({ current: false, newPass: false, confirm: false });
  const [passwordChangeMsg, setPasswordChangeMsg] = useState<{ type: 'error' | 'success', text: string } | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);

  // Import State from Share Plugin
  const [sharedImportUrl, setSharedImportUrl] = useState<string | null>(null);

  // Helper for generating chat ID (needed for self-healing logic)
  const generateChatId = (uid1: string, uid2: string): string => {
      return [uid1, uid2].sort().join('_');
  };

  const openOverlay = useCallback((state: { overlay: string }) => {
    if ((window.history.state as { overlay?: string })?.overlay !== state.overlay) {
        window.history.pushState(state, '');
    }
  }, []);

  const goBack = useCallback(() => {
    window.history.back();
  }, []);

  const openSongViewer = useCallback((song: Song) => {
    setViewerSong(song);
    openOverlay({ overlay: 'song' });
  }, [openOverlay]);

  const openDirectMessage = useCallback((partner: AppUser) => {
    setDirectMessagePartner(partner);
    openOverlay({ overlay: 'dm' });
  }, [openOverlay]);
  
  const openUserProfile = useCallback((userId: string) => {
    setProfileUserId(userId);
    openOverlay({ overlay: 'profile' });
  }, [openOverlay]);

  const handleOpenDirectMessageFromId = useCallback((partnerId: string) => {
    getDoc(doc(db, 'users', partnerId)).then(snap => {
         if (snap.exists()) openDirectMessage({id: partnerId, ...snap.data()} as AppUser);
    });
  }, [openDirectMessage]);
  
  const cleanUpRoomExit = useCallback(async () => {
    if (!currentRoom || !user) return;
    const roomToExit = currentRoom;
    setCurrentRoom(null); // Set state immediately
    if (roomSubscription.current) {
        roomSubscription.current();
        roomSubscription.current = null;
    }
    try {
        const partRef = ref(rtdb, `rooms/${roomToExit.id}/participants/${user.username}`);
        await removeRtdb(partRef);
    } catch (error) {
        console.error("Failed to cleanly exit room from database:", error);
    }
  }, [currentRoom, user, rtdb]);

  const navigateTo = useCallback((newView: AppView, direction: AnimationDirection = 'fade') => {
    setAnimationDirection(direction);
    setView(newView);
  }, []);

  // --- NATIVE BACK BUTTON & HISTORY MANAGEMENT ---
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
        const overlay = (event.state as { overlay?: string })?.overlay;

        // Si estamos en una sala y el nuevo estado NO es una superposición relacionada con la sala, entonces salimos.
        if (currentRoom && !overlay?.startsWith('room') && overlay !== 'editor' && overlay !== 'profile' && overlay !== 'song') {
            cleanUpRoomExit();
        }

        if (!overlay) {
          setViewerSong(null);
          setDirectMessagePartner(null);
          setProfileUserId(null);
          setIsSongEditorOpen(false);
          setEditorSong(null);
        } else {
           if (overlay !== 'song') setViewerSong(null);
           if (overlay !== 'dm') setDirectMessagePartner(null);
           if (overlay !== 'profile') setProfileUserId(null);
           if (overlay !== 'editor') {
              setIsSongEditorOpen(false);
              setEditorSong(null);
           }
        }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentRoom, cleanUpRoomExit]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = CapacitorApp.addListener('backButton', () => {
        const currentState = window.history.state;

        if (exitRoomConfirmModal || categoryConfirmModal) {
            setExitRoomConfirmModal(null);
            setCategoryConfirmModal(null);
            return;
        }

        if (currentState?.overlay?.startsWith('room')) {
            triggerHapticFeedback('error');
            setExitRoomConfirmModal({
                title: 'Salir de la Sala',
                message: '¿Estás seguro de que quieres salir de la sala en vivo?',
                action: () => {
                    setExitRoomConfirmModal(null);
                    goBack(); // Esto dispara popstate, que llama a cleanUpRoomExit
                },
                type: 'warning'
            });
        } else if (currentState?.overlay) {
            window.history.back();
        } else {
            CapacitorApp.exitApp();
        }
    });

    return () => { listener.then(l => l.remove()); };
  }, [exitRoomConfirmModal, categoryConfirmModal, goBack]);

  // --- Push Notifications Effect ---
  useEffect(() => {
    if (user?.id) {
        initializePushNotifications(app, db, user.id, (chatId) => {
            const partnerId = chatId.replace(user.id, '').replace('_', '');
            if (partnerId) {
              navigateTo('chat');
              handleOpenDirectMessageFromId(partnerId);
            }
        });
    }
  }, [user?.id, navigateTo, handleOpenDirectMessageFromId]);
  
  // Self-Healing Effect: Sync user names/photos in chat list with validated users list
  useEffect(() => {
      if (!user || userChats.length === 0 || allValidatedUsers.length === 0) return;

      userChats.forEach(chat => {
          const liveUser = allValidatedUsers.find(u => u.id === chat.partnerId);
          if (liveUser) {
              const nameMismatch = liveUser.username !== chat.partnerUsername;
              const photoMismatch = liveUser.photoURL !== chat.partnerPhotoURL;
              
              if (nameMismatch || photoMismatch) {
                  const chatId = generateChatId(user.id, chat.partnerId);
                  updateDoc(doc(db, 'user_chats', user.id, 'chats', chatId), {
                      partnerUsername: liveUser.username,
                      partnerPhotoURL: liveUser.photoURL || null
                  }).catch(e => console.warn("Self-healing update failed", e));
              }
          }
      });
  }, [userChats, allValidatedUsers, user, db]);

  // Handle Share Plugin & Median/GoNative Deep Links
  useEffect(() => {
    (window as any).median = (window as any).median || {};
    (window as any).median.app = (window as any).median.app || {};
    (window as any).median.app.receivedLink = (data: { url: string }) => {
        try {
            const url = new URL(data.url);
            const params = new URLSearchParams(url.search);
            const songId = params.get('song');
            
            if (songId) {
                const event = new CustomEvent('deep-link-received', { detail: { songId } });
                window.dispatchEvent(event);
            }
        } catch (error) {
            console.error("Error parsing deep link URL:", error);
        }
    };
    (window as any).median_share_to_app = (data: any) => {
        const url = data?.url;
        if (url && url.includes('lacuerda.net')) {
            setSharedImportUrl(url);
            setEditorSong(null);
            setIsSongEditorOpen(true);
            openOverlay({ overlay: 'editor' });
        } else if (url) {
            alert("Por el momento solo soportamos importar desde LaCuerda.net");
        }
    };
  }, [openOverlay]);
  
  useEffect(() => {
    const handleDeepLink = (event: Event) => {
        const customEvent = event as CustomEvent;
        const { songId } = customEvent.detail;
        if (songId) {
            setTimeout(() => {
                const songToOpen = songs.find(s => s.id === songId);
                if (songToOpen) {
                    openSongViewer(songToOpen);
                } else {
                    console.warn(`Deep link for song ID ${songId} received, but song was not found.`);
                }
            }, 500);
        }
    };

    window.addEventListener('deep-link-received', handleDeepLink);
    return () => {
        window.removeEventListener('deep-link-received', handleDeepLink);
    };
  }, [songs, openSongViewer]);


  // Authentication and Presence Effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
            const userRef = doc(db, 'users', firebaseUser.uid);
            const userSnap = await getDoc(userRef);
            let appUser: AppUser;
            if (userSnap.exists()) {
                appUser = { id: firebaseUser.uid, ...userSnap.data() } as AppUser;
                setUser(appUser);
            } else {
                 appUser = {
                    id: firebaseUser.uid,
                    username: firebaseUser.displayName || 'Usuario',
                    username_lowercase: (firebaseUser.displayName || 'usuario').toLowerCase(),
                    email: firebaseUser.email || '',
                    role: 'member',
                    photoURL: firebaseUser.photoURL || undefined,
                    hasGoogleProvider: firebaseUser.providerData.some(p => p.providerId === 'google.com'),
                    hasPasswordProvider: firebaseUser.providerData.some(p => p.providerId === 'password'),
                    createdAt: new Date().toISOString(),
                    profileValidated: true,
                };
                await setDoc(userRef, appUser);
                setUser(appUser);
            }
            const rtdbRef = ref(rtdb, `.info/connected`);
            onValue(rtdbRef, (snap) => {
                if (snap.val() === true) {
                    const con = ref(rtdb, `status/${firebaseUser.uid}`);
                    onDisconnect(con).set({ state: 'offline', last_changed: serverTimestamp() });
                    set(con, { state: 'online', last_changed: serverTimestamp() });

                    // Robust Room Presence Management
                    if (currentRoom) {
                       const roomPresenceRef = ref(rtdb, `rooms/${currentRoom.id}/participants/${appUser.username}`);
                       onDisconnect(roomPresenceRef).remove();
                       set(roomPresenceRef, true);
                    }
                }
            });
        } else {
            setUser(null);
            setFavorites([]);
        }
        setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [currentRoom]); // Re-run when currentRoom changes to set correct onDisconnect

  // Theme Effect
  useEffect(() => {
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDarkMode(isDark);
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  // Data Subscriptions
  useEffect(() => {
    if (!user) return;
    const unsubSongs = onSnapshot(collection(db, 'songs'), (snap) => {
        setSongs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Song)));
    }, (error) => console.error("Error fetching songs:", error));

    const unsubCats = onSnapshot(collection(db, 'song_categories'), (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
    }, (error) => {
        console.warn("Could not load dynamic categories, falling back to default.", error);
        const defaultCats = Object.values(LiturgicalTime).map(name => ({ id: name, name }));
        setCategories(defaultCats);
    });

    const unsubUser = onSnapshot(doc(db, 'users', user.id), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            setUser(prev => prev ? { ...prev, ...data } as AppUser : null);
            setFavorites(data.favorites || []);
        }
    }, (error) => console.error("Error fetching user profile:", error));

    const unsubChats = onSnapshot(query(collection(db, 'user_chats', user.id, 'chats'), orderBy('lastMessageTimestamp', 'desc')), 
        (snap) => {
            const chats = snap.docs.map(d => {
                const data = d.data();
                let partnerId = data.partnerId;
                if (!partnerId) {
                    const parts = d.id.split('_');
                    if (parts.length === 2) {
                        partnerId = parts[0] === user.id ? parts[1] : parts[0];
                    } else {
                        partnerId = d.id;
                    }
                }
                return { ...data, partnerId } as ChatInfo;
            });
            
            chats.forEach(async (chat) => {
                if (chat.partnerValidated === undefined) {
                    try {
                        const partnerDoc = await getDoc(doc(db, 'users', chat.partnerId));
                        if (partnerDoc.exists()) {
                            const isProfileValidated = partnerDoc.data().profileValidated === true;
                            const docId = snap.docs.find(d => {
                                const dData = d.data();
                                let pId = dData.partnerId;
                                if (!pId) {
                                    const parts = d.id.split('_');
                                    pId = (parts.length === 2 && (parts[0] === user.id ? parts[1] : parts[0])) || d.id;
                                }
                                return pId === chat.partnerId;
                            })?.id;

                            if (docId) {
                                await updateDoc(doc(db, 'user_chats', user.id, 'chats', docId), {
                                    partnerValidated: isProfileValidated
                                });
                            }
                        }
                    } catch (e) {
                        console.error("Error backfilling validation status:", e);
                    }
                }
            });

            setUserChats(chats);
        },
        (error) => {
            console.error("Error loading chat list:", error);
            setUserChats([]);
        }
    );
    
    const unsubAllUsers = onSnapshot(query(collection(db, 'users'), where('profileValidated', '==', true)),
      (snap) => {
          const users = snap.docs
              .map(d => ({ id: d.id, ...d.data() } as AppUser))
              .filter(u => u.id !== user.id);
          setAllValidatedUsers(users);
      }, (error) => console.error("Error fetching all users:", error)
    );

    const unsubOnline = onValue(ref(rtdb, 'status'), (snap) => {
        setOnlineStatuses(snap.val() || {});
    });

    const unsubTyping = onValue(ref(rtdb, 'typing'), (snap) => {
        setTypingStatuses(snap.val() || {});
    });
    
    let unsubAdmins = () => {};
    if (user.email === SUPER_ADMIN_EMAIL) {
        const q = query(collection(db, 'users'), where('role', '==', 'admin'));
        unsubAdmins = onSnapshot(q, (snap) => {
             setAdminUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as AppUser)));
        }, (error) => console.error("Error fetching admins:", error));
    }

    return () => { unsubSongs(); unsubUser(); unsubChats(); unsubAllUsers(); unsubOnline(); unsubTyping(); unsubAdmins(); unsubCats(); };
  }, [user?.id]);

  // Profile Viewer Effect
  useEffect(() => {
    if (profileUserId) {
        if (profileUserId === user?.id) {
            setViewingProfileUser(user);
        } else {
            getDoc(doc(db, 'users', profileUserId)).then(snap => {
                if (snap.exists()) setViewingProfileUser({ id: snap.id, ...snap.data() } as AppUser);
            });
        }
    } else {
        setViewingProfileUser(null);
    }
  }, [profileUserId, user]);

  const handleJoinRoom = useCallback(async (code?: string) => {
      const codeToJoin = code || roomCodeInput;
      if (!codeToJoin || !user) return;
      setIsJoiningRoom(true);
      try {
          const q = query(collection(db, 'rooms'), where('code', '==', codeToJoin.toUpperCase()));
          const snap = await getDocs(q);
          if (snap.empty) throw new Error("Sala no encontrada");
          
          const roomDoc = snap.docs[0];
          let roomData = { id: roomDoc.id, ...roomDoc.data() } as Room;
          
          if (roomData.banned?.includes(user.username)) throw new Error("Estás baneado de esta sala");

          if (roomSubscription.current) roomSubscription.current();

          roomSubscription.current = onSnapshot(doc(db, 'rooms', roomData.id), (doc) => {
              if (doc.exists()) {
                  setCurrentRoom({ id: doc.id, ...doc.data() } as Room);
              } else {
                  setCurrentRoom(null);
                  if (roomSubscription.current) roomSubscription.current();
              }
          });
          
          openOverlay({ overlay: 'room' });
      } catch (e: any) {
          alert(e.message);
      } finally {
          setIsJoiningRoom(false);
      }
  }, [roomCodeInput, user, openOverlay]);
  
  if (authLoading) return <div className="fixed inset-0 flex items-center justify-center bg-black"><div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin"></div></div>;

  if (!user) {
      return <LoginView 
          handleAuthSubmit={async (e: any) => {
              e.preventDefault();
              setIsAuthenticating(true);
              setAuthMsg(null);
              try {
                  if (authMode === 'login') {
                      await signInWithEmailAndPassword(auth, authData.email, authData.pass);
                  } else if (authMode === 'register') {
                       if (authData.pass !== authData.confirmPass) throw new Error("Las contraseñas no coinciden");
                       const uc = await createUserWithEmailAndPassword(auth, authData.email, authData.pass);
                       await setDoc(doc(db, 'users', uc.user.uid), {
                           id: uc.user.uid,
                           username: authData.user,
                           username_lowercase: authData.user.toLowerCase(),
                           email: authData.email,
                           role: 'member',
                           hasPasswordProvider: true,
                           createdAt: new Date().toISOString(),
                           profileValidated: true,
                       });
                  } else {
                      await sendPasswordResetEmail(auth, authData.email);
                      setAuthMsg({ type: 'success', text: 'Correo de recuperación enviado.' });
                  }
              } catch (err: any) {
                  setAuthMsg({ type: 'error', text: translateAuthError(err.code) });
              } finally {
                  setIsAuthenticating(false);
              }
          }}
          authData={authData} setAuthData={setAuthData}
          authMode={authMode} setAuthMode={setAuthMode}
          authMsg={authMsg} setAuthMsg={setAuthMsg}
          isAuthenticating={isAuthenticating}
          showPassword={showPassword} setShowPassword={setShowPassword}
          handleGoogleSignIn={async () => {
              setIsAuthenticating(true);
              try {
                  const provider = new GoogleAuthProvider();
                  await signInWithPopup(auth, provider);
              } catch (err: any) {
                  setAuthMsg({ type: 'error', text: translateAuthError(err.code) });
              } finally {
                  setIsAuthenticating(false);
              }
          }}
      />;
  }

  const totalUnreadCount = userChats.reduce((acc, chat) => acc + (chat.unreadCount || 0), 0);

  return (
      <AudioPlayerProvider>
          <ChatSyncManager currentUser={user} db={db} />
          {!currentRoom && !viewerSong && !isSongEditorOpen && !directMessagePartner && !profileUserId ? (
              <MainView 
                  user={user} view={view} darkMode={darkMode} theme={theme} setTheme={setTheme} isAdmin={user.role === 'admin'} isSuperAdmin={user.email === SUPER_ADMIN_EMAIL}
                  animationDirection={animationDirection} navigateTo={navigateTo}
                  totalUnreadCount={totalUnreadCount}
                  songs={songs} favorites={favorites}
                  openSongViewer={openSongViewer}
                  toggleFavorite={async (e: any, songId: string) => {
                      e.stopPropagation();
                      const newFavs = favorites.includes(songId) ? arrayRemove(songId) : arrayUnion(songId);
                      await updateDoc(doc(db, 'users', user.id), { favorites: newFavs });
                  }}
                  searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                  activeFilter={activeFilter} setActiveFilter={setActiveFilter}
                  categories={categories}
                  userChats={userChats} allValidatedUsers={allValidatedUsers} onlineStatuses={onlineStatuses} typingStatuses={typingStatuses}
                  openDirectMessage={(partner: AppUser) => openDirectMessage(partner)}
                  onViewProfile={openUserProfile}
                  roomCodeInput={roomCodeInput} setRoomCodeInput={setRoomCodeInput}
                  isJoiningRoom={isJoiningRoom}
                  handleJoinRoom={handleJoinRoom}
                  handleCreateRoom={async () => {
                      if (user.role !== 'admin') return;
                      setIsJoiningRoom(true);
                      try {
                          const code = Math.random().toString(36).substring(2, 6).toUpperCase();
                          await addDoc(collection(db, 'rooms'), {
                              code,
                              host: user.username,
                              repertoire: [],
                              participants: [],
                              createdAt: Date.now()
                          });
                          handleJoinRoom(code);
                      } catch (e) {
                          alert("Error creando sala");
                      } finally {
                          setIsJoiningRoom(false);
                      }
                  }}
                  newCategoryName={newCategoryName} setNewCategoryName={setNewCategoryName}
                  onAddCategory={async () => {
                      if (!newCategoryName.trim()) return;
                      await addDoc(collection(db, 'song_categories'), { name: newCategoryName.trim() });
                      setNewCategoryName('');
                  }}
                  editingCategory={editingCategory} setEditingCategory={setEditingCategory}
                  onSaveEditCategory={async () => {
                      if (editingCategory) {
                          await updateDoc(doc(db, 'song_categories', editingCategory.id), { name: editingCategory.name });
                          setEditingCategory(null);
                      }
                  }}
                  handleDeleteCategory={async (id: string) => {
                      await deleteDoc(doc(db, 'song_categories', id));
                  }}
                  setCategoryConfirmModal={setCategoryConfirmModal}
                  passwordChangeData={passwordChangeData} setPasswordChangeData={setPasswordChangeData}
                  showChangePassword={showChangePassword} toggleShowChangePassword={(field: any) => setShowChangePassword(prev => ({...prev, [field]: !prev[field as keyof typeof prev]}))}
                  passwordChangeMsg={passwordChangeMsg} isUpdatingPassword={isUpdatingPassword}
                  handleChangePassword={async (e: any) => {
                      e.preventDefault();
                      setIsUpdatingPassword(true);
                      try {
                          const cred = EmailAuthProvider.credential(user.email, passwordChangeData.current);
                          if (auth.currentUser) {
                              await reauthenticateWithCredential(auth.currentUser, cred);
                              if (passwordChangeData.newPass !== passwordChangeData.confirm) throw new Error("Las contraseñas no coinciden");
                              await updatePassword(auth.currentUser, passwordChangeData.newPass);
                              setPasswordChangeMsg({ type: 'success', text: 'Contraseña actualizada' });
                              setPasswordChangeData({ current: '', newPass: '', confirm: '' });
                          }
                      } catch (err: any) {
                          setPasswordChangeMsg({ type: 'error', text: translatePasswordChangeError(err.code) });
                      } finally {
                          setIsUpdatingPassword(false);
                      }
                  }}
                  isLinkingGoogle={isLinkingGoogle}
                  handleLinkGoogleAccount={async () => {
                      setIsLinkingGoogle(true);
                      try {
                          const provider = new GoogleAuthProvider();
                          if (auth.currentUser) {
                              await linkWithPopup(auth.currentUser, provider);
                              await updateDoc(doc(db, 'users', user.id), { hasGoogleProvider: true });
                          }
                      } catch (err: any) {
                          if (err.code === 'auth/credential-already-in-use') alert("Esta cuenta de Google ya está asociada a otro usuario.");
                          else alert(translateAuthError(err.code));
                      } finally {
                          setIsLinkingGoogle(false);
                      }
                  }}
                  adminUsers={adminUsers}
                  handleAddAdmin={async (email: string) => {
                      const q = query(collection(db, 'users'), where('email', '==', email));
                      const snap = await getDocs(q);
                      if (!snap.empty) {
                          await updateDoc(doc(db, 'users', snap.docs[0].id), { role: 'admin' });
                      } else {
                          alert("Usuario no encontrado");
                      }
                  }}
                  handleRevokeAdmin={async (admin: AppUser) => {
                      await updateDoc(doc(db, 'users', admin.id), { role: 'member' });
                  }}
                  handleSignOut={() => signOut(auth)}
                  openSongEditor={(song: Song | null) => {
                      setEditorSong(song);
                      setIsSongEditorOpen(true);
                      openOverlay({ overlay: 'editor' });
                  }}
                  onDeleteAccountRequest={() => {
                      triggerHapticFeedback('error');
                      setDeleteAccountConfirmModal({
                          title: 'Eliminar Cuenta',
                          message: '¿Estás seguro de que quieres eliminar tu cuenta? Esta acción es permanente y todos tus datos se perderán.',
                          action: async () => {
                              setDeleteAccountConfirmModal(null);
                              try {
                                  if (auth.currentUser) {
                                      await deleteDoc(doc(db, 'users', user.id));
                                      await deleteUser(auth.currentUser);
                                  }
                              } catch (e) {
                                  alert("Error al eliminar cuenta. Es posible que necesites volver a iniciar sesión recientemente para confirmar esta acción.");
                              }
                          }
                      });
                  }}
                  sharedImportUrl={sharedImportUrl}
              />
          ) : null}

          {currentRoom && (
              <RoomView 
                  room={currentRoom}
                  songs={songs}
                  currentUser={user}
                  isAdmin={user.role === 'admin'}
                  onExitRequest={() => {
                      triggerHapticFeedback('error');
                      setExitRoomConfirmModal({
                        title: 'Salir de la Sala',
                        message: '¿Estás seguro de que quieres salir de la sala en vivo?',
                        action: () => {
                            setExitRoomConfirmModal(null);
                            goBack(); // This triggers popstate, which calls cleanUpRoomExit
                        },
                        type: 'warning'
                      });
                  }}
                  onUpdateRoom={(roomId: string, updates: Partial<Room>) => updateDoc(doc(db, 'rooms', roomId), updates)}
                  darkMode={darkMode}
                  db={db} rtdb={rtdb}
                  onEditSong={(s: Song) => { setEditorSong(s); setIsSongEditorOpen(true); openOverlay({ overlay: 'editor' }); }}
                  onDeleteSong={async (sid: string) => { await deleteDoc(doc(db, 'songs', sid)); }}
                  categories={categories.map(c => c.name)}
                  allUsers={allValidatedUsers}
                  onViewProfile={openUserProfile}
              />
          )}

          {viewerSong && (
              <SongViewer 
                  song={viewerSong}
                  onBack={goBack}
                  onEdit={user.role === 'admin' ? () => { setEditorSong(viewerSong); setIsSongEditorOpen(true); openOverlay({ overlay: 'editor' }); } : undefined}
                  onDelete={user.role === 'admin' ? () => {
                      triggerHapticFeedback('error');
                      setDeleteSongConfirmModal({
                          title: "Eliminar Música",
                          message: `¿Estás seguro de que quieres eliminar "${viewerSong.title}"? Esta acción es permanente.`,
                          action: async () => {
                              await deleteDoc(doc(db, 'songs', viewerSong.id));
                              setDeleteSongConfirmModal(null);
                              goBack();
                          }
                      });
                  } : undefined}
                  darkMode={darkMode}
              />
          )}

          {(isSongEditorOpen || editorSong) && (
             <SongForm 
                currentUser={user}
                initialData={editorSong || undefined}
                categories={categories.map(c => c.name)}
                onCancel={goBack}
                darkMode={darkMode}
                isSaving={isSavingSong}
                onSave={async (songData: any, audioAction: any) => {
                    setIsSavingSong(true);
                    try {
                        let audioUrl = editorSong?.audioUrl;
                        if (audioAction.shouldDelete) {
                            if (editorSong?.audioUrl) {
                                try {
                                    const oldAudioRef = storageRef(storage, editorSong.audioUrl);
                                    await deleteObject(oldAudioRef);
                                } catch (error) {
                                    console.warn("Old audio file could not be deleted, it might already be gone:", error);
                                }
                            }
                            audioUrl = undefined;
                        }
                        if (audioAction.blob) {
                             const storagePath = `songs/${songData.title}_${Date.now()}.webm`;
                             const audioRef = storageRef(storage, storagePath);
                             await uploadBytes(audioRef, audioAction.blob);
                             audioUrl = await getDownloadURL(audioRef);
                        }
                        
                        if (editorSong) {
                            await updateDoc(doc(db, 'songs', editorSong.id), { ...songData, audioUrl: audioUrl === undefined ? deleteField() : audioUrl });
                        } else {
                            await addDoc(collection(db, 'songs'), { ...songData, audioUrl: audioUrl || null, createdAt: Date.now() });
                        }
                        goBack();
                    } catch (error) {
                        console.error("Error al guardar la música:", error);
        alert("No se pudo guardar la canción. Verifica tu conexión o los permisos de escritura.");
                    } finally {
                        setIsSavingSong(false);
                    }
                }}
                initialImportUrl={sharedImportUrl || undefined}
             />
          )}

          {directMessagePartner && (
              <DirectMessageView 
                  currentUser={user}
                  partner={directMessagePartner}
                  onBack={goBack}
                  db={db} rtdb={rtdb} storage={storage}
                  darkMode={darkMode}
                  partnerStatus={onlineStatuses[directMessagePartner.id]}
                  onViewProfile={openUserProfile}
                  onJoinRoom={async (code: string) => {
                      goBack(); // Close DM view
                      navigateTo('room');
                      await handleJoinRoom(code);
                  }}
              />
          )}

          {viewingProfileUser && profileUserId && (
              <UserProfileView 
                  user={viewingProfileUser} 
                  currentUser={user}
                  onBack={goBack}
                  onSaveBio={async (bio) => { await updateDoc(doc(db, 'users', user.id), { biography: bio }); }}
                  songs={songs}
                  onOpenSong={openSongViewer}
                  darkMode={darkMode}
                  db={db} storage={storage}
                  onUpdateUsername={async (newUn, pwd) => {
                       const cred = EmailAuthProvider.credential(user.email, pwd);
                       if (auth.currentUser) {
                           await reauthenticateWithCredential(auth.currentUser, cred);
                           await updateDoc(doc(db, 'users', user.id), { username: newUn, username_lowercase: newUn.toLowerCase() });
                       }
                  }}
                  onDeleteAccountRequest={() => {
                      triggerHapticFeedback('error');
                      setDeleteAccountConfirmModal({
                          title: 'Eliminar Cuenta',
                          message: '¿Estás seguro de que quieres eliminar tu cuenta? Esta acción es permanente y todos tus datos se perderán.',
                          action: async () => {
                              setDeleteAccountConfirmModal(null);
                              try {
                                  if (auth.currentUser) {
                                      await deleteDoc(doc(db, 'users', user.id));
                                      await deleteUser(auth.currentUser);
                                  }
                              } catch (e) {
                                  alert("Error al eliminar cuenta. Es posible que necesites volver a iniciar sesión recientemente para confirmar esta acción.");
                              }
                          }
                      });
                  }}
              />
          )}
          
          {(categoryConfirmModal || exitRoomConfirmModal || deleteAccountConfirmModal || deleteSongConfirmModal) && (
              <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                  <div className={`w-full max-w-sm p-6 rounded-[2.5rem] shadow-2xl border ${darkMode ? 'bg-black border-white/10' : 'bg-white border-slate-100'}`}>
                      <h3 className={`text-center font-black text-lg uppercase mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{(deleteAccountConfirmModal || exitRoomConfirmModal || categoryConfirmModal || deleteSongConfirmModal)?.title}</h3>
                      <p className={`text-center text-xs font-bold mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{(deleteAccountConfirmModal || exitRoomConfirmModal || categoryConfirmModal || deleteSongConfirmModal)?.message}</p>
                      <div className="flex gap-3">
                          <button onClick={() => { setCategoryConfirmModal(null); setExitRoomConfirmModal(null); setDeleteAccountConfirmModal(null); setDeleteSongConfirmModal(null); }} className={`flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>Cancelar</button>
                          <button onClick={(deleteAccountConfirmModal || exitRoomConfirmModal || categoryConfirmModal || deleteSongConfirmModal)?.action} className="flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-white shadow-lg bg-misionero-rojo">Confirmar</button>
                      </div>
                  </div>
              </div>
          )}
      </AudioPlayerProvider>
  );
};

export default App;