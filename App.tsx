

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
  deleteUser,
  User
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
import ChordTrackerView from './components/ChordTrackerView'; // Import the new component
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

type AppView = 'feed' | 'favorites' | 'chat' | 'room' | 'tracker' | 'settings';
const VIEW_ORDER: AppView[] = ['feed', 'favorites', 'chat', 'room', 'tracker', 'settings'];
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
    { id: 'tracker', label: 'Analizador', activeClass: 'text-misionero-amarillo', activeBg: 'bg-misionero-amarillo/10', icon: (active: boolean) => <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h2l2-7 4 12 4-8 2 3h2"/></svg> },
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
                className={`flex flex-col items-center justify-center h-full gap-1 active:scale-90 transition-all duration-300 px-2 ${isActive ? item.activeClass : 'text-slate-400'}`}
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
const VirtualSongItem: React.FC<{
  song: Song;
  favorites: string[];
  openSongViewer: (song: Song) => void;
  toggleFavorite: (e: React.MouseEvent, songId: string) => void;
  darkMode: boolean;
  observer: IntersectionObserver;
  index: number;
}> = ({ song, favorites, openSongViewer, toggleFavorite, darkMode, observer, index }) => {
  const [isInView, setIsInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const element = ref.current;
    if (element) {
        (element as any)._setIsInView = setIsInView;
        observer.observe(element);
    }
    return () => {
      if (element) {
        observer.unobserve(element);
        delete (element as any)._setIsInView;
      }
    };
  }, [observer, setIsInView]);
  
  return (
    <div ref={ref} style={{ minHeight: '96px' }}>
        {isInView && (
            <div 
                className="relative glass-ui rounded-[1.8rem] overflow-hidden active:scale-[0.98] transition-all animate-stagger-in h-fit"
                style={{ animationDelay: `${(index % 20) * 30}ms` }}
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
        )}
    </div>
  );
};

const FeedView = ({ songs, favorites, openSongViewer, toggleFavorite, darkMode }: any) => {
    const observer = useMemo(() => new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                const target = entry.target as HTMLElement & { _setIsInView?: (isIntersecting: boolean) => void };
                if (target._setIsInView) {
                    target._setIsInView(entry.isIntersecting);
                }
            });
        }, { rootMargin: '200px' }
    ), []);

    return (
        <div className="w-full h-full overflow-y-auto custom-scroll px-4 pt-4 pb-48 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-0.5 items-start auto-rows-max">
           {songs.map((song: Song, index: number) => (
              <VirtualSongItem 
                key={song.id}
                song={song}
                favorites={favorites}
                openSongViewer={openSongViewer}
                toggleFavorite={toggleFavorite}
                darkMode={darkMode}
                observer={observer}
                index={index}
              />
           ))}
        </div>
    );
};

const FavoritesView = ({ songs, favorites, openSongViewer, toggleFavorite, darkMode }: any) => {
    const observer = useMemo(() => new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                const target = entry.target as HTMLElement & { _setIsInView?: (isIntersecting: boolean) => void };
                if (target._setIsInView) {
                    target._setIsInView(entry.isIntersecting);
                }
            });
        }, { rootMargin: '200px' }
    ), []);
    
    return (
    <div className="w-full h-full overflow-y-auto custom-scroll px-4 pt-4 pb-48 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-0.5 items-start auto-rows-max">
       {songs.length === 0 ? (
         <div className="flex flex-col items-center justify-center h-full opacity-20 md:col-span-2 lg:col-span-3 xl:col-span-4"><p className="text-[10px] font-black uppercase">Sin favoritos</p></div>
       ) : songs.map((song: Song, index: number) => (
            <VirtualSongItem 
                key={song.id}
                song={song}
                favorites={favorites}
                openSongViewer={openSongViewer}
                toggleFavorite={toggleFavorite}
                darkMode={darkMode}
                observer={observer}
                index={index}
            />
       ))}
    </div>
    );
};

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
    isLinkingGoogle, adminUsers, onAddAdmin, onRevokeAdmin, currentUser, onViewProfile, onDeleteAccountRequest
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
        {onDeleteAccountRequest && (
            <section className="space-y-4">
                <h4 className={`text-[10px] font-black uppercase tracking-widest text-red-500/70`}>
                    Zona de Peligro
                </h4>
                <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-slate-900/50 border-red-500/20' : 'bg-red-500/5 border-red-500/10'}`}>
                    <button 
                        onClick={onDeleteAccountRequest}
                        className="w-full bg-red-500/10 text-red-500 font-black py-3 rounded-xl uppercase text-[10px] tracking-widest active:scale-95 transition-all"
                    >
                        Eliminar mi cuenta
                    </button>
                    <p className={`text-center text-[9px] font-bold mt-2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        Esta acción es permanente.
                    </p>
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
  passwordChangeData, setPasswordChangeData, showChangePassword, toggleShowChangePassword, 
  passwordChangeMsg, isUpdatingPassword, handleChangePassword,
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
          case 'tracker':
              return <ChordTrackerView darkMode={darkMode} />;
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
                  {view === 'feed' ? `Hola, ${user.username}` : view === 'favorites' ? 'Mis Favoritos' : view === 'chat' ? 'Mensajes' : view === 'room' ? 'Sala en Vivo' : view === 'tracker' ? 'Analizador de Acordes' : 'Ajustes'}
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
                  <input type="text" placeholder="Buscar música..." className={`w-full glass-ui rounded-2xl px-4 py-2.5 text-xs font-bold outline-none pl-10 ${darkMode ? 'bg-black/30 text-white placeholder:text-slate-600' : 'bg-white/50 text-slate-900 placeholder:text-slate-400'}`} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg></div>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 custom-scroll no-scrollbar">
                  {['Todos', ...categoryNames].map((cat: string) => (
                    <button key={cat} onClick={() => setActiveFilter(cat)} className={`px-4 py-2 rounded-full text-[9px] font-black uppercase shrink-0 transition-all ${activeFilter === cat ? 'bg-misionero-azul text-white shadow-lg shadow-misionero-azul/20' : 'glass-ui text-slate-400 border border-transparent'}`}>{cat}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>

        <main 
            className={`flex-1 relative min-h-0 ${animationClass}`}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
          {renderActiveView()}
        </main>
        
        {view === 'feed' && isAdmin && <button onClick={() => openSongEditor(null, sharedImportUrl)} className="md:hidden fixed bottom-20 right-6 w-16 h-16 bg-misionero-rojo text-white rounded-full shadow-2xl flex items-center justify-center z-40 active:scale-90 transition-transform"><PlusIcon /></button>}
      </div>
    </div>
  );
};

// --- COMPONENTE PRINCIPAL ---
const generateChatId = (uid1: string, uid2: string): string => [uid1, uid2].sort().join('_');

const App = () => {
  // Estado de autenticación
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [authData, setAuthData] = useState({ user: '', email: '', pass: '', confirmPass: '' });
  const [authMsg, setAuthMsg] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Estado de la UI
  const [view, setView] = useState<AppView>('feed');
  const [animationDirection, setAnimationDirection] = useState<AnimationDirection>('fade');
  const [theme, setThemeState] = useState<Theme>('system');
  const darkMode = useMemo(() => {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, [theme]);
  
  // Estado de datos
  const [songs, setSongs] = useState<Song[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [userChats, setUserChats] = useState<ChatInfo[]>([]);
  const [allValidatedUsers, setAllValidatedUsers] = useState<AppUser[]>([]);
  const [adminUsers, setAdminUsers] = useState<AppUser[]>([]);
  const [onlineStatuses, setOnlineStatuses] = useState<Record<string, { state: 'online' } | { state: 'offline', last_changed: number }>>({});
  const [typingStatuses, setTypingStatuses] = useState<Record<string, any>>({});
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);

  // Estado de overlays (vistas modales)
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [isSongFormOpen, setIsSongFormOpen] = useState(false);
  const [isSavingSong, setIsSavingSong] = useState(false);
  const [selectedDirectMessagePartner, setSelectedDirectMessagePartner] = useState<AppUser | null>(null);
  const [selectedProfileUser, setSelectedProfileUser] = useState<AppUser | null>(null);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  
  // Estado para ajustes
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<{id: string, name: string} | null>(null);
  const [passwordChangeData, setPasswordChangeData] = useState({ current: '', newPass: '', confirm: '' });
  const showChangePassword = useRef({ current: false, newPass: false, confirm: false });
  const [passwordChangeMsg, setPasswordChangeMsg] = useState<{text: string, type: 'success' | 'error'} | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string, message: string, action: () => void, type: 'danger' | 'warning' } | null>(null);
  
  // Estado de filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('Todos');

  // Estado para deep linking
  const [sharedSongId, setSharedSongId] = useState<string | null>(null);
  const [sharedImportUrl, setSharedImportUrl] = useState<string | null>(null);
  
  // --- Efectos y Lógica ---
  useEffect(() => {
    let dataListeners: Unsubscribe[] = [];

    const authUnsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      // Limpiar listeners de datos anteriores al cambiar el estado de autenticación
      dataListeners.forEach(unsubscribe => unsubscribe());
      dataListeners = [];

      if (firebaseUser) {
        // --- Usuario Autenticado ---

        // Listener para el documento del usuario actual
        const userDocUnsubscribe = onSnapshot(doc(db, 'users', firebaseUser.uid), 
          (userDoc) => {
            if (userDoc.exists()) {
              const userData = userDoc.data();
              const appUser: AppUser = {
                id: firebaseUser.uid,
                username: userData.username || firebaseUser.displayName || 'Usuario',
                username_lowercase: (userData.username || firebaseUser.displayName || 'usuario').toLowerCase(),
                email: firebaseUser.email || '',
                role: userData.role || 'member',
                photoURL: userData.photoURL || firebaseUser.photoURL,
                favorites: userData.favorites || [],
                biography: userData.biography || '',
                createdAt: userData.createdAt,
                hasPasswordProvider: firebaseUser.providerData.some(p => p.providerId === 'password'),
                hasGoogleProvider: firebaseUser.providerData.some(p => p.providerId === 'google.com'),
                validated: userData.validated,
                profileValidated: userData.profileValidated,
              };
              setUser(appUser);
            } else {
              signOut(auth);
            }
            setIsLoading(false);
          },
          (error) => {
            console.error("Error al obtener el documento del usuario:", error);
            signOut(auth);
            setIsLoading(false);
          }
        );
        dataListeners.push(userDocUnsubscribe);

        // Listeners para datos de la aplicación
        dataListeners.push(onSnapshot(collection(db, 'songs'), snap => setSongs(snap.docs.map(d => ({ ...d.data(), id: d.id } as Song)))));
        dataListeners.push(onSnapshot(collection(db, 'song_categories'), snap => setCategories(snap.docs.map(d => ({ ...d.data(), id: d.id })))));
        dataListeners.push(onSnapshot(query(collection(db, 'users'), where('profileValidated', '==', true)), snap => setAllValidatedUsers(snap.docs.map(d => ({ ...d.data(), id: d.id } as AppUser)))));
        dataListeners.push(onSnapshot(query(collection(db, 'users'), where('role', '==', 'admin')), snap => setAdminUsers(snap.docs.map(d => ({ ...d.data(), id: d.id } as AppUser)))));
        
        // Listeners de Realtime Database
        dataListeners.push(onValue(ref(rtdb, 'status'), snap => setOnlineStatuses(snap.val() || {})));
        dataListeners.push(onValue(ref(rtdb, 'typing'), snap => setTypingStatuses(snap.val() || {})));

        // Listener para la lista de chats del usuario
        const userChatsQuery = query(collection(db, 'user_chats', firebaseUser.uid, 'chats'));
        const userChatsUnsubscribe = onSnapshot(userChatsQuery, (snapshot) => {
            const chats: ChatInfo[] = [];
            let unreadCount = 0;
            snapshot.forEach(doc => {
                const data = doc.data() as ChatInfo;
                chats.push(data);
                unreadCount += data.unreadCount || 0;
            });
            setUserChats(chats);
            setTotalUnreadCount(unreadCount);
        });
        dataListeners.push(userChatsUnsubscribe);


        // Gestión de presencia
        const presenceRef = ref(rtdb, `.info/connected`);
        const userStatusRef = ref(rtdb, `/status/${firebaseUser.uid}`);
        const presenceUnsubscribe = onValue(presenceRef, (snap) => {
            if (snap.val() === true) {
                set(userStatusRef, { state: 'online', last_changed: serverTimestamp() });
                onDisconnect(userStatusRef).set({ state: 'offline', last_changed: serverTimestamp() });
            }
        });
        dataListeners.push(presenceUnsubscribe);

      } else {
        // --- Usuario No Autenticado ---
        setUser(null);
        setIsLoading(false);
      }
    });

    // Limpieza al desmontar el componente
    return () => {
      authUnsubscribe();
      dataListeners.forEach(unsubscribe => unsubscribe());
    };
}, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setAuthMsg(null);
    const { user: username, email, pass, confirmPass } = authData;

    try {
        if (authMode === 'login') {
            await signInWithEmailAndPassword(auth, email, pass);
        } else if (authMode === 'register') {
            if (pass !== confirmPass) throw { code: 'auth/pass-mismatch', message: "Las contraseñas no coinciden." };
            if (!username.trim()) throw { code: 'auth/username-empty', message: "El nombre de usuario no puede estar vacío." };

            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            await updateProfile(userCredential.user, { displayName: username });
            
            await setDoc(doc(db, 'users', userCredential.user.uid), {
                username,
                username_lowercase: username.toLowerCase(),
                email,
                role: 'member',
                createdAt: new Date().toISOString(),
                hasPasswordProvider: true,
                validated: false, 
                profileValidated: false
            });
        } else if (authMode === 'forgot') {
            await sendPasswordResetEmail(auth, email);
            setAuthMsg({ text: 'Se ha enviado un enlace de recuperación a tu correo.', type: 'success' });
        }
    } catch (error: any) {
        setAuthMsg({ text: translateAuthError(error.code), type: 'error' });
    } finally {
        setIsAuthenticating(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsAuthenticating(true);
    setAuthMsg(null);
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const gUser = result.user;
        const userDocRef = doc(db, 'users', gUser.uid);
        const userDoc = await getDoc(userDocRef);
        if (!userDoc.exists()) {
            await setDoc(userDocRef, {
                username: gUser.displayName,
                username_lowercase: gUser.displayName?.toLowerCase(),
                email: gUser.email,
                role: 'member',
                createdAt: new Date().toISOString(),
                photoURL: gUser.photoURL,
                hasGoogleProvider: true,
                validated: false,
                profileValidated: false
            });
        } else {
             await updateDoc(userDocRef, {
                hasGoogleProvider: true,
                photoURL: userDoc.data()?.photoURL || gUser.photoURL, // Preserve existing photo if user has one
             });
        }
    } catch (error: any) {
        setAuthMsg({ text: translateAuthError(error.code), type: 'error' });
    } finally {
        setIsAuthenticating(false);
    }
  };

  const openSongViewer = useCallback((song: Song) => {
    setSelectedSong(song);
    window.history.pushState({ overlay: 'song' }, '');
  }, []);
  
  const openSongEditor = useCallback((song: Song | null, importUrl?: string | null) => {
    setEditingSong(song);
    if (importUrl) {
      setSharedImportUrl(importUrl);
    }
    setIsSongFormOpen(true);
    window.history.pushState({ overlay: 'song-form' }, '');
  }, []);
    
  const toggleFavorite = async (e: React.MouseEvent, songId: string) => {
    e.stopPropagation();
    if (!user) return;
    triggerHapticFeedback('light');
    const userDocRef = doc(db, 'users', user.id);
    const isFavorite = user.favorites?.includes(songId);
    
    // Optimistic update
    setUser(prev => prev ? ({ ...prev, favorites: isFavorite ? prev.favorites?.filter(id => id !== songId) : [...(prev.favorites || []), songId] }) : null);

    await updateDoc(userDocRef, {
      favorites: isFavorite ? arrayRemove(songId) : arrayUnion(songId)
    });
  };

  const openDirectMessage = useCallback((partner: AppUser) => {
      setSelectedDirectMessagePartner(partner);
      window.history.pushState({ overlay: 'dm' }, '');
  }, []);

  const handleViewProfile = useCallback((userId: string) => {
      const userToView = allValidatedUsers.find(u => u.id === userId) || (user?.id === userId ? user : null);
      if(userToView) {
          setSelectedProfileUser(userToView);
          window.history.pushState({ overlay: 'profile' }, '');
      }
  }, [allValidatedUsers, user]);

  const handleJoinRoom = async (code?: string) => {
      const roomCode = (code || roomCodeInput).trim().toUpperCase();
      if (!roomCode || !user) return;
      setIsJoiningRoom(true);
      try {
          const q = query(collection(db, 'rooms'), where('code', '==', roomCode), limit(1));
          const querySnapshot = await getDocs(q);
          if (querySnapshot.empty) {
              alert("Sala no encontrada.");
          } else {
              const roomDoc = querySnapshot.docs[0];
              const roomData = roomDoc.data() as Room;

              if(roomData.banned?.includes(user.username)) {
                  alert("No puedes unirte a esta sala.");
                  return;
              }
              
              const roomRef = doc(db, 'rooms', roomDoc.id);
              await updateDoc(roomRef, { participants: arrayUnion(user.username) });
              
              const presenceRef = ref(rtdb, `rooms/${roomDoc.id}/participants/${user.username}`);
              await set(presenceRef, true);
              onDisconnect(presenceRef).remove();
              
              setActiveRoom({ ...roomData, id: roomDoc.id });
              window.history.pushState({ overlay: 'room' }, '');
          }
      } catch(e) {
          console.error("Error joining room:", e);
          alert("Error al unirse a la sala.");
      } finally {
          setIsJoiningRoom(false);
          setRoomCodeInput('');
      }
  };

  const handleJoinRoomFromInvite = (code: string) => {
    setView('room');
    handleJoinRoom(code);
  };

  const handleCreateRoom = async () => {
    if (!user || user.role !== 'admin') return;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newRoom: Omit<Room, 'id'> = {
      code,
      host: user.username,
      repertoire: [],
      participants: [user.username],
      createdAt: Date.now()
    };
    const docRef = await addDoc(collection(db, 'rooms'), newRoom);
    setActiveRoom({ ...newRoom, id: docRef.id });
     window.history.pushState({ overlay: 'room' }, '');
  };

  const handleUpdateRoom = async (roomId: string, updates: Partial<Room>) => {
    const roomDocRef = doc(db, 'rooms', roomId);
    await updateDoc(roomDocRef, updates);
  };

  const handleSaveSong = async (songData: Omit<Song, 'id' | 'createdAt' | 'audioUrl'>, audioAction: { blob: Blob | null, shouldDelete: boolean }) => {
    if (!user) return;
    setIsSavingSong(true);
    try {
        let audioUrl: string | undefined = editingSong?.audioUrl;

        // Handle audio deletion
        if (audioAction.shouldDelete && editingSong?.audioUrl) {
            const oldAudioRef = storageRef(storage, editingSong.audioUrl);
            await deleteObject(oldAudioRef).catch(e => console.warn("Old audio not found for deletion:", e));
            audioUrl = undefined;
        }

        // Handle audio upload
        if (audioAction.blob) {
            const songIdForAudio = editingSong?.id || doc(collection(db, 'songs')).id; // Use existing or generate new for path
            const filePath = `song_audio/${songIdForAudio}`;
            const audioFileRef = storageRef(storage, filePath);
            await uploadBytes(audioFileRef, audioAction.blob);
            audioUrl = await getDownloadURL(audioFileRef);
        }

        const finalSongData = { ...songData, audioUrl };

        if (editingSong) { // Update existing song
            await updateDoc(doc(db, 'songs', editingSong.id), finalSongData);
        } else { // Create new song
            await addDoc(collection(db, 'songs'), {
                ...finalSongData,
                createdAt: Date.now(),
                author: user.username // Ensure author is current user on creation
            });
        }
        setIsSongFormOpen(false);
        setEditingSong(null);
        window.history.back();
    } catch (error) {
        console.error("Error saving song:", error);
        alert("Error al guardar la música.");
    } finally {
        setIsSavingSong(false);
    }
  };

  const handleDeleteRequest = (songId: string) => {
    setConfirmModal({
        title: "Eliminar Música",
        message: "¿Estás seguro? Esta acción es permanente.",
        action: () => {
            handleDeleteSong(songId);
            setConfirmModal(null);
        },
        type: 'danger'
    });
  };

  const handleDeleteSong = async (songId: string) => {
    try {
        await deleteDoc(doc(db, 'songs', songId));
        setSelectedSong(null);
        window.history.back();
    } catch (e) {
        console.error("Error deleting song:", e);
        alert("Error al eliminar la canción.");
    }
  };
  
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    await addDoc(collection(db, 'categories'), { name: newCategoryName });
    setNewCategoryName('');
  };

  const handleSaveCategoryEdit = async () => {
    if (!editingCategory) return;
    await updateDoc(doc(db, 'categories', editingCategory.id), { name: editingCategory.name });
    setEditingCategory(null);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    await deleteDoc(doc(db, 'categories', categoryId));
  };
  
  const toggleShowChangePassword = (field: 'current' | 'newPass' | 'confirm') => {
      showChangePassword.current[field] = !showChangePassword.current[field];
      // Force re-render by creating a new object
      setPasswordChangeData(prev => ({...prev}));
  };
  
  const handleChangePassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) return;
      const { current, newPass, confirm } = passwordChangeData;
      if (newPass !== confirm) {
          setPasswordChangeMsg({ text: "Las contraseñas nuevas no coinciden.", type: 'error' });
          return;
      }
      setIsUpdatingPassword(true);
      try {
          const credential = EmailAuthProvider.credential(user.email!, current);
          await reauthenticateWithCredential(auth.currentUser!, credential);
          await updatePassword(auth.currentUser!, newPass);
          setPasswordChangeMsg({ text: "Contraseña actualizada con éxito.", type: 'success' });
          setPasswordChangeData({ current: '', newPass: '', confirm: '' });
      } catch (error: any) {
          setPasswordChangeMsg({ text: translatePasswordChangeError(error.code), type: 'error' });
      } finally {
          setIsUpdatingPassword(false);
      }
  };

  const handleLinkGoogleAccount = async () => {
      if(!auth.currentUser) return;
      setIsLinkingGoogle(true);
      const provider = new GoogleAuthProvider();
      try {
        await linkWithPopup(auth.currentUser, provider);
        await updateDoc(doc(db, 'users', auth.currentUser.uid), { hasGoogleProvider: true });
        alert("Cuenta de Google vinculada con éxito.");
      } catch (error: any) {
        alert(`Error al vincular: ${translateAuthError(error.code)}`);
      } finally {
        setIsLinkingGoogle(false);
      }
  };
  
  const handleAddAdmin = async (email: string) => {
    const q = query(collection(db, 'users'), where('email', '==', email), limit(1));
    const userSnapshot = await getDocs(q);
    if (!userSnapshot.empty) {
        const userDoc = userSnapshot.docs[0];
        await updateDoc(doc(db, 'users', userDoc.id), { role: 'admin' });
    } else {
        alert("Usuario no encontrado.");
    }
  };

  const handleRevokeAdmin = async (adminUser: AppUser) => {
    await updateDoc(doc(db, 'users', adminUser.id), { role: 'member' });
  };
  
  const handleSignOut = () => {
    if (activeRoom && user) {
        const presenceRef = ref(rtdb, `rooms/${activeRoom.id}/participants/${user.username}`);
        removeRtdb(presenceRef);
    }
    signOut(auth);
    setActiveRoom(null);
  };
  
  const handleDeleteAccountRequest = () => {
    setConfirmModal({
        title: "Eliminar Cuenta",
        message: "¿Seguro que quieres eliminar tu cuenta? Todos tus datos se borrarán permanentemente.",
        action: async () => {
            const password = prompt("Para confirmar, ingresa tu contraseña:");
            if(password && auth.currentUser && auth.currentUser.email) {
                try {
                    const credential = EmailAuthProvider.credential(auth.currentUser.email, password);
                    await reauthenticateWithCredential(auth.currentUser, credential);
                    await deleteUser(auth.currentUser);
                    setConfirmModal(null);
                } catch (e: any) {
                    alert(`Error: ${translateAuthError(e.code)}`);
                    setConfirmModal(null);
                }
            } else {
                alert("Se requiere contraseña.");
                setConfirmModal(null);
            }
        },
        type: 'danger'
    });
  };

  const handleSaveBio = async (newBio: string) => {
      if(!user) return;
      await updateDoc(doc(db, 'users', user.id), { biography: newBio });
  };
  
  const handleUpdateUsername = async (newUsername: string, password_confirmation: string) => {
      if (!user?.email) return;
      const credential = EmailAuthProvider.credential(user.email, password_confirmation);
      try {
        await reauthenticateWithCredential(auth.currentUser!, credential);
        await updateProfile(auth.currentUser!, { displayName: newUsername });
        await updateDoc(doc(db, 'users', user.id), { username: newUsername, username_lowercase: newUsername.toLowerCase() });
      } catch (e: any) {
        alert(`Error: ${translateAuthError(e.code)}`);
        throw e; // Re-throw to be caught in the component
      }
  };

  const navigateTo = (newView: AppView, direction?: AnimationDirection) => {
    const currentIndex = VIEW_ORDER.indexOf(view);
    const newIndex = VIEW_ORDER.indexOf(newView);
    const animDir = direction || (newIndex > currentIndex ? 'left' : 'right');
    
    setAnimationDirection(animDir);
    setView(newView);
  };
  
  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem('theme', t);
  };

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') as Theme | null;
    if (storedTheme) setThemeState(storedTheme);
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if ((localStorage.getItem('theme') || 'system') === 'system') {
        setThemeState('system'); // Re-trigger memo
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
  
  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);
  
  // ... (El resto del código de App.tsx permanece igual)

  // ... (Auth handlers, data fetching effects, etc.)

  return (
    <AudioPlayerProvider>
      <div className="h-full w-full">
        {!isLoading && user ? (
          <>
            <MainView
              user={user}
              view={view}
              darkMode={darkMode}
              theme={theme}
              setTheme={setTheme}
              isAdmin={user.role === 'admin'}
              isSuperAdmin={user.email === SUPER_ADMIN_EMAIL}
              animationDirection={animationDirection}
              navigateTo={navigateTo}
              totalUnreadCount={totalUnreadCount}
              songs={songs}
              favorites={user.favorites || []}
              openSongViewer={openSongViewer}
              toggleFavorite={toggleFavorite}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              categories={categories}
              userChats={userChats}
              allValidatedUsers={allValidatedUsers}
              onlineStatuses={onlineStatuses}
              openDirectMessage={openDirectMessage}
              onViewProfile={handleViewProfile}
              typingStatuses={typingStatuses}
              roomCodeInput={roomCodeInput}
              setRoomCodeInput={setRoomCodeInput}
              handleJoinRoom={handleJoinRoom}
              handleCreateRoom={handleCreateRoom}
              isJoiningRoom={isJoiningRoom}
              newCategoryName={newCategoryName}
              setNewCategoryName={setNewCategoryName}
              onAddCategory={handleAddCategory}
              editingCategory={editingCategory}
              setEditingCategory={setEditingCategory}
              onSaveEditCategory={handleSaveCategoryEdit}
              handleDeleteCategory={handleDeleteCategory}
              setCategoryConfirmModal={setConfirmModal}
              passwordChangeData={passwordChangeData}
              setPasswordChangeData={setPasswordChangeData}
              showChangePassword={showChangePassword}
              toggleShowChangePassword={toggleShowChangePassword}
              passwordChangeMsg={passwordChangeMsg}
              isUpdatingPassword={isUpdatingPassword}
              handleChangePassword={handleChangePassword}
              isLinkingGoogle={isLinkingGoogle}
              handleLinkGoogleAccount={handleLinkGoogleAccount}
              adminUsers={adminUsers}
              handleAddAdmin={handleAddAdmin}
              handleRevokeAdmin={handleRevokeAdmin}
              handleSignOut={handleSignOut}
              openSongEditor={openSongEditor}
              onDeleteAccountRequest={handleDeleteAccountRequest}
              sharedImportUrl={sharedImportUrl}
            />
            {activeRoom && <RoomView 
              room={activeRoom} 
              songs={songs} 
              currentUser={user} 
              isAdmin={user.role === 'admin'} 
              onExitRequest={() => setActiveRoom(null)} 
              onUpdateRoom={handleUpdateRoom} 
              darkMode={darkMode} 
              db={db} 
              rtdb={rtdb} 
              onEditSong={openSongEditor} 
              onDeleteSong={handleDeleteSong} 
              categories={categories.map(c => c.name)} 
              allUsers={allValidatedUsers} 
              onViewProfile={handleViewProfile} 
            />}
            {selectedSong && !activeRoom && <SongViewer 
              song={selectedSong} 
              onBack={() => {setSelectedSong(null); window.history.back();}} 
              onEdit={user.role === 'admin' ? () => openSongEditor(selectedSong) : undefined} 
              onDelete={user.role === 'admin' ? () => handleDeleteRequest(selectedSong.id) : undefined} 
              darkMode={darkMode} 
            />}
            {isSongFormOpen && <SongForm 
              initialData={editingSong || undefined} 
              onSave={handleSaveSong} 
              onCancel={() => {setIsSongFormOpen(false); setEditingSong(null); setSharedImportUrl(null); window.history.back();}} 
              darkMode={darkMode} 
              categories={categories.map(c => c.name)} 
              initialImportUrl={sharedImportUrl} 
              currentUser={user} 
              isSaving={isSavingSong} 
            />}
            
            {selectedDirectMessagePartner && user && (
                <DirectMessageView
                    key={generateChatId(user.id, selectedDirectMessagePartner.id)}
                    currentUser={user}
                    partner={selectedDirectMessagePartner}
                    onBack={() => {
                        setSelectedDirectMessagePartner(null);
                        window.history.back(); // Go back from DM view
                    }}
                    db={db}
                    rtdb={rtdb}
                    storage={storage}
                    darkMode={darkMode}
                    partnerStatus={onlineStatuses[selectedDirectMessagePartner.id]}
                    onViewProfile={handleViewProfile}
                    onJoinRoom={handleJoinRoomFromInvite}
                    songs={songs}
                    onOpenSong={(songId) => {
                        const songToOpen = songs.find(s => s.id === songId);
                        if (songToOpen) openSongViewer(songToOpen);
                    }}
                />
            )}

            {selectedProfileUser && user && <UserProfileView 
              user={selectedProfileUser} 
              currentUser={user} 
              onBack={() => {setSelectedProfileUser(null); window.history.back();}} 
              onSaveBio={handleSaveBio} 
              songs={songs} 
              onOpenSong={openSongViewer} 
              darkMode={darkMode} 
              onUpdateUsername={user.id === selectedProfileUser.id ? handleUpdateUsername : undefined} 
              onDeleteAccountRequest={user.id === selectedProfileUser.id ? handleDeleteAccountRequest : undefined} 
              db={db} 
              storage={storage} 
            />}
            
            {confirmModal && <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 animate-in fade-in duration-200"><div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmModal(null)}></div><div className={`relative w-full max-w-sm p-6 rounded-[2.5rem] shadow-2xl border animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-black border-white/10' : 'bg-white border-slate-100'}`}><h3 className={`text-center font-black text-lg uppercase mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{confirmModal.title}</h3><p className={`text-center text-xs font-bold mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{confirmModal.message}</p><div className="flex gap-3"><button onClick={() => setConfirmModal(null)} className={`flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-colors ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>Cancelar</button><button onClick={confirmModal.action} className={`flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-white shadow-lg active:scale-95 transition-transform ${confirmModal.type === 'danger' ? 'bg-misionero-rojo' : 'bg-misionero-azul'}`}>Confirmar</button></div></div></div>}
          </>
        ) : (
          <LoginView 
            handleAuthSubmit={handleAuthSubmit} 
            authData={authData} 
            setAuthData={setAuthData} 
            authMode={authMode} 
            setAuthMode={setAuthMode} 
            authMsg={authMsg} 
            isAuthenticating={isAuthenticating} 
            showPassword={showPassword} 
            setShowPassword={setShowPassword} 
            setAuthMsg={setAuthMsg} 
            handleGoogleSignIn={handleGoogleSignIn} 
          />
        )}
        {isLoading && <div className="fixed inset-0 z-[999] bg-slate-50 dark:bg-black flex items-center justify-center"><div className="w-12 h-12 border-4 border-misionero-azul/20 border-t-misionero-azul rounded-full animate-spin"></div></div>}
      </div>
    </AudioPlayerProvider>
  );
};

export default App;