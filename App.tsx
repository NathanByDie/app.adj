import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
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
  linkWithPopup
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
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
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getDatabase, ref, onValue, set, onDisconnect, serverTimestamp, update as updateRtdb } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

import { User as AppUser, Song, LiturgicalTime, Room, UserRole } from './types';
import { PlusIcon, UsersIcon } from './constants';
import SongForm from './components/SongForm';
import SongViewer from './components/SongViewer';
import RoomView from './components/RoomView';
import { triggerHapticFeedback } from './services/haptics';

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

setPersistence(auth, browserLocalPersistence).catch(err => console.error("Error de persistencia:", err));

type AppView = 'feed' | 'favorites' | 'room' | 'settings';
const VIEW_ORDER: AppView[] = ['feed', 'favorites', 'room', 'settings'];
type AnimationDirection = 'left' | 'right' | 'fade';
type Theme = 'light' | 'dark' | 'system';

const SUPER_ADMIN_EMAIL = 'biden.inf@gmail.com';

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
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
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
            <button onClick={(e) => toggleFavorite(e, song.id)} className={`absolute top-3 right-3 z-20 p-2 transition-colors ${favorites.includes(song.id) ? 'text-misionero-rojo' : `${darkMode ? 'text-white/30 hover:text-white/60' : 'text-black/20 hover:text-black/50'}`}`}>
              <svg className="w-5 h-5" fill={favorites.includes(song.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
            </button>
            <div className="p-4">
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
            <button onClick={(e) => toggleFavorite(e, song.id)} className={`absolute top-3 right-3 z-20 p-2 transition-colors ${favorites.includes(song.id) ? 'text-misionero-rojo' : `${darkMode ? 'text-white/30 hover:text-white/60' : 'text-black/20 hover:text-black/50'}`}`}>
              <svg className="w-5 h-5" fill={favorites.includes(song.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
            </button>
            <div className="p-4">
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
        <button onClick={handleJoinRoom} className="w-full glass-ui glass-interactive bg-misionero-azul/70 text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-widest active:scale-95 transition-all">UNIRME</button>
        {isAdmin && <button onClick={handleCreateRoom} className="w-full glass-ui glass-interactive bg-misionero-verde/30 text-misionero-verde font-black py-4 rounded-2xl uppercase text-[10px] tracking-widest active:scale-95 transition-all">CREAR SALA</button>}
    </div>
);

const SettingsView = ({ 
    darkMode, theme, setTheme, isAdmin, isSuperAdmin, categories, newCategoryName, setNewCategoryName, onAddCategory, 
    editingCategory, setEditingCategory, onSaveEditCategory, handleDeleteCategory, newUsername, setNewUsername, 
    showUsernamePass, setShowUsernamePass, usernameChangePassword, setUsernameChangePassword, isUpdatingUsername, 
    handleUpdateUsername, passwordChangeData, setPasswordChangeData, showChangePassword, toggleShowChangePassword, 
    passwordChangeMsg, isUpdatingPassword, handleChangePassword, setCategoryConfirmModal, canLinkGoogle, onLinkGoogle, 
    isLinkingGoogle, adminUsers, onAddAdmin, onRevokeAdmin 
}: any) => {
    
    const [newAdminEmail, setNewAdminEmail] = useState('');

    const EditIcon = ({ className }: { className?: string }) => (
      <svg className={className || "w-3 h-3"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    );

    return (
    <div className="w-full h-full overflow-y-auto custom-scroll px-6 py-4 pb-48 grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-8">
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
           <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Perfil</h3>
           <div className="glass-ui p-6 rounded-[2.5rem] space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[8px] font-black uppercase text-slate-400">Nombre de Usuario</span>
                </div>
                <input type="text" className={`w-full glass-ui rounded-2xl px-4 py-4 text-sm font-bold outline-none ${darkMode ? 'bg-slate-800/50' : 'bg-white/50'}`} value={newUsername} onChange={e => setNewUsername(e.target.value)} />
                
                <div className="relative mt-3">
                    <input 
                        type={showUsernamePass ? 'text' : 'password'} 
                        placeholder="Confirma con tu contraseña" 
                        className={`w-full glass-ui rounded-2xl px-4 py-4 text-sm font-bold outline-none placeholder:text-slate-400/50 ${darkMode ? 'bg-slate-800/50' : 'bg-white/50'}`} 
                        value={usernameChangePassword} 
                        onChange={e => setUsernameChangePassword(e.target.value)} 
                    />
                     <button type="button" onClick={() => setShowUsernamePass(!showUsernamePass)} className={`absolute inset-y-0 right-0 flex items-center pr-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{showUsernamePass ? <EyeOffIcon/> : <EyeIcon/>}</button>
                </div>

                <button onClick={handleUpdateUsername} disabled={isUpdatingUsername || !usernameChangePassword} className="w-full mt-3 glass-ui glass-interactive bg-misionero-azul/70 text-white font-black py-4 rounded-2xl text-[9px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50">{isUpdatingUsername ? 'Verificando...' : 'Guardar Cambios'}</button>
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
                  <input type={showChangePassword.current ? 'text' : 'password'} placeholder="Contraseña Actual" value={passwordChangeData.current} onChange={e => setPasswordChangeData(p => ({...p, current: e.target.value}))} required className={`w-full glass-ui rounded-2xl px-4 py-4 text-sm font-bold outline-none ${darkMode ? 'bg-slate-800/50' : 'bg-white/50'}`} />
                  <button type="button" onClick={() => toggleShowChangePassword('current')} className={`absolute inset-y-0 right-0 flex items-center pr-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{showChangePassword.current ? <EyeOffIcon/> : <EyeIcon/>}</button>
                </div>
                <div className="relative">
                  <input type={showChangePassword.newPass ? 'text' : 'password'} placeholder="Nueva Contraseña" value={passwordChangeData.newPass} onChange={e => setPasswordChangeData(p => ({...p, newPass: e.target.value}))} required className={`w-full glass-ui rounded-2xl px-4 py-4 text-sm font-bold outline-none ${darkMode ? 'bg-slate-800/50' : 'bg-white/50'}`} />
                  <button type="button" onClick={() => toggleShowChangePassword('newPass')} className={`absolute inset-y-0 right-0 flex items-center pr-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{showChangePassword.newPass ? <EyeOffIcon/> : <EyeIcon/>}</button>
                </div>
                <div className="relative">
                  <input type={showChangePassword.confirm ? 'text' : 'password'} placeholder="Confirmar" value={passwordChangeData.confirm} onChange={e => setPasswordChangeData(p => ({...p, confirm: e.target.value}))} required className={`w-full glass-ui rounded-2xl px-4 py-4 text-sm font-bold outline-none ${darkMode ? 'bg-slate-800/50' : 'bg-white/50'}`} />
                   <button type="button" onClick={() => toggleShowChangePassword('confirm')} className={`absolute inset-y-0 right-0 flex items-center pr-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{showChangePassword.confirm ? <EyeOffIcon/> : <EyeIcon/>}</button>
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
                      {categories.map((cat: {id: string, name: string}) => (
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
                              <button onClick={() => setCategoryConfirmModal({ title: 'Eliminar Categoría', message: `¿Seguro que quieres eliminar "${cat.name}"? Esta acción no se puede deshacer.`, action: () => { handleDeleteCategory(cat.id); setCategoryConfirmModal(null); }, type: 'danger' })} className={`p-1 rounded-md transition-colors ${darkMode ? 'hover:bg-red-500/10 text-red-400/70' : 'hover:bg-red-500/5 text-red-500/70'}`}>
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
  user, view, darkMode, theme, setTheme, isAdmin, isSuperAdmin, animationDirection, navigateTo,
  // Props para todas las vistas
  songs, favorites, openSongViewer, toggleFavorite,
  searchQuery, setSearchQuery, activeFilter, setActiveFilter, categories,
  // Props para Sala
  roomCodeInput, setRoomCodeInput, handleJoinRoom, handleCreateRoom, isJoiningRoom,
  // Props para Ajustes
  handleCreateCategory, handleDeleteCategory, handleEditCategory, setCategoryConfirmModal,
  newUsername, setNewUsername, showUsernamePass, setShowUsernamePass, usernameChangePassword, setUsernameChangePassword, isUpdatingUsername, handleUpdateUsername,
  passwordChangeData, setPasswordChangeData, showChangePassword, toggleShowChangePassword, passwordChangeMsg, isUpdatingPassword, handleChangePassword,
  isLinkingGoogle, handleLinkGoogleAccount, adminUsers, handleAddAdmin, handleRevokeAdmin, handleSignOut, openSongEditor
}: any) => {
  
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<{id: string, name: string} | null>(null);
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
          if (deltaX < 0 && currentIndex < VIEW_ORDER.length - 1) { // Swipe Izquierda
              navigateTo(VIEW_ORDER[currentIndex + 1], 'left');
          } else if (deltaX > 0 && currentIndex > 0) { // Swipe Derecha
              navigateTo(VIEW_ORDER[currentIndex - 1], 'right');
          }
      }
      touchStartCoords.current = null;
  };


  const onAddCategory = () => {
    if(newCategoryName.trim()) {
        handleCreateCategory(newCategoryName.trim());
        setNewCategoryName('');
    }
  };

  const onSaveEditCategory = () => {
      if(editingCategory && editingCategory.name.trim()) {
          handleEditCategory(editingCategory.id, editingCategory.name.trim());
          setEditingCategory(null);
      }
  };
  
  const categoryNames = useMemo(() => categories.map((c: any) => c.name), [categories]);
  const filteredSongs = useMemo(() => songs.filter((s: Song) => (s.title.toLowerCase().includes(searchQuery.toLowerCase()) || s.author.toLowerCase().includes(searchQuery.toLowerCase())) && (activeFilter === 'Todos' || s.category === activeFilter)).sort((a:Song, b:Song) => a.title.localeCompare(b.title)), [songs, searchQuery, activeFilter]);
  const favoriteSongs = useMemo(() => filteredSongs.filter((s: Song) => favorites.includes(s.id)), [filteredSongs, favorites]);

  const renderActiveView = () => {
      switch(view) {
          case 'feed':
              return <FeedView songs={filteredSongs} favorites={favorites} openSongViewer={openSongViewer} toggleFavorite={toggleFavorite} darkMode={darkMode} />;
          case 'favorites':
              return <FavoritesView songs={favoriteSongs} favorites={favorites} openSongViewer={openSongViewer} toggleFavorite={toggleFavorite} darkMode={darkMode} />;
          case 'room':
              return <RoomLobbyView roomCodeInput={roomCodeInput} setRoomCodeInput={setRoomCodeInput} handleJoinRoom={handleJoinRoom} handleCreateRoom={handleCreateRoom} isAdmin={isAdmin} isJoiningRoom={isJoiningRoom} />;
          case 'settings':
              return <SettingsView 
                        darkMode={darkMode} theme={theme} setTheme={setTheme} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin}
                        categories={categories} newCategoryName={newCategoryName} setNewCategoryName={setNewCategoryName} onAddCategory={onAddCategory} 
                        editingCategory={editingCategory} setEditingCategory={setEditingCategory} onSaveEditCategory={onSaveEditCategory} handleDeleteCategory={handleDeleteCategory}
                        newUsername={newUsername} setNewUsername={setNewUsername} showUsernamePass={showUsernamePass} setShowUsernamePass={setShowUsernamePass}
                        usernameChangePassword={usernameChangePassword} setUsernameChangePassword={setUsernameChangePassword} isUpdatingUsername={isUpdatingUsername} handleUpdateUsername={handleUpdateUsername}
                        passwordChangeData={passwordChangeData} setPasswordChangeData={setPasswordChangeData} showChangePassword={showChangePassword}
                        toggleShowChangePassword={toggleShowChangePassword} passwordChangeMsg={passwordChangeMsg} isUpdatingPassword={isUpdatingPassword} handleChangePassword={handleChangePassword}
                        setCategoryConfirmModal={setCategoryConfirmModal}
                        canLinkGoogle={user?.hasPasswordProvider && !user?.hasGoogleProvider}
                        onLinkGoogle={handleLinkGoogleAccount}
                        isLinkingGoogle={isLinkingGoogle}
                        adminUsers={adminUsers} onAddAdmin={handleAddAdmin} onRevokeAdmin={handleRevokeAdmin}
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
      <div className="md:pl-20 w-full flex flex-col">
        <header onTouchStart={(e) => e.stopPropagation()} className={`shrink-0 z-30 transition-colors duration-500 ${darkMode ? 'bg-black/80 backdrop-blur-sm' : 'bg-slate-50/80 backdrop-blur-sm'} border-b ${darkMode ? 'border-white/10' : 'border-slate-200'}`}>
          <div className="w-full max-w-7xl mx-auto px-4 pt-6 pb-3">
            <div className="flex justify-between items-center mb-3">
              <div>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] mb-0.5">ADJStudios</p>
                <h2 className="text-lg font-black tracking-tight">
                  {view === 'feed' ? `Hola, ${user.username}` : view === 'favorites' ? 'Mis Favoritos' : view === 'room' ? 'Sala en Vivo' : 'Ajustes'}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {view === 'feed' && isAdmin && (
                   <button onClick={() => openSongEditor(null)} className="hidden md:flex items-center gap-2 bg-misionero-rojo text-white px-4 py-2 rounded-xl font-black text-[9px] uppercase active:scale-95 transition-transform">
                      <PlusIcon /> <span>Añadir Música</span>
                   </button>
                )}
                {view === 'settings' && (
                  <button onClick={handleSignOut} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-misionero-rojo/10 text-misionero-rojo active:scale-95 transition-all">
                    <LogoutIcon />
                    <span className="text-[9px] font-black uppercase">Cerrar Sesión</span>
                  </button>
                )}
                {isAdmin && <span className="text-[7px] font-black bg-misionero-rojo text-white px-2 py-1 rounded-full uppercase animate-pulse">Admin</span>}
              </div>
            </div>
            {(view === 'feed' || view === 'favorites') && (
              <div className="space-y-3">
                <input type="text" placeholder="Buscar música..." className={`w-full glass-ui rounded-2xl px-4 py-2 text-xs font-bold outline-none ${darkMode ? 'text-white placeholder:text-slate-600' : 'text-slate-900 placeholder:text-slate-400'}`} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
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
    </div>
  );
};

const isValidUsername = (username: string): boolean => {
  // Must be between 3 and 24 characters, letters, accents and spaces allowed.
  const regex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ ]{3,24}$/;
  return regex.test(username) && username.trim().length >= 3;
};

const App: React.FC = () => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [view, setView] = useState<AppView>('feed');
  const [activeSong, setActiveSong] = useState<Song | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [editingSong, setEditingSong] = useState<Song | boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme | null) || 'system');
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('Todos');
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [authData, setAuthData] = useState({ user: '', email: '', pass: '', confirmPass: '' });
  const [authMsg, setAuthMsg] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [usernameChangePassword, setUsernameChangePassword] = useState('');
  const [showUsernamePass, setShowUsernamePass] = useState(false);
  
  const [passwordChangeData, setPasswordChangeData] = useState({ current: '', newPass: '', confirm: '' });
  const [passwordChangeMsg, setPasswordChangeMsg] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState({ current: false, newPass: false, confirm: false });

  const [showOpenInAppButton, setShowOpenInAppButton] = useState(false);
  const [connectionKey, setConnectionKey] = useState(0);
  const [globalAlert, setGlobalAlert] = useState<{ title: string, message: string, type: 'error' | 'success' | 'info' } | null>(null);
  const [animationDirection, setAnimationDirection] = useState<AnimationDirection>('fade');
  const [categoryConfirmModal, setCategoryConfirmModal] = useState<{ title: string, message: string, action: () => void, type: 'danger' | 'warning' } | null>(null);

  const [showProfileUpdateModal, setShowProfileUpdateModal] = useState(false);
  const [profileUpdateData, setProfileUpdateData] = useState({ username: '', email: '', password: '' });
  const [profileUpdateError, setProfileUpdateError] = useState<string | null>(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileUpdateReason, setProfileUpdateReason] = useState<'invalid_name' | 'missing_data' | null>(null);
  const [showUpdatePassword, setShowUpdatePassword] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState<any>(null);
  const isExitingApp = useRef(false);
  const [adminUsers, setAdminUsers] = useState<AppUser[]>([]);

  const darkMode = useMemo(() => {
    if (theme === 'system') return systemPrefersDark;
    return theme === 'dark';
  }, [theme, systemPrefersDark]);

  const categoryNames = useMemo(() => categories.map(c => c.name), [categories]);

  const toggleShowChangePassword = (field: 'current' | 'newPass' | 'confirm') => {
    setShowChangePassword(prev => ({ ...prev, [field]: !prev[field] }));
  };
  
  const toggleFavorite = async (e: React.MouseEvent, songId: string) => { e.stopPropagation(); if (user) await updateDoc(doc(db, "users", user.id), { favorites: favorites.includes(songId) ? arrayRemove(songId) : arrayUnion(songId) }); };
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setSystemPrefersDark(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme, darkMode]);

  useEffect(() => {
    if (!window.history.state) {
      window.history.replaceState({ view: 'feed' }, '', '');
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setConnectionKey(prev => prev + 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);
  
  const handleConfirmExit = useCallback(() => {
    isExitingApp.current = true;
    setShowExitConfirm(null);
    window.history.back();
  }, []);

  const navigateTo = useCallback((newView: AppView, dir?: 'left' | 'right') => {
    if (view === newView) return;
    
    let direction: AnimationDirection = 'fade';
    if (dir) {
        direction = dir;
    } else {
        const currentIndex = VIEW_ORDER.indexOf(view);
        const nextIndex = VIEW_ORDER.indexOf(newView);
        if (nextIndex > currentIndex) direction = 'left';
        if (nextIndex < currentIndex) direction = 'right';
    }
    
    setAnimationDirection(direction);
    window.history.pushState({ view: newView }, '', '');
    setView(newView);
}, [view]);

const goBack = useCallback(() => window.history.back(), []);

const handlePopState = useCallback((event: PopStateEvent) => {
    if (isExitingApp.current) return;

    if (activeRoom) {
        return;
    }
    
    if (editingSong) {
        setEditingSong(null);
        return;
    }
    if (activeSong) {
        setActiveSong(null);
        if (window.location.search.includes('song=')) {
            window.history.replaceState(null, '', window.location.pathname);
        }
        return;
    }

    if (event.state && event.state.view) {
        setView(event.state.view as AppView);
    } else {
        window.history.pushState({ view: 'feed' }, '', ''); // Previene la salida
        setShowExitConfirm({
            title: 'Salir de la App',
            message: '¿Estás seguro de que quieres salir?',
            action: handleConfirmExit,
        });
    }
}, [activeSong, activeRoom, editingSong, handleConfirmExit]);

useEffect(() => {
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
}, [handlePopState]);
  
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (user) {
            e.preventDefault();
            e.returnValue = '¿Estás seguro de que quieres salir?';
            return e.returnValue;
        }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user]);

  useEffect(() => {
    if (!activeRoom?.id) return;
    const unsubscribe = onSnapshot(doc(db, "rooms", activeRoom.id), async (docSnap) => {
      if (docSnap.exists()) {
        const roomData = docSnap.data();
        
        // Auto-Delete logic inside active session
        if (roomData.expiresAt && Date.now() > roomData.expiresAt) {
            if (user?.username === roomData.host) {
                try { await deleteDoc(doc(db, "rooms", activeRoom.id)); } catch(e) {}
            }
            setActiveRoom(null);
            setGlobalAlert({ title: "Tiempo Agotado", message: "La sala ha expirado y ha sido cerrada.", type: 'info' });
            return;
        }

        setActiveRoom(prev => ({ ...prev, ...roomData, id: docSnap.id } as Room));
      } else {
        setActiveRoom(null);
        setGlobalAlert({ title: "Sala Cerrada", message: "La sala ha sido cerrada por el servidor.", type: 'info' });
      }
    }, (error) => { console.error("Error en listener de sala:", error); });
    return () => unsubscribe();
  }, [activeRoom?.id, connectionKey, user?.username]); // added user?.username dependency

  useEffect(() => {
      if (!user) return;
      const q = query(collection(db, "song_categories"), orderBy("name"));
      const unsubscribe = onSnapshot(q, async (snapshot) => {
          if (snapshot.empty) {
              try {
                  const batch = writeBatch(db);
                  Object.values(LiturgicalTime).forEach(catName => {
                      const ref = doc(collection(db, "song_categories"));
                      batch.set(ref, { name: catName });
                  });
                  await batch.commit();
              } catch (e) {
                  console.error("Error seeding categories:", e);
              }
          } else {
              setCategories(snapshot.docs.map(d => ({ id: d.id, name: d.data().name })));
          }
      }, (error) => {
          console.error("Error subscribing to categories:", error);
      });
      return () => unsubscribe();
  }, [user]);

  const handleCreateCategory = async (name: string) => {
      if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        setGlobalAlert({ title: "Duplicado", message: "Esa categoría ya existe.", type: 'error' });
        return;
      }
      try {
        await addDoc(collection(db, "song_categories"), { name });
        setGlobalAlert({ title: "Éxito", message: `Categoría "${name}" creada.`, type: 'success' });
      } catch (e) {
        console.error("Error creating category:", e);
        setGlobalAlert({ title: "Error", message: "No se pudo crear la categoría.", type: 'error' });
      }
  };

  const handleDeleteCategory = async (categoryId: string) => {
      try {
        await deleteDoc(doc(db, "song_categories", categoryId));
        setGlobalAlert({ title: "Éxito", message: "Categoría eliminada.", type: 'success' });
      } catch(e) {
        console.error("Error deleting category:", e);
        setGlobalAlert({ title: "Error", message: "No se pudo eliminar la categoría.", type: 'error' });
      }
  };

  const handleEditCategory = async (categoryId: string, newName: string) => {
      if (categories.some(c => c.name.toLowerCase() === newName.toLowerCase() && c.id !== categoryId)) {
          setGlobalAlert({ title: "Error", message: "Esa categoría ya existe.", type: "error"});
          return;
      }
      try {
        await updateDoc(doc(db, "song_categories", categoryId), { name: newName });
        setGlobalAlert({ title: "Éxito", message: `Categoría renombrada a "${newName}".`, type: 'success' });
      } catch(e) {
        console.error("Error editing category:", e);
        setGlobalAlert({ title: "Error", message: "No se pudo editar la categoría.", type: 'error' });
      }
  };

  const openSongViewer = (song: Song) => { setActiveSong(song); window.history.pushState({ overlay: 'song' }, '', ''); };
  const openSongEditor = (song: Song | null) => { setEditingSong(song || true); window.history.pushState({ overlay: 'editor' }, '', ''); };

  const performDeleteSong = useCallback(async (songId: string) => {
    try {
        await deleteDoc(doc(db, "songs", songId));
        setGlobalAlert({ title: "Éxito", message: "La canción ha sido eliminada permanentemente.", type: 'success' });
    } catch (err) {
        console.error("Error deleting song document:", err);
        setGlobalAlert({ title: "Error", message: "Error al eliminar la canción.", type: 'error' });
    }
  }, []);


  const handleDeleteSong = (song: Song | null) => {
      if (!song) return;
      setCategoryConfirmModal({
          title: 'Eliminar Canción',
          message: `¿Seguro que quieres eliminar "${song.title}"? Esta acción no se puede deshacer.`,
          type: 'danger',
          action: async () => {
              setCategoryConfirmModal(null);
              await performDeleteSong(song.id);
              if (activeSong && activeSong.id === song.id) {
                  goBack();
              }
          }
      });
  };

  const enterRoom = (room: Room) => { setActiveRoom(room); window.history.pushState({ overlay: 'room' }, '', ''); };
  
  const exitRoom = useCallback(() => {
    if (activeRoom && user) {
      updateDoc(doc(db, "rooms", activeRoom.id), {
        participants: arrayRemove(user.username),
      });
    }
    setActiveRoom(null);
    goBack();
  }, [activeRoom, user, goBack]);
  
  const handleCreateRoom = async () => {
    if (!user) return;
    setIsJoiningRoom(true);
    try {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const now = Date.now();
        const newRoom = { code, host: user.username, repertoire: [], participants: [user.username], createdAt: now, expiresAt: now + (24 * 60 * 60 * 1000) };
        const docRef = await addDoc(collection(db, "rooms"), newRoom);
        enterRoom({ id: docRef.id, ...newRoom } as Room);
    } catch (error) { setGlobalAlert({ title: "Error", message: "Error al crear la sala.", type: 'error' }); } finally { setIsJoiningRoom(false); }
  };

  const handleJoinRoom = async () => {
    if (!roomCodeInput || !user) return;
    setIsJoiningRoom(true);
    try {
        const q = query(collection(db, "rooms"), where("code", "==", roomCodeInput.toUpperCase()));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const roomDoc = snap.docs[0];
          const roomData = { id: roomDoc.id, ...roomDoc.data() } as Room;
          
          if (roomData.expiresAt && Date.now() > roomData.expiresAt) { 
              // Try to delete expired room on access attempt
              try {
                  await deleteDoc(doc(db, "rooms", roomDoc.id));
                  setGlobalAlert({ title: "SALA EXPIRADA", message: "El código ha vencido y la sala ha sido eliminada.", type: 'info' }); 
              } catch(err) {
                  // Fallback if permission denied
                  setGlobalAlert({ title: "CÓDIGO VENCIDO", message: "El código de esta sala ha expirado.", type: 'error' }); 
              }
              setIsJoiningRoom(false);
              return; 
          }

          if (roomData.banned?.includes(user.username)) { setGlobalAlert({ title: "ACCESO DENEGADO", message: "Has sido bloqueado de esta sala.", type: 'error' }); setIsJoiningRoom(false); return; }
          await updateDoc(doc(db, "rooms", roomDoc.id), { participants: arrayUnion(user.username) });
          enterRoom({ ...roomData, participants: [...new Set([...(roomData.participants || []), user.username])] });
        } else { setGlobalAlert({ title: "SALA NO ENCONTRADA", message: "Verifica el código.", type: 'info' }); }
    } catch (error) { setGlobalAlert({ title: "Error", message: "Ocurrió un error al intentar unirse.", type: 'error' }); } finally { setIsJoiningRoom(false); }
  };
  
  const handleUpdateRoom = useCallback(async (roomId: string, updates: Partial<Room>) => {
    if (roomId) {
      try {
        await updateDoc(doc(db, "rooms", roomId), updates);
      } catch (error) {
        console.error("Error updating room:", error);
        setGlobalAlert({ title: "Error de Sala", message: "No se pudo actualizar la sala.", type: 'error' });
      }
    }
  }, []);

  const handleSaveSong = useCallback(async (data: Omit<Song, 'id' | 'createdAt' | 'author'>) => {
    try {
        if (typeof editingSong !== 'boolean' && editingSong) {
            await updateDoc(doc(db, "songs", editingSong.id), data);
        } else if (user) {
            await addDoc(collection(db, "songs"), { ...data, createdAt: Date.now(), author: user.username });
        }
        goBack();
    } catch (error) {
        console.error("Error saving song:", error);
        setGlobalAlert({ title: "Error", message: "No se pudo guardar la canción.", type: 'error' });
    }
  }, [editingSong, user, goBack]);

  const isSuperAdmin = useMemo(() => user?.email === SUPER_ADMIN_EMAIL, [user]);
  const isAdmin = useMemo(() => {
    if (!user) return false;
    return user.role === 'admin' || isSuperAdmin;
  }, [user, isSuperAdmin]);

  const hasElevatedPermissions = useMemo(() => isAdmin, [isAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) {
        setAdminUsers([]);
        return;
    }
    const q = query(collection(db, "users"), where("role", "==", "admin"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const admins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser));
        setAdminUsers(admins);
    });
    return () => unsubscribe();
  }, [isSuperAdmin]);

  const handleAddAdmin = async (email: string) => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return;
    const q = query(collection(db, "users"), where("email", "==", trimmedEmail), limit(1));
    try {
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            setGlobalAlert({ title: "Error", message: "Usuario no encontrado con ese correo.", type: 'error' });
            return;
        }
        const userDoc = snapshot.docs[0];
        if (userDoc.data().role === 'admin') {
            setGlobalAlert({ title: "Información", message: `${userDoc.data().username} ya es administrador.`, type: 'info' });
            return;
        }
        await updateDoc(doc(db, "users", userDoc.id), { role: 'admin' });
        setGlobalAlert({ title: "Éxito", message: `${userDoc.data().username} ahora es administrador.`, type: 'success' });
    } catch (e) {
        console.error("Error adding admin:", e);
        setGlobalAlert({ title: "Error", message: "No se pudo asignar el rol.", type: 'error' });
    }
  };

  const handleRevokeAdmin = async (adminUser: AppUser) => {
      if (adminUser.email === SUPER_ADMIN_EMAIL) {
          setGlobalAlert({ title: "Acción no permitida", message: "No se puede revocar el rol del super administrador.", type: 'info' });
          return;
      }
      try {
          await updateDoc(doc(db, "users", adminUser.id), { role: 'member' });
          setGlobalAlert({ title: "Éxito", message: `Se revocó el rol de administrador para ${adminUser.username}.`, type: 'success' });
      } catch (e) {
          console.error("Error revoking admin:", e);
          setGlobalAlert({ title: "Error", message: "No se pudo revocar el rol.", type: 'error' });
      }
  };
  
  const handleOpenInApp = () => {
    const songId = new URLSearchParams(window.location.search).get('song');
    if (!songId) return;
    const appUrl = window.location.href; 
    const fallbackUrl = encodeURIComponent(`https://play.google.com/store/apps/details?id=co.median.android.dyynjol`);
    const intentUri = appUrl.replace(/^https:\/\//, 'intent://');
    const intentString = `${intentUri}#Intent;scheme=https;package=co.median.android.dyynjol;S.browser_fallback_url=${fallbackUrl};end`;
    window.location.href = intentString;
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedSongId = urlParams.get('song');
    if (sharedSongId && /Android/i.test(navigator.userAgent)) {
      setShowOpenInAppButton(true);
    }
    if (songs.length > 0 && !activeSong && !activeRoom && !editingSong && sharedSongId) {
      const sharedSong = songs.find(s => s.id === sharedSongId);
      if (sharedSong) openSongViewer(sharedSong);
    }
  }, [songs]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMsg(null);
    setIsAuthenticating(true);
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, authData.email, authData.pass);
      } else if (authMode === 'register') {
        if (authData.pass !== authData.confirmPass) { 
            setAuthMsg({ type: 'error', text: 'Las contraseñas no coinciden.' }); 
            setIsAuthenticating(false); 
            return; 
        }
        if (!isValidUsername(authData.user)) {
          setAuthMsg({ type: 'error', text: 'El usuario debe tener entre 3 y 24 caracteres (letras, espacios y tildes).' });
          setIsAuthenticating(false);
          return;
        }

        // Cambio importante: Creamos el usuario Auth PRIMERO para tener permisos de lectura en Firestore
        // y verificar el nombre de usuario. Si está ocupado, borramos el usuario Auth.
        let cred;
        try {
            cred = await createUserWithEmailAndPassword(auth, authData.email, authData.pass);
        } catch (authErr: any) {
            // Si falla la creación de Auth (ej: email en uso), lanzamos el error para que lo capture el catch externo
            throw authErr;
        }

        try {
            // Ahora que estamos autenticados, verificamos si el nombre de usuario existe
            const q = query(collection(db, "users"), where("username_lowercase", "==", authData.user.toLowerCase()), limit(1));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                // El usuario existe, borramos la cuenta creada y lanzamos error
                await cred.user.delete();
                throw { code: 'custom/username-taken' };
            }

            // Si llegamos aquí, el usuario es único. Procedemos.
            await updateProfile(cred.user, { displayName: authData.user });
            await setDoc(doc(db, "users", cred.user.uid), { 
                username: authData.user, 
                username_lowercase: authData.user.toLowerCase(), 
                email: authData.email, 
                role: 'member', 
                favorites: [],
                profileValidated: true // Se marca como validado para nuevos usuarios
            });

        } catch (innerError: any) {
            // Si el error es nuestro custom, lo propagamos.
            if (innerError.code === 'custom/username-taken') {
                throw innerError;
            }
            // Si falla la escritura en Firestore o la consulta, intentamos limpiar
            if (cred && cred.user) {
                try { await cred.user.delete(); } catch(e) {}
            }
            throw innerError;
        }

      } else if (authMode === 'forgot') {
        await sendPasswordResetEmail(auth, authData.email);
        setAuthMsg({ type: 'success', text: 'Correo de recuperación enviado.' });
      }
    } catch (error: any) { 
        console.error("Auth error:", error.code, error.message);
        if (error.code === 'custom/username-taken') {
             setAuthMsg({ type: 'error', text: 'El nombre de usuario ya está ocupado. Por favor elige otro.' });
        } else {
             setAuthMsg({ type: 'error', text: translateAuthError(error.code) }); 
        }
    } finally { setIsAuthenticating(false); }
  };

  const handleGoogleSignIn = async () => {
    setIsAuthenticating(true);
    setAuthMsg(null);
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
            const generateBaseUsername = (displayName: string | null, email: string | null): string => {
                if (displayName) {
                    const sanitized = displayName.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ ]/g, '');
                    if (sanitized.trim().length >= 3) return sanitized.trim().substring(0, 24);
                }
                if (email) {
                    return email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').substring(0, 24);
                }
                return `user${Math.floor(1000 + Math.random() * 9000)}`;
            };

            const baseUsername = generateBaseUsername(user.displayName, user.email);
            let finalUsername = baseUsername;
            let isUnique = false;
            let attempts = 0;

            while (!isUnique && attempts < 10) {
                const q = query(collection(db, "users"), where("username_lowercase", "==", finalUsername.toLowerCase()), limit(1));
                const existingUser = await getDocs(q);
                if (existingUser.empty) {
                    isUnique = true;
                } else {
                    finalUsername = `${baseUsername.substring(0, 21)}${Math.floor(100 + Math.random() * 900)}`;
                    attempts++;
                }
            }

            await setDoc(userDocRef, {
                username: finalUsername,
                username_lowercase: finalUsername.toLowerCase(),
                email: user.email,
                role: 'member',
                favorites: [],
                profileValidated: false
            });
        }
    } catch (error: any) {
        setAuthMsg({ type: 'error', text: translateAuthError(error.code) });
    } finally {
        setIsAuthenticating(false);
    }
  };

  const handleLinkGoogleAccount = async () => {
    if (!auth.currentUser) return;
    setIsLinkingGoogle(true);
    const provider = new GoogleAuthProvider();
    try {
        await linkWithPopup(auth.currentUser, provider);
        setGlobalAlert({ title: "Cuenta Vinculada", message: "Tu cuenta de Google ha sido vinculada con éxito.", type: 'success' });
        setUser(prev => prev ? ({ ...prev, hasGoogleProvider: true }) : null);
    } catch (error: any) {
        console.error("Error linking Google account:", error);
        if (error.code === 'auth/credential-already-in-use') {
            setGlobalAlert({ title: "Cuenta ya en uso", message: "Esta cuenta de Google ya está vinculada a otro usuario.", type: 'error' });
        } else if (error.code !== 'auth/popup-closed-by-user') {
            setGlobalAlert({ title: "Error", message: "No se pudo vincular la cuenta. Inténtalo de nuevo.", type: 'error' });
        }
    } finally {
        setIsLinkingGoogle(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeMsg(null);
    if (passwordChangeData.newPass !== passwordChangeData.confirm) { setPasswordChangeMsg({ type: 'error', text: 'Las nuevas contraseñas no coinciden.' }); return; }
    const currentUser = auth.currentUser;
    if (!currentUser?.email) return;
    setIsUpdatingPassword(true);
    const cred = EmailAuthProvider.credential(currentUser.email, passwordChangeData.current);
    try {
        await reauthenticateWithCredential(currentUser, cred);
        await updatePassword(currentUser, passwordChangeData.newPass);
        setPasswordChangeMsg({ type: 'success', text: '¡Contraseña actualizada!' });
        setPasswordChangeData({ current: '', newPass: '', confirm: '' });
    } catch (error: any) { setPasswordChangeMsg({ type: 'error', text: translatePasswordChangeError(error.code) }); } finally { setIsUpdatingPassword(false); }
  };

  const handleUpdateUsername = async () => {
    if (!user || !auth.currentUser) return;
    const trimmedUsername = newUsername.trim();
    
    if (!isValidUsername(trimmedUsername)) {
       setGlobalAlert({ title: "Nombre no válido", message: "El usuario debe tener entre 3 y 24 caracteres (letras, espacios y tildes).", type: 'error' });
       return;
    }
    if (trimmedUsername.toLowerCase() === user.username.toLowerCase()) return;
    
    if (!usernameChangePassword) {
        setGlobalAlert({ title: "Requerido", message: "Ingresa tu contraseña actual para confirmar.", type: 'info' });
        return;
    }

    setIsUpdatingUsername(true);

    try {
        if (auth.currentUser.email) {
            const cred = EmailAuthProvider.credential(auth.currentUser.email, usernameChangePassword);
            await reauthenticateWithCredential(auth.currentUser, cred);
        } else {
            throw new Error("No email associated");
        }

        const q = query(collection(db, "users"), where("username_lowercase", "==", trimmedUsername.toLowerCase()));
        const querySnapshot = await getDocs(q);
        const isTakenByOtherUser = querySnapshot.docs.some(doc => doc.id !== user.id);

        if (isTakenByOtherUser) {
            setGlobalAlert({ title: "Nombre no disponible", message: "El nombre de usuario ya está ocupado.", type: 'error' }); 
            setIsUpdatingUsername(false); 
            return; 
        }

        const batch = writeBatch(db);
        const userRef = doc(db, "users", user.id);
        batch.update(userRef, {
            username: trimmedUsername,
            username_lowercase: trimmedUsername.toLowerCase()
        });

        const songsRef = collection(db, "songs");
        const qSongs = query(songsRef, where("author", "==", user.username));
        const songsSnapshot = await getDocs(qSongs);
        let songsUpdatedCount = 0;
        songsSnapshot.forEach((songDoc) => {
            batch.update(songDoc.ref, { author: trimmedUsername });
            songsUpdatedCount++;
        });

        await batch.commit();
        await updateProfile(auth.currentUser, { displayName: trimmedUsername });

        const userStatusDatabaseRef = ref(rtdb, '/status/' + user.id);
        updateRtdb(userStatusDatabaseRef, { username: trimmedUsername });
        
        setUser(prev => prev ? ({ ...prev, username: trimmedUsername, username_lowercase: trimmedUsername.toLowerCase() }) : null);

        setGlobalAlert({ title: "Perfil Actualizado", message: `Nombre cambiado a ${trimmedUsername}. Se actualizaron ${songsUpdatedCount} canciones.`, type: 'success' });
        setUsernameChangePassword('');

    } catch (error: any) { 
        console.error(error);
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
             setGlobalAlert({ title: "Contraseña Incorrecta", message: "La contraseña ingresada no es válida.", type: 'error' });
        } else {
             setGlobalAlert({ title: "Error", message: "No se pudo actualizar el nombre de usuario.", type: 'error' }); 
        }
    } finally { 
        setIsUpdatingUsername(false); 
    }
  };

   const handleProfileUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !auth.currentUser?.email) return;
        setProfileUpdateError(null);

        if (!isValidUsername(profileUpdateData.username)) {
            setProfileUpdateError('El usuario debe tener entre 3 y 24 caracteres (letras, espacios y tildes).');
            return;
        }
        if (!profileUpdateData.password) {
            setProfileUpdateError('Por favor, ingresa tu contraseña para confirmar.');
            return;
        }

        setIsUpdatingProfile(true);
        try {
            const credential = EmailAuthProvider.credential(auth.currentUser.email, profileUpdateData.password);
            await reauthenticateWithCredential(auth.currentUser, credential);
            
            const newUsernameLower = profileUpdateData.username.toLowerCase();
            
            const q = query(collection(db, "users"), where("username_lowercase", "==", newUsernameLower));
            const querySnapshot = await getDocs(q);
            const isTakenByOtherUser = querySnapshot.docs.some(doc => doc.id !== user.id);

            if (isTakenByOtherUser) {
                setProfileUpdateError('Este nombre de usuario ya está ocupado. Elige otro.');
                setIsUpdatingProfile(false);
                return;
            }
            
            const batch = writeBatch(db);

            const userRef = doc(db, "users", user.id);
            const updatePayload = {
                username: profileUpdateData.username,
                username_lowercase: newUsernameLower,
                profileValidated: true,
                role: user.role || 'member'
            };
            batch.update(userRef, updatePayload);

            if (user.username) {
                const songsRef = collection(db, "songs");
                const qSongs = query(songsRef, where("author", "==", user.username));
                const songsSnapshot = await getDocs(qSongs);
                songsSnapshot.forEach((songDoc) => {
                    batch.update(songDoc.ref, { author: profileUpdateData.username });
                });
            }

            await batch.commit();

            await updateProfile(auth.currentUser, { displayName: profileUpdateData.username });
            
            setUser(prev => prev ? ({ ...prev, ...updatePayload }) : null);
            setNewUsername(profileUpdateData.username);
            setShowProfileUpdateModal(false);

        } catch (error: any) {
            console.error("Error updating profile:", error);
            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                setProfileUpdateError('La contraseña es incorrecta.');
            } else {
                setProfileUpdateError('Ocurrió un error. Inténtalo de nuevo.');
            }
        } finally {
            setIsUpdatingProfile(false);
        }
    };

  const handleSignOut = async () => {
    if (user) {
      const userStatusDatabaseRef = ref(rtdb, '/status/' + user.id);
      await set(userStatusDatabaseRef, {
        isOnline: false,
        last_changed: serverTimestamp(),
        username: user.username
      });
    }
    await signOut(auth);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);
        const data = userDoc.data();
        
        const username = data?.username || firebaseUser.displayName || '';
        const email = data?.email || firebaseUser.email || '';
        
        const userStatusDatabaseRef = ref(rtdb, '/status/' + firebaseUser.uid);
        const isOfflineForDatabase = {
            isOnline: false,
            last_changed: serverTimestamp(),
            username: username
        };
        const isOnlineForDatabase = {
            isOnline: true,
            last_changed: serverTimestamp(),
            username: username
        };
        const connectedRef = ref(rtdb, '.info/connected');
        onValue(connectedRef, (snapshot) => {
            if (snapshot.val() === false) { return; }
            onDisconnect(userStatusDatabaseRef).set(isOfflineForDatabase).then(() => {
                set(userStatusDatabaseRef, isOnlineForDatabase);
            });
        });

        const providerIds = firebaseUser.providerData.map(p => p.providerId);
        const hasPasswordProvider = providerIds.includes('password');
        const hasGoogleProvider = providerIds.includes('google.com');

        const currentUserData: AppUser = { 
          id: firebaseUser.uid, 
          username, 
          username_lowercase: data?.username_lowercase || username.toLowerCase(), 
          email: email, 
          role: data?.role || 'member', 
          isAuthenticated: true, 
          createdAt: firebaseUser.metadata.creationTime,
          hasPasswordProvider,
          hasGoogleProvider
        };
        
        setUser(currentUserData);

        const profileValidated = data?.profileValidated || false;
        const isDataMissing = !data?.username || !data?.email;
        const isUsernameInvalid = username && !isValidUsername(username);

        if (!profileValidated && (isDataMissing || isUsernameInvalid)) {
          setProfileUpdateReason(isDataMissing ? 'missing_data' : 'invalid_name');
          setProfileUpdateData({ username: username, email: email, password: '' });
          setShowProfileUpdateModal(true);
        } else {
          setNewUsername(username);
          setShowProfileUpdateModal(false);
        }

      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const q = query(collection(db, "songs"), orderBy("createdAt", "desc"));
    const unsubSongs = onSnapshot(q, 
      (snap) => setSongs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Song))),
      (error) => console.error("Error subscribing to songs:", error)
    );
    const unsubFavs = onSnapshot(doc(db, "users", user.id), 
      (docSnap) => { if (docSnap.exists()) setFavorites(docSnap.data().favorites || []); },
      (error) => console.error("Error subscribing to favorites:", error)
    );
    return () => { unsubSongs(); unsubFavs(); };
  }, [user?.id]);

  useEffect(() => {
    if (activeSong) {
      const updatedActiveSong = songs.find(s => s.id === activeSong.id);
      if (updatedActiveSong) {
        if (updatedActiveSong.content !== activeSong.content || updatedActiveSong.title !== activeSong.title || updatedActiveSong.key !== activeSong.key) {
           setActiveSong(updatedActiveSong);
        }
      } else {
        setActiveSong(null);
      }
    }
  }, [songs, activeSong]);

  if (loading) return (
    <div className="fixed inset-0 login-background flex flex-col items-center justify-center text-white font-black z-[9999]">
      <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
        <h1 className="text-5xl font-black tracking-tighter uppercase italic leading-tight login-text-shadow mb-8 text-center">ADJ<br/><span className="text-4xl font-semibold tracking-widest">Studios</span></h1>
        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
      </div>
    </div>
  );

  return (
    <>
      <div className={`fixed inset-0 transition-opacity duration-500 ease-in-out ${user ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <LoginView
          handleAuthSubmit={handleAuthSubmit}
          authData={authData}
          setAuthData={setAuthData}
          authMode={authMode}
          setAuthMode={setAuthMode}
          authMsg={authMsg}
          setAuthMsg={setAuthMsg}
          isAuthenticating={isAuthenticating}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          handleGoogleSignIn={handleGoogleSignIn}
        />
      </div>

      {user && !showProfileUpdateModal && (
        <>
            <MainView
                user={user} view={view} darkMode={darkMode} theme={theme} setTheme={setTheme} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} animationDirection={animationDirection} navigateTo={navigateTo}
                songs={songs} favorites={favorites} openSongViewer={openSongViewer} toggleFavorite={toggleFavorite}
                searchQuery={searchQuery} setSearchQuery={setSearchQuery} activeFilter={activeFilter} setActiveFilter={setActiveFilter}
                categories={categories}
                roomCodeInput={roomCodeInput} setRoomCodeInput={setRoomCodeInput} handleJoinRoom={handleJoinRoom} handleCreateRoom={handleCreateRoom} isJoiningRoom={isJoiningRoom}
                handleCreateCategory={handleCreateCategory} handleDeleteCategory={handleDeleteCategory} handleEditCategory={handleEditCategory} setCategoryConfirmModal={setCategoryConfirmModal}
                newUsername={newUsername} setNewUsername={setNewUsername} showUsernamePass={showUsernamePass} setShowUsernamePass={setShowUsernamePass}
                usernameChangePassword={usernameChangePassword} setUsernameChangePassword={setUsernameChangePassword} isUpdatingUsername={isUpdatingUsername} handleUpdateUsername={handleUpdateUsername}
                passwordChangeData={passwordChangeData} setPasswordChangeData={setPasswordChangeData} showChangePassword={showChangePassword}
                toggleShowChangePassword={toggleShowChangePassword} passwordChangeMsg={passwordChangeMsg} isUpdatingPassword={isUpdatingPassword} handleChangePassword={handleChangePassword}
                isLinkingGoogle={isLinkingGoogle} handleLinkGoogleAccount={handleLinkGoogleAccount}
                adminUsers={adminUsers} handleAddAdmin={handleAddAdmin} handleRevokeAdmin={handleRevokeAdmin}
                handleSignOut={handleSignOut}
                openSongEditor={openSongEditor}
            />
            
            <nav onTouchStart={(e) => e.stopPropagation()} className={`fixed bottom-0 left-0 right-0 z-50 flex justify-center gap-14 items-center transition-all duration-500 
              md:flex-col md:w-20 md:left-0 md:top-0 md:h-full md:justify-start md:gap-8 md:pt-20 md:px-0 md:bottom-auto md:right-auto
              px-4 pt-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))]
              ${darkMode ? 'bg-black border-white/10' : 'bg-white border-slate-200'} border-t md:border-t-0 md:border-r`}>
              {VIEW_ORDER.map((v) => {
                const isActive = view === v;
                let activeColorClass = 'text-slate-400 dark:text-slate-500';
                let bubbleColorClass = 'bg-slate-400/10';
                if (v === 'feed') { activeColorClass = isActive ? 'text-misionero-azul' : 'text-slate-400 dark:text-slate-500'; bubbleColorClass = 'bg-misionero-azul/15'; }
                else if (v === 'favorites') { activeColorClass = isActive ? 'text-misionero-rojo' : 'text-slate-400 dark:text-slate-500'; bubbleColorClass = 'bg-misionero-rojo/15'; }
                else if (v === 'room') { activeColorClass = isActive ? 'text-misionero-verde' : 'text-slate-400 dark:text-slate-500'; bubbleColorClass = 'bg-misionero-verde/15'; }
                else if (v === 'settings') { activeColorClass = isActive ? (darkMode ? 'text-white' : 'text-slate-900') : 'text-slate-400 dark:text-slate-500'; bubbleColorClass = darkMode ? 'bg-white/10' : 'bg-slate-900/10'; }
                return (
                  <button key={v} onClick={() => navigateTo(v)} className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${activeColorClass}`}>
                    <div className="relative flex items-center justify-center">
                      <div className={`absolute rounded-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${bubbleColorClass} ${isActive ? 'scale-100 opacity-100' : 'scale-0 opacity-0'} 
                        inset-x-[-12px] inset-y-[-4px] md:inset-y-[-12px] md:inset-x-[-4px]`}></div>
                      <div className={`relative transition-transform duration-300 z-10 ${isActive ? 'scale-110' : 'scale-100'}`}>
                        {v === 'feed' && <svg className="w-6 h-6 md:w-7 md:h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>}
                        {v === 'favorites' && <svg className="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>}
                        {v === 'room' && <UsersIcon />}
                        {v === 'settings' && <svg className="w-6 h-6 md:w-7 md:h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5z"/></svg>}
                      </div>
                    </div>
                    <span className={`text-[8px] font-black uppercase tracking-tighter relative z-10 transition-colors duration-300 md:hidden`}>{v === 'feed' ? 'Inicio' : v === 'favorites' ? 'Favs' : v === 'room' ? 'Sala' : 'Ajustes'}</span>
                  </button>
                );
              })}
            </nav>
            {view === 'feed' && isAdmin && !activeSong && !editingSong && !activeRoom && (
              <button onClick={() => openSongEditor(null)} className="fixed bottom-[5rem] right-6 w-16 h-16 glass-ui glass-interactive bg-misionero-rojo/70 text-white rounded-[1.8rem] flex items-center justify-center z-[60] animate-bounce-subtle active:scale-90 transition-transform md:hidden"><PlusIcon /></button>
            )}
            {globalAlert && (<div className="fixed inset-0 z-[300] flex items-center justify-center p-6 animate-in fade-in duration-200"><div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setGlobalAlert(null)}></div><div className="glass-ui relative w-full max-w-sm p-6 rounded-[2rem] animate-in zoom-in-95 duration-200"><div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto ${globalAlert.type === 'error' ? 'glass-ui bg-misionero-rojo/30 text-misionero-rojo' : 'glass-ui bg-misionero-azul/30 text-misionero-azul'}`}>{globalAlert.type === 'error' ? ( <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>) : ( <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>)}</div><h3 className={`text-center font-black text-lg uppercase mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{globalAlert.title}</h3><p className={`text-center text-xs font-bold mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{globalAlert.message}</p><button onClick={() => setGlobalAlert(null)} className={`w-full py-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-transform glass-ui glass-interactive ${globalAlert.type === 'error' ? 'bg-misionero-rojo/70 text-white' : 'bg-misionero-azul/70 text-white'}`}>Entendido</button></div></div>)}
            {categoryConfirmModal && (<div className="fixed inset-0 z-[300] flex items-center justify-center p-6 animate-in fade-in duration-200"><div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCategoryConfirmModal(null)}></div><div className={`relative w-full max-w-sm p-6 rounded-[2.5rem] shadow-2xl border animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-black border-white/10' : 'bg-white border-slate-100'}`}><h3 className={`text-center font-black text-lg uppercase mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{categoryConfirmModal.title}</h3><p className={`text-center text-xs font-bold mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{categoryConfirmModal.message}</p><div className="flex gap-3"><button onClick={() => setCategoryConfirmModal(null)} className={`flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-colors ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>Cancelar</button><button onClick={categoryConfirmModal.action} className={`flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-white shadow-lg active:scale-95 transition-transform ${categoryConfirmModal.type === 'danger' ? 'bg-misionero-rojo' : 'bg-misionero-azul'}`}>Confirmar</button></div></div></div>)}
            {showExitConfirm && (<div className="fixed inset-0 z-[300] flex items-center justify-center p-6 animate-in fade-in duration-200"><div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowExitConfirm(null)}></div><div className={`relative w-full max-w-sm p-6 rounded-[2.5rem] shadow-2xl border animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-black border-white/10' : 'bg-white border-slate-100'}`}><h3 className={`text-center font-black text-lg uppercase mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{showExitConfirm.title}</h3><p className={`text-center text-xs font-bold mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{showExitConfirm.message}</p><div className="flex gap-3"><button onClick={() => setShowExitConfirm(null)} className={`flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-colors ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>Cancelar</button><button onClick={showExitConfirm.action} className={`flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-white shadow-lg active:scale-95 transition-transform bg-misionero-rojo`}>Salir</button></div></div></div>)}
            {showOpenInAppButton && (<div className="fixed bottom-[5rem] left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-bottom-5 duration-300"><button onClick={handleOpenInApp} className="glass-ui glass-interactive bg-misionero-azul/70 text-white flex items-center gap-3 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-transform"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg><span>Abrir en la App</span></button></div>)}
            {editingSong && hasElevatedPermissions && (<div data-is-overlay="true" className="fixed inset-0 z-[300]"><SongForm categories={categoryNames} initialData={typeof editingSong === 'boolean' ? undefined : editingSong} onSave={handleSaveSong} onCancel={goBack} darkMode={darkMode} /></div>)}
            {activeSong && (<div data-is-overlay="true" className="fixed inset-0 z-[100]"><SongViewer song={activeSong} onBack={goBack} darkMode={darkMode} onEdit={hasElevatedPermissions ? () => openSongEditor(activeSong) : undefined} onDelete={hasElevatedPermissions ? () => handleDeleteSong(activeSong) : undefined} /></div>)}
            {activeRoom && (<div data-is-overlay="true" className="fixed inset-0 z-[200]"><RoomView rtdb={rtdb} categories={categoryNames} room={activeRoom} songs={songs} currentUser={user.username} isAdmin={isAdmin} onExit={exitRoom} onUpdateRoom={handleUpdateRoom} darkMode={darkMode} db={db} onEditSong={openSongEditor} onDeleteSong={performDeleteSong} /></div>)}
        </>
      )}

      {showProfileUpdateModal && user && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 animate-in fade-in duration-300 bg-black/70 backdrop-blur-md">
              <div className={`relative w-full max-w-sm p-8 rounded-[2.5rem] shadow-2xl border animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-black border-white/10' : 'bg-white border-slate-100'}`}>
                  <h3 className={`text-center font-black text-xl uppercase mb-3 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {profileUpdateReason === 'missing_data' ? 'Completa tu Perfil' : 'Actualiza tu Usuario'}
                  </h3>
                  <p className={`text-center text-xs font-bold mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {profileUpdateReason === 'missing_data' 
                      ? 'Para continuar, necesitamos que completes tu perfil. Confirma tu identidad con tu contraseña.'
                      : 'Tu nombre de usuario no es válido. Elige uno nuevo (3-24 caracteres, letras, espacios y tildes) y confirma tu identidad con tu contraseña.'
                    }
                  </p>
                  <form onSubmit={handleProfileUpdate} className="space-y-3">
                      <input 
                          type="text" 
                          placeholder="Nuevo nombre de usuario"
                          value={profileUpdateData.username} 
                          onChange={e => setProfileUpdateData(d => ({...d, username: e.target.value}))} 
                          className={`w-full text-center glass-ui rounded-2xl px-4 py-3.5 text-lg font-bold outline-none border ${profileUpdateError ? 'border-red-500/50' : (darkMode ? 'border-transparent' : 'border-slate-200/50')} ${darkMode ? 'bg-slate-800/50 text-white placeholder:text-slate-400' : 'bg-slate-50 text-slate-900 placeholder:text-slate-400'}`}
                      />
                      <input 
                          type="email" 
                          placeholder="Correo Electrónico"
                          value={profileUpdateData.email}
                          readOnly
                          className={`w-full text-center glass-ui rounded-2xl px-4 py-3.5 text-sm font-bold outline-none border opacity-70 ${darkMode ? 'border-transparent bg-slate-800/50 text-white placeholder:text-slate-400' : 'border-slate-200/50 bg-slate-50 text-slate-900 placeholder:text-slate-400'}`}
                      />
                      <div className="relative">
                        <input 
                            type={showUpdatePassword ? 'text' : 'password'}
                            placeholder="Tu contraseña actual"
                            value={profileUpdateData.password}
                            onChange={e => setProfileUpdateData(d => ({...d, password: e.target.value}))} 
                            className={`w-full text-center glass-ui rounded-2xl px-4 py-3.5 text-sm font-bold outline-none border ${profileUpdateError?.includes('contraseña') ? 'border-red-500/50' : (darkMode ? 'border-transparent' : 'border-slate-200/50')} ${darkMode ? 'bg-slate-800/50 text-white placeholder:text-slate-400' : 'bg-slate-50 text-slate-900 placeholder:text-slate-400'}`}
                        />
                        <button type="button" onClick={() => setShowUpdatePassword(!showUpdatePassword)} className={`absolute inset-y-0 right-0 flex items-center pr-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{showUpdatePassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}</button>
                      </div>

                      {profileUpdateError && <p className="text-center text-xs font-bold text-red-400">{profileUpdateError}</p>}
                      
                      <button 
                          type="submit" 
                          disabled={isUpdatingProfile} 
                          className="w-full !mt-5 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-white shadow-lg active:scale-95 transition-transform bg-misionero-verde disabled:opacity-50"
                      >
                          {isUpdatingProfile ? 'Verificando...' : 'Guardar y Continuar'}
                      </button>
                  </form>
              </div>
          </div>
      )}
    </>
  );
};

export default App;