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
  updatePassword
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

import { User as AppUser, Song, LiturgicalTime, Room, UserRole } from './types';
import { PlusIcon, UsersIcon } from './constants';
import SongForm from './components/SongForm';
import SongViewer from './components/SongViewer';
import RoomView from './components/RoomView';

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyCDmkiclfBD3qP8K7ILakcl_JwJiiZXSBI",
  authDomain: "adjstudios.firebaseapp.com",
  projectId: "adjstudios",
  storageBucket: "adjstudios.firebasestorage.app",
  messagingSenderId: "85914193622",
  appId: "1:85914193622:web:a52f2a32877f0d321e0377",
  measurementId: "G-BN1E0ZEHX4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch(err => console.error("Error de persistencia:", err));

type AppView = 'feed' | 'favorites' | 'room' | 'settings';
const VIEW_ORDER: AppView[] = ['feed', 'favorites', 'room', 'settings'];

const ADMIN_EMAILS = [
  'johannino674@gmail.com',
  'jaysellduarte4@gmail.com',
  'biden.inf@gmail.com',
  'jitteryqwq@gmail.com'
];

const LogoutIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

const getLiturgicalCardClass = (category: LiturgicalTime) => {
  const map: Record<LiturgicalTime, string> = {
    [LiturgicalTime.ADVIENTO]: 'card-adviento',
    [LiturgicalTime.NAVIDAD]: 'card-navidad',
    [LiturgicalTime.CUARESMA]: 'card-cuaresma',
    [LiturgicalTime.PASCUA]: 'card-pascua',
    [LiturgicalTime.ORDINARIO]: 'card-ordinario',
    [LiturgicalTime.ANIMACION]: 'card-animacion',
    [LiturgicalTime.MEDITACION]: 'card-meditacion',
    [LiturgicalTime.PURISIMA]: 'card-purisima',
  };
  return map[category] || '';
};

const translateAuthError = (errorCode: string): string => {
  switch (errorCode) {
    case 'auth/invalid-email': return 'El formato del correo electrónico no es válido.';
    case 'auth/user-not-found': return 'No se encontró ninguna cuenta con este correo.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'La contraseña es incorrecta.';
    case 'auth/email-already-in-use': return 'Este correo ya está registrado.';
    case 'auth/weak-password': return 'La contraseña es demasiado débil.';
    case 'auth/too-many-requests': return 'Bloqueo temporal por seguridad.';
    default: return 'Error inesperado. Inténtalo más tarde.';
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

const App: React.FC = () => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [view, setView] = useState<AppView>('feed');
  const [activeSong, setActiveSong] = useState<Song | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [editingSong, setEditingSong] = useState<Song | boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<LiturgicalTime | 'Todos'>('Todos');
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [authData, setAuthData] = useState({ user: '', email: '', pass: '', confirmPass: '' });
  const [authMsg, setAuthMsg] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [newUsername, setNewUsername] = useState('');
  
  const [passwordChangeData, setPasswordChangeData] = useState({ current: '', newPass: '', confirm: '' });
  const [passwordChangeMsg, setPasswordChangeMsg] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);

  // Estado para alertas globales (estilo modal)
  const [globalAlert, setGlobalAlert] = useState<{ title: string, message: string, type: 'error' | 'success' | 'info' } | null>(null);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const minSwipeDistance = 50;

  useEffect(() => {
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  // Inicializar historial
  useEffect(() => {
    if (!window.history.state) {
      window.history.replaceState({ view: 'feed' }, '', '');
    }
  }, []);

  const navigateTo = useCallback((newView: AppView) => {
    if (view === newView) return;
    // Empujar nueva vista al historial
    window.history.pushState({ view: newView }, '', '');
    setView(newView);
  }, [view]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      // 1. Manejo de Modales Globales (Prioridad Alta)
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
      
      // 2. Manejo de Sala y Navegación Interna de Sala
      if (activeRoom) { 
        const currentOverlay = event.state?.overlay;

        // Si el estado del historial indica que estamos en la "raíz" de la sala (overlay: 'room'),
        // significa que acabamos de retroceder desde una canción (overlay: 'room_song') o del chat.
        if (currentOverlay === 'room') {
            window.dispatchEvent(new CustomEvent('closeRoomSong'));
            return;
        }

        // Si el estado es 'room_song' (ej: volvimos del chat a la canción), no hacemos nada aquí,
        // dejamos que la vista de la sala mantenga la canción abierta.
        if (currentOverlay === 'room_song') {
            return;
        }

        // Si el estado es 'chat', tampoco hacemos nada aquí, RoomView lo manejará.
        if (currentOverlay === 'chat') {
            return;
        }

        // Si no tenemos overlay reconocido (ej. estamos volviendo al feed), cerramos la sala.
        setActiveRoom(null); 
        return; 
      }

      // 3. Manejo de Navegación entre Vistas (Tabs)
      if (event.state && event.state.view) {
        setView(event.state.view as AppView);
      } else {
        // Fallback si se acaba el historial o es el estado inicial
        setView('feed');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeSong, activeRoom, editingSong, view]);

  useEffect(() => {
    if (!activeRoom?.id) return;
    const unsubscribe = onSnapshot(doc(db, "rooms", activeRoom.id), (docSnap) => {
      if (docSnap.exists()) {
        const roomData = docSnap.data();
        setActiveRoom(prev => ({ ...prev, ...roomData, id: docSnap.id } as Room));
      } else {
        setActiveRoom(null);
        setGlobalAlert({ title: "Sala Cerrada", message: "La sala ha sido cerrada por el servidor.", type: 'info' });
      }
    });
    return () => unsubscribe();
  }, [activeRoom?.id]);

  const goBack = () => {
    window.history.back();
  };

  const openSongViewer = (song: Song) => {
    setActiveSong(song);
    window.history.pushState({ overlay: 'song' }, '', '');
  };

  const openSongEditor = (song: Song | null) => {
    setEditingSong(song || true);
    window.history.pushState({ overlay: 'editor' }, '', '');
  };

  const handleDeleteSong = async (songId: string) => {
    if (window.confirm("¿Seguro que quieres eliminar esta canción?")) {
        try {
            await deleteDoc(doc(db, "songs", songId));
            if (activeSong && activeSong.id === songId) goBack();
        } catch (err) {
            console.error("Error deleting song:", err);
            setGlobalAlert({ title: "Error", message: "Error al eliminar la canción.", type: 'error' });
        }
    }
  };

  const enterRoom = (room: Room) => {
    setActiveRoom(room);
    // Aseguramos que el estado base de la sala esté en el historial
    window.history.pushState({ overlay: 'room' }, '', '');
  };

  const exitRoom = () => {
    if (activeRoom && user) {
      const updatedParticipants = (activeRoom.participants || []).filter(p => p !== user.username);
      handleUpdateRoom({ ...activeRoom, participants: updatedParticipants });
    }
    // Intentamos ir atrás para respetar el historial, si no, forzamos cierre
    if (window.history.state?.overlay === 'room') {
        window.history.back();
    } else {
        setActiveRoom(null);
    }
  };

  const isAdmin = useMemo(() => {
    if (!user) return false;
    return user.role === 'admin' || ADMIN_EMAILS.some(e => e.toLowerCase() === user.email.toLowerCase());
  }, [user]);

  const hasElevatedPermissions = useMemo(() => {
    if (!user) return false;
    if (isAdmin) return true;
    if (activeRoom && activeRoom.host === user.username) return true;
    return false;
  }, [user, isAdmin, activeRoom?.host]);

  const filteredSongs = useMemo(() => {
    return songs
      .filter(s => {
        const matchesSearch = s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             s.author.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = activeFilter === 'Todos' || s.category === activeFilter;
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [songs, searchQuery, activeFilter]);

  const favoriteSongs = useMemo(() => {
    return filteredSongs.filter(s => favorites.includes(s.id));
  }, [filteredSongs, favorites]);

  useEffect(() => {
    if (songs.length > 0 && !activeSong && !activeRoom && !editingSong) {
      const urlParams = new URLSearchParams(window.location.search);
      const sharedSongId = urlParams.get('song');
      if (sharedSongId) {
        const sharedSong = songs.find(s => s.id === sharedSongId);
        if (sharedSong) {
          openSongViewer(sharedSong);
        }
      }
    }
  }, [songs]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (activeSong || editingSong || activeRoom) return;
    touchStartX.current = e.targetTouches[0].clientX;
    touchStartY.current = e.targetTouches[0].clientY;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const dx = touchStartX.current - touchEndX;
    const dy = touchStartY.current - touchEndY;

    if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > minSwipeDistance) {
      const currentIndex = VIEW_ORDER.indexOf(view);
      if (dx > 0 && currentIndex < VIEW_ORDER.length - 1) {
        navigateTo(VIEW_ORDER[currentIndex + 1]);
      } else if (dx < 0 && currentIndex > 0) {
        navigateTo(VIEW_ORDER[currentIndex - 1]);
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const handleCreateRoom = async () => {
    if (!user) return;
    setIsJoiningRoom(true);
    try {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const now = Date.now();
        const newRoom = {
          code, host: user.username, repertoire: [], currentSongIndex: 0,
          participants: [user.username], banned: [], globalTranspositions: {}, chat: [],
          createdAt: now, expiresAt: now + (24 * 60 * 60 * 1000)
        };
        const docRef = await addDoc(collection(db, "rooms"), newRoom);
        enterRoom({ id: docRef.id, ...newRoom } as Room);
    } catch (error) {
        console.error("Error creating room:", error);
        setGlobalAlert({ title: "Error", message: "Error al crear la sala.", type: 'error' });
    } finally {
        setIsJoiningRoom(false);
    }
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
            setGlobalAlert({ 
              title: "CÓDIGO VENCIDO", 
              message: "El código de esta sala ha expirado. Solicita uno nuevo al anfitrión.", 
              type: 'error' 
            });
            setIsJoiningRoom(false);
            return;
          }

          if (roomData.banned && roomData.banned.includes(user.username)) {
            setGlobalAlert({ 
              title: "ACCESO DENEGADO", 
              message: "Has sido expulsado permanentemente de esta sala por el administrador.", 
              type: 'error' 
            });
            setIsJoiningRoom(false);
            return;
          }

          const currentParticipants = roomData.participants || [];

          if (!currentParticipants.includes(user.username)) {
            await updateDoc(doc(db, "rooms", roomDoc.id), { participants: arrayUnion(user.username) });
            roomData.participants = [...currentParticipants, user.username];
          } else {
            roomData.participants = currentParticipants;
          }
          enterRoom(roomData);
        } else {
            setGlobalAlert({ 
              title: "SALA NO ENCONTRADA", 
              message: "Verifica el código e inténtalo de nuevo.", 
              type: 'info' 
            });
        }
    } catch (error) {
        console.error("Error joining room:", error);
        setGlobalAlert({ title: "Error", message: "Ocurrió un error al intentar unirse a la sala.", type: 'error' });
    } finally {
        setIsJoiningRoom(false);
    }
  };

  const handleUpdateRoom = async (updatedRoom: Room) => {
    if (!updatedRoom.id) return;
    const { id, ...data } = updatedRoom;
    await updateDoc(doc(db, "rooms", id), data);
  };

  const toggleFavorite = async (e: React.MouseEvent, songId: string) => {
    e.stopPropagation();
    if (!user) return;
    const isFav = favorites.includes(songId);
    try {
      await updateDoc(doc(db, "users", user.id), {
        favorites: isFav ? arrayRemove(songId) : arrayUnion(songId)
      });
    } catch (err) {
      console.error("Error updating favorites", err);
    }
  };

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
        const credential = await createUserWithEmailAndPassword(auth, authData.email, authData.pass);
        await updateProfile(credential.user, { displayName: authData.user });
        await setDoc(doc(db, "users", credential.user.uid), {
          username: authData.user,
          email: authData.email,
          role: 'member',
          favorites: []
        });
      } else if (authMode === 'forgot') {
        await sendPasswordResetEmail(auth, authData.email);
        setAuthMsg({ type: 'success', text: 'Correo de recuperación enviado.' });
      }
    } catch (error: any) {
      setAuthMsg({ type: 'error', text: translateAuthError(error.code) });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeMsg(null);
    if (passwordChangeData.newPass !== passwordChangeData.confirm) {
        setPasswordChangeMsg({ type: 'error', text: 'Las nuevas contraseñas no coinciden.' });
        return;
    }
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) return;
    setIsUpdatingPassword(true);
    const credential = EmailAuthProvider.credential(currentUser.email, passwordChangeData.current);
    try {
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, passwordChangeData.newPass);
        setPasswordChangeMsg({ type: 'success', text: '¡Contraseña actualizada!' });
        setPasswordChangeData({ current: '', newPass: '', confirm: '' });
    } catch (error: any) {
        setPasswordChangeMsg({ type: 'error', text: translatePasswordChangeError(error.code) });
    } finally {
        setIsUpdatingPassword(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        const data = userDoc.data();
        const username = data?.username || firebaseUser.displayName || 'Músico';
        setUser({ 
            id: firebaseUser.uid, username, email: firebaseUser.email || '', 
            role: data?.role || 'member', isAuthenticated: true, createdAt: firebaseUser.metadata.creationTime
        });
        setNewUsername(username);
      } else setUser(null);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const q = query(collection(db, "songs"), orderBy("createdAt", "desc"));
    const unsubSongs = onSnapshot(q, (snap) => {
      const fetchedSongs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Song));
      setSongs(fetchedSongs);
      setActiveSong(current => {
        if (!current) return null;
        const updated = fetchedSongs.find(s => s.id === current.id);
        return updated || current;
      });
    });
    const unsubFavs = onSnapshot(doc(db, "users", user.id), (docSnap) => { if (docSnap.exists()) setFavorites(docSnap.data().favorites || []); });
    return () => { unsubSongs(); unsubFavs(); };
  }, [user?.id]);

  if (loading) return <div className="fixed inset-0 bg-misionero-azul flex items-center justify-center text-white font-black animate-pulse">ADJSTUDIOS</div>;

  if (!user) {
    return (
      <div className="fixed inset-0 login-background flex flex-col items-center justify-center p-4 text-white font-sans overflow-hidden">
        <div className="w-full max-w-sm space-y-8 text-center">
          <h1 className="text-4xl font-black tracking-tighter uppercase italic drop-shadow-lg leading-tight">Amiguitos de Jesus<br/><span className="text-3xl font-semibold tracking-widest">Studios</span></h1>
          <form onSubmit={handleAuthSubmit} className="space-y-3">
            {authMode === 'register' && <input type="text" placeholder="Usuario" className="w-full bg-black/20 border border-white/20 rounded-2xl px-4 py-3.5 text-sm font-bold text-white outline-none" required value={authData.user} onChange={e => setAuthData({...authData, user: e.target.value})} />}
            <input type="email" placeholder="Correo" className="w-full bg-black/20 border border-white/20 rounded-2xl px-4 py-3.5 text-sm font-bold text-white outline-none" required value={authData.email} onChange={e => setAuthData({...authData, email: e.target.value})} />
            {authMode !== 'forgot' && <input type="password" placeholder="Contraseña" className="w-full bg-black/20 border border-white/20 rounded-2xl px-4 py-3.5 text-sm font-bold text-white outline-none" required value={authData.pass} onChange={e => setAuthData({...authData, pass: e.target.value})} />}
            {authMode === 'register' && <input type="password" placeholder="Confirmar" className="w-full bg-black/20 border border-white/20 rounded-2xl px-4 py-3.5 text-sm font-bold text-white outline-none" required value={authData.confirmPass} onChange={e => setAuthData({...authData, confirmPass: e.target.value})} />}
            <button type="submit" disabled={isAuthenticating} className="w-full bg-misionero-verde text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all">
              {isAuthenticating ? '...' : (authMode === 'login' ? 'Entrar' : authMode === 'register' ? 'Registrar' : 'Recuperar')}
            </button>
          </form>
          <div className="flex flex-col gap-4">
            <button onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthMsg(null); }} className="text-[10px] font-bold text-white uppercase text-center">{authMode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Entra'}</button>
            {authMode === 'login' && <button onClick={() => { setAuthMode('forgot'); setAuthMsg(null); }} className="text-[9px] font-bold text-white/60 uppercase text-center underline">Olvidé mi contraseña</button>}
          </div>
          {authMsg && <div className={`mt-4 p-3 rounded-xl text-[10px] font-bold text-center ${authMsg.type === 'error' ? 'text-red-300' : 'text-green-300'}`}>{authMsg.text}</div>}
        </div>
      </div>
    );
  }

  const viewIndex = VIEW_ORDER.indexOf(view);

  return (
    <div className={`fixed inset-0 max-w-md mx-auto transition-colors duration-500 ${darkMode ? 'text-white bg-slate-950' : 'text-slate-900 bg-slate-50'} overflow-hidden flex flex-col`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header onTouchStart={(e) => e.stopPropagation()} className={`shrink-0 px-4 pt-12 pb-3 transition-colors duration-500 ${darkMode ? 'bg-slate-950/95 border-slate-800' : 'bg-white/95 border-slate-50'} border-b shadow-sm z-30`}>
        <div className="flex justify-between items-center mb-3">
          <div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] mb-0.5">ADJStudios</p>
            <h2 className="text-lg font-black tracking-tight">
              {view === 'feed' ? `Hola, ${user.username}` : view === 'favorites' ? 'Mis Favoritos' : view === 'room' ? 'Sala en Vivo' : 'Ajustes'}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {view === 'settings' && (
              <button onClick={() => signOut(auth)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-misionero-rojo/10 text-misionero-rojo active:scale-95 transition-all">
                <LogoutIcon />
                <span className="text-[9px] font-black uppercase">Cerrar Sesión</span>
              </button>
            )}
            {isAdmin && <span className="text-[7px] font-black bg-misionero-rojo text-white px-2 py-1 rounded-full uppercase animate-pulse">Admin</span>}
          </div>
        </div>
        {(view === 'feed' || view === 'favorites') && (
          <div className="space-y-3 animate-in fade-in duration-300">
            <input type="text" placeholder="Buscar música..." className={`w-full transition-colors duration-500 ${darkMode ? 'bg-slate-900 border border-slate-800 text-white' : 'bg-slate-100 border-none text-slate-900'} rounded-2xl px-4 py-2 text-xs font-bold outline-none`} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <div className="flex gap-2 overflow-x-auto pb-2 pt-1 no-swipe custom-scroll">
              {['Todos', ...Object.values(LiturgicalTime)].map(f => (
                <button key={f} onClick={() => setActiveFilter(f as any)} className={`px-5 py-2 rounded-full text-[9px] font-black uppercase shrink-0 transition-all ${activeFilter === f ? 'bg-misionero-azul text-white' : darkMode ? 'bg-slate-900 text-slate-500' : 'bg-slate-50 text-slate-400'}`}>{f}</button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 relative overflow-hidden">
        <div 
          className="flex h-full w-[400%] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ transform: `translateX(-${viewIndex * 25}%)` }}
        >
          <div className="w-1/4 h-full overflow-y-auto custom-scroll px-4 py-4 space-y-3">
             {filteredSongs.map(song => (
                <div key={song.id} className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'} rounded-[1.8rem] border shadow-sm relative overflow-hidden active:scale-[0.98] transition-all`} onClick={() => openSongViewer(song)}>
                  <div className={`absolute inset-0 z-0 ${getLiturgicalCardClass(song.category)} opacity-40`}></div>
                  <button onClick={(e) => toggleFavorite(e, song.id)} className={`absolute top-3 right-3 z-20 p-2 ${favorites.includes(song.id) ? 'text-misionero-rojo' : 'text-slate-300'}`}>
                    <svg className="w-5 h-5" fill={favorites.includes(song.id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
                  </button>
                  <div className="relative z-10 p-4">
                    <p className="text-[7px] font-black text-misionero-verde uppercase mb-1">{song.category}</p>
                    <h4 className="font-black text-sm uppercase truncate pr-8">{song.title}</h4>
                    <p className="text-[9px] text-slate-400 font-bold">Tono: <span className="text-misionero-rojo">{song.key}</span> • Por: {song.author}</p>
                  </div>
                </div>
             ))}
          </div>

          <div className="w-1/4 h-full overflow-y-auto custom-scroll px-4 py-4 space-y-3">
             {favoriteSongs.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-full opacity-20"><p className="text-[10px] font-black uppercase">Sin favoritos</p></div>
             ) : favoriteSongs.map(song => (
                <div key={song.id} className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'} rounded-[1.8rem] border shadow-sm relative overflow-hidden`} onClick={() => openSongViewer(song)}>
                  <div className={`absolute inset-0 z-0 ${getLiturgicalCardClass(song.category)} opacity-40`}></div>
                  <button onClick={(e) => toggleFavorite(e, song.id)} className="absolute top-3 right-3 z-20 p-2 text-misionero-rojo">
                    <svg className="w-5 h-5" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
                  </button>
                  <div className="relative z-10 p-4">
                    <h4 className="font-black text-sm uppercase truncate pr-8">{song.title}</h4>
                  </div>
                </div>
             ))}
          </div>

          <div className="w-1/4 h-full flex flex-col items-center justify-center px-8 py-4 text-center space-y-6 relative">
              {isJoiningRoom && (
                 <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/30 dark:bg-slate-950/30 backdrop-blur-md animate-in fade-in duration-300 rounded-[2.5rem]">
                    <div className="w-12 h-12 border-4 border-misionero-azul border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-[10px] font-black uppercase tracking-widest animate-pulse">Cargando Sala...</p>
                 </div>
              )}
              <div className="w-20 h-20 bg-misionero-azul/10 rounded-[2rem] flex items-center justify-center text-misionero-azul"><UsersIcon /></div>
              <div><h3 className="text-xl font-black uppercase mb-2">Sincronización</h3><p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed">Únete a una sala para ver los acordes en tiempo real.</p></div>
              <input type="text" placeholder="CÓDIGO" className={`w-full ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-100 text-slate-900'} border-2 rounded-2xl px-6 py-4 text-center font-black text-lg uppercase outline-none`} value={roomCodeInput} onChange={e => setRoomCodeInput(e.target.value)} />
              <button onClick={handleJoinRoom} className="w-full bg-misionero-azul text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all">UNIRME</button>
              {isAdmin && <button onClick={handleCreateRoom} className="w-full border-2 border-misionero-verde text-misionero-verde font-black py-4 rounded-2xl uppercase text-[10px] tracking-widest active:scale-95 transition-all">CREAR SALA</button>}
          </div>

          <div className="w-1/4 h-full overflow-y-auto custom-scroll px-6 py-4 space-y-8">
              <section className="space-y-4">
                 <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Apariencia</h3>
                 <div className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'} p-5 rounded-[2.5rem] border flex items-center justify-between`}>
                    <span className="text-[10px] font-black uppercase tracking-widest">{darkMode ? 'Modo Oscuro' : 'Modo Claro'}</span>
                    <button onClick={() => setDarkMode(!darkMode)} className={`w-14 h-7 rounded-full relative transition-all ${darkMode ? 'bg-misionero-verde' : 'bg-slate-200'}`}>
                      <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-md transition-all ${darkMode ? 'left-8' : 'left-1'}`}></div>
                    </button>
                 </div>
              </section>

              <section className="space-y-4">
                 <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Perfil</h3>
                 <div className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'} p-6 rounded-[2.5rem] border space-y-4`}>
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[8px] font-black uppercase text-slate-400">Nombre de Usuario</span>
                      </div>
                      <input type="text" className={`w-full ${darkMode ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-900'} rounded-2xl px-4 py-4 text-sm font-bold outline-none`} value={newUsername} onChange={e => setNewUsername(e.target.value)} />
                      <button onClick={() => { updateProfile(auth.currentUser!, { displayName: newUsername }).then(() => { updateDoc(doc(db, "users", user.id), { username: newUsername }); alert("Guardado"); }); }} className="w-full mt-3 bg-misionero-azul text-white font-black py-4 rounded-2xl text-[9px] uppercase tracking-widest">Guardar Cambios</button>
                    </div>
                    {user.createdAt && (
                      <div className="pt-4 border-t border-dashed border-slate-700/30">
                          <span className="text-[8px] font-black uppercase text-slate-400">Miembro desde</span>
                          <p className="text-sm font-bold">{new Date(user.createdAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                      </div>
                    )}
                 </div>
              </section>

              <section className="space-y-4 pb-8">
                 <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Seguridad</h3>
                 <form onSubmit={handleChangePassword} className={`${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'} p-6 rounded-[2.5rem] border`}>
                    <div className="space-y-3">
                      <input type="password" placeholder="Contraseña Actual" value={passwordChangeData.current} onChange={e => setPasswordChangeData(p => ({...p, current: e.target.value}))} required className={`w-full ${darkMode ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-900'} rounded-2xl px-4 py-4 text-sm font-bold outline-none`} />
                      <input type="password" placeholder="Nueva Contraseña" value={passwordChangeData.newPass} onChange={e => setPasswordChangeData(p => ({...p, newPass: e.target.value}))} required className={`w-full ${darkMode ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-900'} rounded-2xl px-4 py-4 text-sm font-bold outline-none`} />
                      <input type="password" placeholder="Confirmar" value={passwordChangeData.confirm} onChange={e => setPasswordChangeData(p => ({...p, confirm: e.target.value}))} required className={`w-full ${darkMode ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-900'} rounded-2xl px-4 py-4 text-sm font-bold outline-none`} />
                    </div>
                    {passwordChangeMsg && <div className={`mt-4 text-[9px] font-black text-center uppercase ${passwordChangeMsg.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>{passwordChangeMsg.text}</div>}
                    <button type="submit" disabled={isUpdatingPassword} className="w-full mt-4 bg-misionero-verde text-white font-black py-4 rounded-2xl text-[9px] uppercase tracking-widest active:scale-95 transition-all">{isUpdatingPassword ? '...' : 'Actualizar Pass'}</button>
                 </form>
              </section>
          </div>
        </div>
      </main>

      {view === 'feed' && isAdmin && !activeSong && !editingSong && !activeRoom && (
        <button onClick={() => openSongEditor(null)} className="fixed bottom-[5rem] right-6 w-16 h-16 bg-misionero-rojo text-white rounded-[1.8rem] shadow-2xl flex items-center justify-center z-40 animate-bounce-subtle active:scale-90 transition-transform"><PlusIcon /></button>
      )}

      {/* Global Alert Modal */}
      {globalAlert && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 animate-in fade-in duration-200">
           <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setGlobalAlert(null)}></div>
           <div className={`relative w-full max-w-sm p-6 rounded-[2rem] shadow-2xl border animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-100'}`}>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto ${globalAlert.type === 'error' ? 'bg-misionero-rojo/10 text-misionero-rojo' : 'bg-misionero-azul/10 text-misionero-azul'}`}>
                 {globalAlert.type === 'error' ? (
                   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                 ) : (
                   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                 )}
              </div>
              <h3 className={`text-center font-black text-lg uppercase mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{globalAlert.title}</h3>
              <p className={`text-center text-xs font-bold mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{globalAlert.message}</p>
              <button onClick={() => setGlobalAlert(null)} className={`w-full py-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-transform ${globalAlert.type === 'error' ? 'bg-misionero-rojo text-white' : 'bg-misionero-azul text-white'}`}>Entendido</button>
           </div>
        </div>
      )}

      <nav onTouchStart={(e) => e.stopPropagation()} className={`shrink-0 transition-colors duration-500 ${darkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-white/90 border-slate-100'} border-t w-full px-4 pt-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] flex justify-center gap-14 items-center z-50 max-w-md mx-auto shadow-[0_-10px_30px_rgba(0,0,0,0.05)]`}>
        {VIEW_ORDER.map((v) => {
          const isActive = view === v;
          let activeColorClass = 'text-slate-300';
          let bubbleColorClass = 'bg-slate-400/10';
          if (v === 'feed') { activeColorClass = isActive ? 'text-misionero-azul' : 'text-slate-300'; bubbleColorClass = 'bg-misionero-azul/15'; }
          else if (v === 'favorites') { activeColorClass = isActive ? 'text-misionero-rojo' : 'text-slate-300'; bubbleColorClass = 'bg-misionero-rojo/15'; }
          else if (v === 'room') { activeColorClass = isActive ? 'text-misionero-verde' : 'text-slate-300'; bubbleColorClass = 'bg-misionero-verde/15'; }
          else if (v === 'settings') { activeColorClass = isActive ? (darkMode ? 'text-white' : 'text-slate-900') : 'text-slate-300'; bubbleColorClass = darkMode ? 'bg-white/10' : 'bg-slate-900/10'; }
          return (
            <button key={v} onClick={() => navigateTo(v)} className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${activeColorClass}`}>
              <div className="relative flex items-center justify-center">
                <div className={`absolute inset-x-[-12px] inset-y-[-4px] rounded-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${bubbleColorClass} ${isActive ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}></div>
                <div className={`relative transition-transform duration-300 z-10 ${isActive ? 'scale-110' : 'scale-100'}`}>
                  {v === 'feed' && <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>}
                  {v === 'favorites' && <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>}
                  {v === 'room' && <UsersIcon />}
                  {v === 'settings' && <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5z"/></svg>}
                </div>
              </div>
              <span className={`text-[8px] font-black uppercase tracking-tighter relative z-10 transition-colors duration-300`}>{v === 'feed' ? 'Inicio' : v === 'favorites' ? 'Favs' : v === 'room' ? 'Sala' : 'Ajustes'}</span>
            </button>
          );
        })}
      </nav>
      {editingSong && hasElevatedPermissions && (
        <div className="fixed inset-0 z-[300]">
          <SongForm initialData={typeof editingSong === 'boolean' ? undefined : editingSong} onSave={async (data) => { if (typeof editingSong !== 'boolean' && editingSong) { if (activeSong && activeSong.id === editingSong.id) { setActiveSong(prev => prev ? { ...prev, ...data } : null); } await updateDoc(doc(db, "songs", editingSong.id), data); } else { await addDoc(collection(db, "songs"), { ...data, createdAt: Date.now(), author: user.username }); } goBack(); }} onCancel={goBack} darkMode={darkMode} />
        </div>
      )}
      {activeSong && (
        <div className="fixed inset-0 z-[100]">
          <SongViewer song={activeSong} onBack={goBack} darkMode={darkMode} onEdit={hasElevatedPermissions ? () => openSongEditor(activeSong) : undefined} onDelete={hasElevatedPermissions ? () => handleDeleteSong(activeSong.id) : undefined} />
        </div>
      )}
      {activeRoom && (
        <div className="fixed inset-0 z-[200]">
          <RoomView room={activeRoom} songs={songs} currentUser={user.username} isAdmin={isAdmin} onExit={exitRoom} onUpdateRoom={handleUpdateRoom} darkMode={darkMode} db={db} ADMIN_EMAILS={ADMIN_EMAILS} onEditSong={openSongEditor} onDeleteSong={handleDeleteSong} />
        </div>
      )}
    </div>
  );
};

export default App;