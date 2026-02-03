# ADJStudios - Acordes Misioneros: Documentación del Proyecto

## 1. Introducción

**ADJStudios - Acordes Misioneros** es una Progressive Web App (PWA) diseñada como una plataforma colaborativa para músicos litúrgicos. Permite a los usuarios gestionar un repertorio de canciones, transponer acordes, organizar listas para eventos y colaborar en tiempo real a través de salas de ensayo virtuales y un chat seguro.

Esta documentación sirve como guía técnica para entender la arquitectura, el flujo de datos y el propósito de cada componente y servicio dentro del proyecto.

## 2. Tecnologías Principales

- **Frontend:** React (con Hooks) y TypeScript.
- **Estilos:** Tailwind CSS para un diseño rápido y responsivo.
- **Base de Datos:**
    - **Firestore:** Base de datos NoSQL principal para datos persistentes como canciones, usuarios, y listas de chats.
    - **Firebase Realtime Database (RTDB):** Para datos efímeros y de alta frecuencia como el estado de conexión (online/offline), indicadores de "escribiendo...", y la sincronización en las salas en vivo.
- **Autenticación:** Firebase Authentication (proveedores de Email/Contraseña y Google).
- **Almacenamiento:** Firebase Storage para archivos multimedia como fotos de perfil, notas de voz, imágenes y videos del chat.
- **Backend Lógico:** Firebase Cloud Functions para operaciones de servidor, como el envío de notificaciones push.
- **PWA y Offline:** Service Workers para cacheo de recursos y funcionamiento sin conexión.
- **Nativo (Opcional):** Capacitor para empaquetar la aplicación web como una app nativa de Android/iOS.

## 3. Estructura del Proyecto

```
/
├── components/           # Componentes reutilizables de React (UI)
│   ├── SongViewer.tsx      # Visualizador de canciones con transposición.
│   ├── RoomView.tsx        # Lógica y UI para las salas en vivo.
│   ├── DirectMessageView.tsx # Vista de una conversación de chat.
│   ├── ChatListView.tsx    # Lista de todas las conversaciones.
│   ├── ImageEditor.tsx     # Editor para imágenes (dibujo, texto, recorte).
│   ├── VideoEditor.tsx     # Editor para videos (dibujo, texto, recorte, compresión).
│   └── ...                 # Otros componentes.
├── services/             # Lógica de negocio y utilidades
│   ├── musicUtils.ts       # Funciones para analizar y transponer acordes.
│   ├── importer.ts         # Lógica para importar canciones de LaCuerda.net.
│   ├── security.ts         # Implementación del cifrado de extremo a extremo (ASMP).
│   ├── cache.ts            # Gestión del caché en IndexedDB.
│   ├── haptics.ts          # Control de la vibración del dispositivo.
│   └── notifications.ts    # Lógica para registrar y manejar notificaciones push.
├── contexts/             # Contextos de React para estado global
│   └── AudioPlayerContext.tsx # Gestiona un único reproductor de audio global.
├── hooks/                # Hooks personalizados de React
│   └── useCachedMedia.ts   # Hook para gestionar medios cacheados (ahora delegado al Service Worker).
├── functions/            # Código para Firebase Cloud Functions
│   ├── index.js            # Función principal que envía notificaciones.
│   └── package.json        # Dependencias de las funciones.
├── public/               # (Conceptual) Archivos estáticos
│   ├── index.html          # Punto de entrada de la aplicación.
│   ├── manifest.json       # Configuración de la PWA.
│   ├── sw.js               # Service Worker principal (offline y cacheo).
│   └── firebase-messaging-sw.js # Service Worker para notificaciones push en segundo plano.
├── App.tsx               # Componente raíz, gestiona estado global, rutas y overlays.
├── index.tsx             # Renderiza la app y registra el Service Worker.
├── types.ts              # Definiciones de tipos de TypeScript para todo el proyecto.
├── constants.tsx         # Constantes y componentes de iconos.
└── capacitor.config.ts   # Configuración para la compilación nativa con Capacitor.
```

## 4. Características Clave y Funcionamiento

### a. Autenticación y Usuarios (`App.tsx`)

- **Flujo:** Utiliza Firebase Auth con persistencia local. `onAuthStateChanged` es el listener principal que determina si un usuario está logueado.
- **Roles:** Los usuarios tienen un rol (`member` o `admin`). El rol de "admin" desbloquea funcionalidades como la creación de salas y la edición de canciones. Hay un `SUPER_ADMIN_EMAIL` hardcodeado con permisos adicionales.
- **Datos de Usuario:** La información del perfil (username, biografía, foto) se almacena en una colección `users` en Firestore, separada de la data de Auth.

### b. Gestión de Canciones (`SongViewer.tsx`, `SongForm.tsx`, `musicUtils.ts`)

- **Visualización:** `SongViewer` muestra el contenido de una canción. Permite ajustar el tamaño de fuente, transponer el tono y aplicar un capo virtual.
- **Transposición:** La lógica reside en `musicUtils.ts`.
    - `isChordLine()`: Un algoritmo heurístico que analiza una línea para determinar si contiene acordes o letra, basándose en patrones de acordes y una lista negra de palabras comunes.
    - `transposeSong()`: Itera sobre el contenido, identifica las líneas de acordes y reemplaza cada acorde usando `transposeRoot()`.
    - `findBestCapo()`: Un algoritmo que calcula la "dificultad" de los acordes en diferentes posiciones de capo para sugerir la más sencilla de tocar.
- **Edición y Creación:** `SongForm` permite crear nuevas canciones o editar existentes. Incluye un importador de LaCuerda.net.

### c. Salas en Vivo (`RoomView.tsx`)

- **Tecnología:** Sincronización en tiempo real mediante **Firebase Realtime Database**.
- **Funcionamiento:**
    1.  El "Host" (anfitrión) crea una sala, generando un código único.
    2.  Los participantes se unen usando el código. Su presencia se registra en `/rooms/{roomId}/participants/{username}` en RTDB.
    3.  Cuando el Host selecciona una canción o cambia la transposición, estos cambios se escriben en el documento de la sala en Firestore (`/rooms/{roomId}`).
    4.  Los demás participantes (clientes) tienen un listener (`onSnapshot`) en ese documento. Cuando detectan un cambio en `currentSongId` o `globalTranspositions`, actualizan su propia vista para reflejar lo que el Host está viendo.

### d. Chat Seguro y Cifrado E2EE (`DirectMessageView.tsx`, `security.ts`)

- **Protocolo ASMP:** Se implementa un cifrado de extremo a extremo llamado "ADJStudios Secure Mobile Protocol".
- **Generación de Clave:** En `security.ts`, la función `deriveKey` genera una clave de cifrado AES-GCM de 256 bits. **Crucialmente, esta clave no se guarda ni se transmite**. Se deriva matemáticamente en el dispositivo de cada usuario usando el `chatId` (ej: `userId1_userId2`) como "contraseña" a través del algoritmo PBKDF2 con 100,000 iteraciones. Esto asegura que solo los dos participantes del chat puedan generar la misma clave.
- **Cifrado:** Antes de enviar un mensaje, se cifra el texto usando la clave derivada y un vector de inicialización (IV) aleatorio. El resultado enviado a Firestore es una cadena `IV:TextoCifrado`.
- **Descifrado:** Al recibir un mensaje, el cliente receptor usa el mismo `chatId` para derivar la misma clave, extrae el IV y descifra el contenido.
- **Privacidad:** Como la clave nunca sale del dispositivo, los servidores de Firebase solo almacenan texto cifrado ininteligible. Ni los administradores ni un tercero pueden leer el contenido de los mensajes.

### e. Gestión Multimedia (Imágenes y Videos)

- **Flujo de Envío:**
    1.  El usuario selecciona un archivo a través del input en `DirectMessageView.tsx`.
    2.  Si es una imagen o video, se abre el editor correspondiente (`ImageEditor.tsx` o `VideoEditor.tsx`).
    3.  **Edición:** El usuario puede dibujar, añadir texto, recortar o acortar la duración. El video se procesa en un `<canvas>` para aplicar las ediciones.
    4.  **Compresión (Video):** Al exportar el video, `MediaRecorder` se configura con un `videoBitsPerSecond` de 1 Mbps para reducir drásticamente el tamaño del archivo, manteniendo una calidad aceptable. Prioriza el formato `.mp4` para compatibilidad con iOS.
    5.  **Subida:** El blob final (imagen o video) se sube a Firebase Storage en la ruta `chat_media/{userId}/{chatId}/{fileName}`.
    6.  **Mensaje:** Se obtiene la URL de descarga del archivo y se envía un mensaje de tipo `image` o `video` en el chat.

### f. PWA, Offline y Notificaciones Push

- **Service Worker (`sw.js`):**
    - **Instalación:** Cachea el "App Shell" (archivos básicos como `index.html`).
    - **Fetch:** Intercepta todas las peticiones de red.
        - **Estrategia Stale-While-Revalidate:** Para recursos de Firebase Storage (imágenes, audio), sirve el contenido desde el caché si está disponible (para velocidad) y, simultáneamente, pide una versión actualizada a la red para el próximo uso.
        - **Estrategia Cache First:** Para el App Shell, siempre sirve desde el caché si es posible.
- **Notificaciones Push (`notifications.ts`, `functions/index.js`):**
    1.  **Registro del Cliente:** `initializePushNotifications` se llama al iniciar sesión. Usa las APIs de Capacitor (nativo) o Web Push (web) para obtener un token FCM del dispositivo.
    2.  **Guardado del Token:** Este token se guarda en el documento del usuario en Firestore (`users/{userId}/fcmToken`).
    3.  **Activación del Backend:** La Cloud Function `sendChatNotification` en `functions/index.js` tiene un *trigger* `onCreate` en la colección `chats/{chatId}/messages/{messageId}`.
    4.  **Envío:** Cuando se crea un mensaje, la función:
        - Identifica al destinatario.
        - Busca su `fcmToken` en Firestore.
        - Construye un `payload` de notificación.
        - Usa el SDK de Admin de Firebase para enviar la notificación a través de FCM al token del destinatario.

## 5. Estructura de Firebase

- **Firestore:**
    - `songs`: Colección con todos los documentos de canciones.
    - `users`: Perfiles de usuario, roles, tokens FCM, y lista de favoritos.
    - `rooms`: Documentos para cada sala en vivo, con su código y estado actual.
    - `user_chats/{userId}/chats/{chatId}`: Subcolección que almacena la lista de chats de un usuario, con metadatos como el último mensaje y contador de no leídos.
    - `chats/{chatId}/messages/{messageId}`: Subcolección que contiene los mensajes reales de una conversación.
- **Realtime Database:**
    - `/status/{userId}`: Almacena el estado de conexión (`online`/`offline`) de cada usuario.
    - `/rooms/{roomId}/participants`: Lista de usuarios actualmente en una sala.
    - `/typing/{chatId}/{userId}`: Indicadores de "escribiendo...".
- **Storage:**
    - `profile_pictures/`: Fotos de perfil.
    - `chat_media/`: Imágenes, videos y audios enviados en el chat.
    - `songs/`: Notas de voz asociadas a las canciones.

## 6. Variables y Configuraciones

- **Configuración de Firebase:** La configuración del proyecto Firebase está hardcodeada en `App.tsx` y los service workers. En un entorno de producción más grande, esto se movería a variables de entorno.
- **`SUPER_ADMIN_EMAIL`:** En `App.tsx`, define el correo del superadministrador que puede gestionar a otros administradores.
- **`VAPID_KEY`:** En `services/notifications.ts`, es la clave para las notificaciones web push.
