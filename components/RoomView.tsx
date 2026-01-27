import React, { useState, useEffect } from 'react';
import { Room, Song } from '../types';
import { 
  ref as refRtdb, 
  onValue as onValueRtdb, 
  set as setRtdb, 
  remove as removeRtdb, 
  onDisconnect, 
  push, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import SongViewer from './SongViewer';

interface RoomViewProps {
  rtdb: any;
  categories: string[];
  room: Room;
  songs: Song[];
  currentUser: string;
  isAdmin: boolean;
  onExit: () => void;
  onUpdateRoom: (roomId: string, updates: Partial<Room>) => Promise<void>;
  darkMode: boolean;
  db: any;
  onEditSong: (song: Song | null) => void;
  onDeleteSong: (songId: string) => void;
}

const RoomView: React.FC<RoomViewProps> = ({ 
  rtdb, room, songs, currentUser, isAdmin, onExit, onUpdateRoom, darkMode, onEditSong, onDeleteSong 
}) => {
  const [onlineParticipants, setOnlineParticipants] = useState<string[]>([]);
  const [showParticipants, setShowParticipants] = useState(false);
  
  // --- REALTIME PRESENCE SYSTEM ---
  useEffect(() => {
    if (!room.id || !rtdb || !currentUser) return;

    const myPresenceRef = refRtdb(rtdb, `rooms/${room.id}/online/${currentUser}`);
    const connectedRef = refRtdb(rtdb, '.info/connected');

    // Función auxiliar para registrar presencia
    const registerPresence = () => {
        setRtdb(myPresenceRef, { isOnline: true, role: isAdmin ? 'admin' : 'member' });
        onDisconnect(myPresenceRef).remove();
    };

    // 1. Registro inicial
    registerPresence();

    // 2. Re-registrar cuando la app vuelve a primer plano (vuelve de background)
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            registerPresence();
        }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 3. Re-registrar cuando se recupera la conexión a Firebase (ej. pérdida momentánea de señal)
    const connectedListener = onValueRtdb(connectedRef, (snap) => {
        if (snap.val() === true) {
            registerPresence();
        }
    });

    // 4. Escuchar la lista de usuarios online para actualizar la UI
    const onlineUsersRef = refRtdb(rtdb, `rooms/${room.id}/online`);
    const unsubscribe = onValueRtdb(onlineUsersRef, (snapshot) => {
        if (snapshot.exists()) {
            const users = Object.keys(snapshot.val());
            setOnlineParticipants(users);
        } else {
            setOnlineParticipants([]);
        }
    });

    return () => {
        removeRtdb(myPresenceRef); // Limpieza manual al desmontar el componente
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        unsubscribe();
        connectedListener();
    };
  }, [room.id, rtdb, currentUser, isAdmin]);

  const handleSongSelect = (songId: string) => {
      if (!isAdmin) return;
      onUpdateRoom(room.id, { currentSongId: songId });
  };

  const handleCloseSong = () => {
      if (!isAdmin) return;
      onUpdateRoom(room.id, { currentSongId: '' });
  };
  
  const handleTranspose = (val: number) => {
      if (!isAdmin) return;
      onUpdateRoom(room.id, { globalTranspositions: { ...room.globalTranspositions, [room.currentSongId || '']: val } });
  };

  const handleSendReaction = (emoji: string) => {
      const reactionsRef = refRtdb(rtdb, `rooms/${room.id}/reactions`);
      push(reactionsRef, {
          emoji,
          sender: currentUser,
          timestamp: serverTimestamp()
      });
  };

  const currentSong = songs.find(s => s.id === room.currentSongId);
  const currentTranspose = (room.globalTranspositions && room.currentSongId && room.globalTranspositions[room.currentSongId]) || 0;

  if (currentSong) {
      return (
          <SongViewer 
              song={currentSong} 
              onBack={isAdmin ? handleCloseSong : () => {}} 
              isHost={isAdmin}
              onEdit={isAdmin ? () => onEditSong(currentSong) : undefined}
              onDelete={isAdmin ? () => onDeleteSong(currentSong.id) : undefined}
              externalTranspose={currentTranspose}
              onTransposeChange={isAdmin ? handleTranspose : undefined}
              darkMode={darkMode}
              rtdb={rtdb}
              roomId={room.id}
              onSendReaction={handleSendReaction}
          />
      );
  }

  return (
    <div className={`flex flex-col h-full ${darkMode ? 'bg-black text-white' : 'bg-white text-slate-900'}`}>
        <header className={`px-6 pt-12 pb-4 border-b ${darkMode ? 'border-slate-800' : 'border-slate-200'} flex items-center justify-between`}>
            <button onClick={onExit} className={`text-[10px] font-black uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Salir</button>
            <div className="text-center">
                <h1 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sala</h1>
                <div className="text-xl font-black tracking-wider text-misionero-azul">{room.code}</div>
            </div>
            <button onClick={() => setShowParticipants(!showParticipants)} className={`relative w-10 h-10 flex items-center justify-center rounded-full glass-ui ${showParticipants ? 'bg-misionero-azul/20' : ''}`}>
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                 <span className="absolute -top-1 -right-1 w-4 h-4 bg-misionero-verde text-white text-[9px] font-bold flex items-center justify-center rounded-full border-2 border-white dark:border-black">{onlineParticipants.length}</span>
            </button>
        </header>

        <div className="flex-1 overflow-hidden relative">
            {showParticipants && (
                <div className="absolute inset-0 z-20 glass-ui backdrop-blur-md p-6 animate-in fade-in slide-in-from-right duration-200 flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                         <h3 className="text-sm font-black uppercase">Participantes Online</h3>
                         <button onClick={() => setShowParticipants(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg></button>
                    </div>
                    <ul className="space-y-3 overflow-y-auto flex-1 custom-scroll">
                        {onlineParticipants.map(u => (
                            <li key={u} className="flex items-center gap-3 p-3 rounded-2xl glass-ui bg-white/50 dark:bg-slate-800/50">
                                <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                                <span className="font-bold text-sm flex-1">{u}</span>
                                {u === room.host && <span className="text-[7px] px-2 py-1 bg-misionero-rojo text-white rounded-full uppercase font-black tracking-wider">Host</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="p-4 space-y-4 overflow-y-auto h-full pb-24 custom-scroll">
                {!isAdmin && (
                    <div className="p-8 rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-center flex flex-col items-center justify-center gap-4 text-slate-400">
                         <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center"><svg className="w-8 h-8 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 10l12-3"/></svg></div>
                         <p className="text-xs font-bold uppercase tracking-widest max-w-[200px]">Esperando que el anfitrión seleccione una música...</p>
                    </div>
                )}
                
                {isAdmin && (
                    <>
                        <div className="px-2">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Seleccionar Música</p>
                        </div>
                        <div className="grid gap-3">
                            {songs.map(song => (
                                <button 
                                    key={song.id} 
                                    onClick={() => handleSongSelect(song.id)}
                                    className={`flex flex-col text-left p-4 rounded-[1.5rem] glass-ui transition-all active:scale-[0.98] ${room.currentSongId === song.id ? 'ring-2 ring-misionero-azul bg-misionero-azul/5' : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
                                >
                                    <span className="font-black text-sm uppercase truncate w-full">{song.title}</span>
                                    <span className="text-[9px] text-slate-400 font-bold mt-0.5">{song.category} • {song.key}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    </div>
  );
};

export default RoomView;