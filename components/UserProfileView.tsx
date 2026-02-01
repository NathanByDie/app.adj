
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User as AppUser, Song } from '../types';
import { Firestore, doc, updateDoc } from 'firebase/firestore';
import { FirebaseStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import useCachedMedia from '../hooks/useCachedMedia';

interface UserProfileViewProps {
    user: AppUser;
    currentUser: AppUser;
    onBack: () => void;
    onSaveBio: (newBio: string) => Promise<void>;
    songs: Song[];
    onOpenSong: (song: Song) => void;
    darkMode: boolean;
    onUpdateUsername?: (newUsername: string, password_confirmation: string) => Promise<void>;
    onDeleteAccountRequest?: () => void;
    db: Firestore;
    storage: FirebaseStorage;
}

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


const UserProfileView: React.FC<UserProfileViewProps> = ({ 
    user, 
    currentUser, 
    onBack, 
    onSaveBio, 
    songs, 
    onOpenSong,
    darkMode,
    onUpdateUsername,
    onDeleteAccountRequest,
    db,
    storage
}) => {
    const isMe = user.id === currentUser.id;
    
    // Bio State
    const [biography, setBiography] = useState(user.biography || '');
    const [isEditingBio, setIsEditingBio] = useState(false);
    const [isSavingBio, setIsSavingBio] = useState(false);

    // Username State
    const [isEditingUsername, setIsEditingUsername] = useState(false);
    const [newUsername, setNewUsername] = useState(user.username);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSavingUsername, setIsSavingUsername] = useState(false);

    // Photo Upload State
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const photoInputRef = useRef<HTMLInputElement>(null);
    const cachedPhotoUrl = useCachedMedia(user.photoURL);

    const favoriteSongs = songs.filter(s => (user.favorites || []).includes(s.id));

    const joinDate = useMemo(() => {
        if (!user.createdAt) return 'Desconocido';
        try {
            const date = new Date(user.createdAt);
            if (isNaN(date.getTime())) return 'Desconocido';
            return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
        } catch (e) {
            return 'Desconocido';
        }
    }, [user.createdAt]);

    const handleSaveBio = async () => {
        setIsSavingBio(true);
        await onSaveBio(biography);
        setIsSavingBio(false);
        setIsEditingBio(false);
    };

    const handleSaveUsername = async () => {
        if (isMe && onUpdateUsername) {
            if (!password) {
                alert("Por favor, introduce tu contraseña para confirmar.");
                return;
            }
            setIsSavingUsername(true);
            try {
                await onUpdateUsername(newUsername, password);
                setIsEditingUsername(false);
                setPassword('');
            } catch (error) {
                // Error alert is handled in App.tsx
            } finally {
                setIsSavingUsername(false);
            }
        }
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !isMe) return;

        setIsUploadingPhoto(true);
        try {
            const filePath = `profile_pictures/${currentUser.id}`;
            const fileRef = storageRef(storage, filePath);
            await uploadBytes(fileRef, file);
            const photoURL = await getDownloadURL(fileRef);
            await updateDoc(doc(db, 'users', currentUser.id), { photoURL });
        } catch (error) {
            console.error("Error al subir foto:", error);
            alert("Error al subir la foto. Inténtalo de nuevo.");
        } finally {
            setIsUploadingPhoto(false);
        }
    };

    return (
        <div className={`fixed inset-0 z-[200] flex flex-col animate-in slide-in-from-right duration-300 ${darkMode ? 'bg-black' : 'bg-white'}`}>
            {/* Header */}
            <header className={`px-4 pt-12 pb-3 border-b ${darkMode ? 'border-slate-800 bg-black' : 'border-slate-100 bg-white'} flex items-center gap-3 shrink-0 z-20`}>
                <button onClick={onBack} className="p-2 rounded-full active:scale-90">
                    <svg className={`w-6 h-6 ${darkMode ? 'text-white' : 'text-slate-900'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <h3 className={`font-black uppercase text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>Perfil de Usuario</h3>
            </header>

            <div className="flex-1 overflow-y-auto custom-scroll pb-20">
                {/* Hero Section */}
                <div className="flex flex-col items-center pt-8 pb-6 px-6">
                    <div className="relative w-28 h-28 mb-4 animate-in zoom-in-50 duration-300">
                        {cachedPhotoUrl ? (
                            <img src={cachedPhotoUrl} alt={user.username} className="w-28 h-28 rounded-full object-cover shadow-2xl" />
                        ) : (
                            <div className="w-28 h-28 rounded-full bg-misionero-azul flex items-center justify-center text-5xl font-black text-white shadow-2xl">
                                {user.username.charAt(0).toUpperCase()}
                            </div>
                        )}
                        {isMe && (
                            <>
                                <button
                                    onClick={() => photoInputRef.current?.click()}
                                    disabled={isUploadingPhoto}
                                    className="absolute -bottom-1 -right-1 w-9 h-9 bg-misionero-azul text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white dark:border-black active:scale-90 transition-transform"
                                >
                                    {isUploadingPhoto ? (
                                        <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L14.732 3.732z" /></svg>
                                    )}
                                </button>
                                <input type="file" ref={photoInputRef} onChange={handlePhotoUpload} hidden accept="image/*" />
                            </>
                        )}
                    </div>
                    
                    {isEditingUsername ? (
                        <div className="w-full max-w-sm space-y-3 animate-in fade-in duration-300">
                             <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} className={`w-full text-center text-2xl font-black uppercase tracking-tight rounded-2xl p-2 outline-none ${darkMode ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-900'}`} />
                             <div className="relative">
                                 <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña actual" className={`w-full text-center text-sm font-bold rounded-2xl p-3 outline-none ${darkMode ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-900'}`} />
                                  <button type="button" onClick={() => setShowPassword(!showPassword)} className={`absolute inset-y-0 right-0 flex items-center pr-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{showPassword ? <EyeOffIcon/> : <EyeIcon/>}</button>
                             </div>
                             <div className="flex gap-2">
                                 <button onClick={() => { setIsEditingUsername(false); setNewUsername(user.username); setPassword(''); }} className={`flex-1 px-4 py-2 rounded-xl text-[10px] font-black uppercase ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600'}`}>Cancelar</button>
                                 <button onClick={handleSaveUsername} disabled={isSavingUsername} className="flex-1 px-4 py-2 rounded-xl bg-misionero-verde text-white text-[10px] font-black uppercase shadow-lg active:scale-95 transition-transform">{isSavingUsername ? '...' : 'Guardar'}</button>
                             </div>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-3">
                                <h2 className={`text-2xl font-black uppercase tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                    {user.username}
                                </h2>
                                {isMe && onUpdateUsername && (
                                    <button onClick={() => setIsEditingUsername(true)} className={`p-2 rounded-full transition-colors ${darkMode ? 'text-slate-500 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-100'}`}>
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L14.732 3.732z" /></svg>
                                    </button>
                                )}
                            </div>
                            <p className={`text-[10px] font-bold uppercase mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                Miembro desde {joinDate}
                            </p>
                            {user.role === 'admin' && (
                                <span className="mt-2 bg-misionero-rojo/20 text-misionero-rojo px-3 py-1 rounded-full text-[9px] font-black uppercase">
                                    Administrador
                                </span>
                            )}
                        </>
                    )}
                </div>

                {/* Biography Section */}
                <div className="px-6 mb-8">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Biografía</h4>
                        {isMe && !isEditingBio && (
                            <button onClick={() => setIsEditingBio(true)} className="text-[10px] font-bold text-misionero-azul uppercase">Editar</button>
                        )}
                    </div>
                    
                    {isEditingBio ? (
                        <div className="space-y-3 animate-in fade-in">
                            <textarea 
                                value={biography}
                                onChange={(e) => setBiography(e.target.value)}
                                className={`w-full h-32 rounded-2xl p-4 text-sm font-medium outline-none resize-none ${darkMode ? 'bg-slate-900 text-white border-slate-800' : 'bg-slate-100 text-slate-800 border-slate-200'} border`}
                                placeholder="Escribe algo sobre ti..."
                                maxLength={300}
                            />
                            <div className="flex justify-end gap-2">
                                <button onClick={() => { setIsEditingBio(false); setBiography(user.biography || ''); }} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600'}`}>Cancelar</button>
                                <button onClick={handleSaveBio} disabled={isSavingBio} className="px-4 py-2 rounded-xl bg-misionero-verde text-white text-[10px] font-black uppercase shadow-lg active:scale-95 transition-transform">
                                    {isSavingBio ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className={`p-4 rounded-2xl min-h-[80px] ${darkMode ? 'bg-slate-900/50 text-slate-300' : 'bg-slate-50 text-slate-600'} border ${darkMode ? 'border-white/5' : 'border-slate-100'}`}>
                            <p className="text-sm italic leading-relaxed">
                                {user.biography || "Sin biografía aún."}
                            </p>
                        </div>
                    )}
                </div>

                {/* Favorites Section */}
                <div className="px-4">
                    <h4 className={`px-2 mb-3 text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Favoritos ({favoriteSongs.length})
                    </h4>
                    
                    {favoriteSongs.length > 0 ? (
                        <div className="grid grid-cols-1 gap-2">
                            {favoriteSongs.map((song) => (
                                <div 
                                    key={song.id} 
                                    onClick={() => onOpenSong(song)}
                                    className={`flex items-center justify-between p-4 rounded-2xl active:scale-[0.98] transition-transform cursor-pointer ${darkMode ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-100 shadow-sm'} border`}
                                >
                                    <div className="min-w-0">
                                        <h5 className={`font-black text-xs uppercase truncate ${darkMode ? 'text-white' : 'text-slate-800'}`}>{song.title}</h5>
                                        <p className={`text-[9px] font-bold ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{song.key} • {song.author}</p>
                                    </div>
                                    <svg className={`w-4 h-4 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className={`text-center py-8 rounded-2xl border-2 border-dashed ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                            <p className={`text-[10px] font-bold uppercase ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                                Aún no ha guardado favoritos
                            </p>
                        </div>
                    )}
                </div>

                {isMe && onDeleteAccountRequest && (
                    <div className="px-6 mt-8">
                        <h4 className={`px-2 mb-3 text-[10px] font-black uppercase tracking-widest text-red-500/70`}>
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
                    </div>
                )}
            </div>
        </div>
    );
};

export default UserProfileView;