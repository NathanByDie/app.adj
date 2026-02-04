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

### g. Deep Linking (Enlaces Profundos)

- **Problema:** En la versión nativa (APK/IPA) generada por Median/GoNative, abrir la aplicación desde un enlace externo (ej. `https://adjstd.netlify.app/?song=SONG_ID`) no pasaba automáticamente los parámetros de la URL a la vista web, por lo que la canción no se cargaba.
- **Solución:**
    1.  **Receptor Nativo:** Se ha definido una función global en `App.tsx`: `window.median.app.receivedLink`. El contenedor nativo de Median está configurado para llamar a esta función cada vez que la aplicación se abre a través de un enlace.
    2.  **Análisis y Evento:** Esta función recibe la URL completa, la analiza para extraer parámetros (como `songId`), y luego dispara un `CustomEvent` llamado `deep-link-received` en el objeto `window`.
    3.  **Listener en React:** El componente `App.tsx` tiene un `useEffect` que escucha este evento. Al capturarlo, extrae el `songId`, busca la canción correspondiente en el estado de la aplicación y, si la encuentra, llama a la función `openSongViewer` para mostrarla.
    - **Resultado:** Esto permite que los enlaces de canciones compartidos abran directamente la canción correcta dentro de la aplicación nativa, mejorando la experiencia del usuario.

## 5. Guía del Usuario y Funcionalidades

Esta sección describe cómo los usuarios interactúan con las características principales de la aplicación.

### a. Navegación Principal
La aplicación utiliza una barra de navegación inferior (en móvil) o una barra lateral (en escritorio) con cinco vistas principales:
- **Repertorio:** La vista principal donde se listan todas las canciones.
- **Favoritos:** Muestra solo las canciones que has marcado como favoritas.
- **Chat:** Lista de conversaciones privadas y seguras.
- **Sala:** Lobby para unirse o crear salas de ensayo en vivo.
- **Ajustes:** Opciones de configuración de la cuenta y la aplicación.

En dispositivos móviles, también puedes **deslizar el dedo hacia la izquierda o derecha** para cambiar entre estas vistas principales.

### b. Gestión de Cuenta (en Ajustes)

- **Cambiar Contraseña:**
    1.  Ve a la pestaña `Ajustes`.
    2.  En la sección "Seguridad", encontrarás un formulario para cambiar tu contraseña.
    3.  Debes ingresar tu contraseña actual y luego la nueva contraseña dos veces para confirmar.
    4.  Haz clic en "Actualizar Pass". Se requiere una conexión a internet activa.

- **Editar Perfil (Nombre, Foto, Biografía):**
    1.  Ve a `Ajustes`.
    2.  Toca la tarjeta superior que muestra tu foto y nombre de usuario para ir a tu perfil.
    3.  **Foto:** Toca el icono de lápiz en tu foto de perfil para seleccionar una nueva imagen de tu dispositivo.
    4.  **Nombre:** Toca el icono de lápiz junto a tu nombre. Deberás confirmar tu contraseña actual por seguridad.
    5.  **Biografía:** Toca "Editar" en la sección de biografía para escribir o cambiar tu descripción.

- **Vincular con Google:**
    - Si te registraste con correo y contraseña, en `Ajustes` > `Seguridad` verás un botón para "Vincular con Google". Esto te permite iniciar sesión más rápidamente en el futuro con tu cuenta de Google.

- **Eliminar Cuenta:**
    1.  Ve a tu perfil (desde `Ajustes`).
    2.  Al final de la página, en la "Zona de Peligro", encontrarás el botón "Eliminar mi cuenta".
    3.  Se te pedirá que confirmes la acción. **Esta acción es irreversible y borrará todos tus datos.**

### c. Uso del Cancionero (`SongViewer`)

- **Controles de Visualización:**
    - Al ver una canción, toca el **botón flotante azul con un signo de "+"** para abrir el panel de control.
    - **Tono:** Sube o baja el tono de la canción por semitonos. El cambio se refleja en tiempo real.
    - **Zoom:** Aumenta o disminuye el tamaño de la letra y los acordes.
    - **Capo:** Establece un capo virtual. Los acordes se ajustarán automáticamente para que toques las formas más sencillas mientras el sonido corresponde al tono original.
    - **Sugerir Capo (Icono de varita mágica):** La aplicación calculará y aplicará la posición del capo que resulta en los acordes más fáciles de tocar para esa canción y tono.

### d. Salas en Vivo

- **Unirse a una Sala:**
    1.  Ve a la pestaña `Sala`.
    2.  Introduce el código de 4 a 8 caracteres de la sala en el campo de texto.
    3.  Pulsa "UNIRME".
- **Crear una Sala (Solo Admins):**
    1.  Si eres administrador, verás un botón "CREAR SALA" en la pestaña `Sala`.
    2.  Al pulsarlo, se creará una nueva sala con un código único y serás el anfitrión.
- **Sincronización:**
    - **Anfitrión (Host):** Lo que el anfitrión ve (canción seleccionada, transposición) se sincroniza con todos los participantes.
    - **Participantes:** Por defecto, los participantes siguen al anfitrión. Pueden desactivar temporalmente esta sincronización con el toggle "Seguir al Host" para navegar por su cuenta.

### e. Funciones de Chat

- **Enviar Archivos Multimedia:** En una conversación, pulsa el icono de `+` para seleccionar imágenes, videos o archivos de tu dispositivo.
- **Notas de Voz:** Mantén presionado el icono del micrófono para grabar una nota de voz. Suéltalo para enviarla.
- **Reaccionar:** Mantén presionado un mensaje para que aparezca el menú de reacciones (👍, ❤️, etc.).
- **Responder:** Desliza un mensaje hacia la derecha para citarlo en tu respuesta.

### f. Tareas Administrativas (Solo Admins)

- **Gestionar Canciones:**
    - **Añadir:** En la vista de `Repertorio`, un botón flotante rojo permite añadir una nueva canción.
    - **Editar/Eliminar:** Dentro del visor de una canción, el menú de opciones (`...`) permite editar o eliminar la canción.
- **Gestionar Categorías:**
    - En `Ajustes`, los administradores tienen un panel para "Administrar Categorías" donde pueden añadir, renombrar o eliminar las categorías de los momentos litúrgicos.
- **Gestionar Admins (Solo Super Admin):**
    - El usuario definido como `SUPER_ADMIN_EMAIL` ve un panel especial en `Ajustes` para promover a otros usuarios a "admin" o revocarles el rol.

## 6. Estructura de Firebase

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

## 7. Variables y Configuraciones

- **Configuración de Firebase:** La configuración del proyecto Firebase está hardcodeada en `App.tsx` y los service workers. En un entorno de producción más grande, esto se movería a variables de entorno.
- **`SUPER_ADMIN_EMAIL`:** En `App.tsx`, define el correo del superadministrador que puede gestionar a otros administradores.
- **`VAPID_KEY`:** En `services/notifications.ts`, es la clave para las notificaciones web push.

## 8. Guía de Composición Musical para el Chatbot

Esta sección proporciona contexto al asistente de IA ("SOPORTE") para que pueda guiar a los usuarios en la creación de música desde cero.

### a. Estructura Básica de una Canción
Una canción típica se compone de varias partes:
- **Estrofa (Verse):** Desarrolla la historia o la idea principal. La melodía suele ser la misma en cada estrofa, pero la letra cambia.
- **Estribillo (Chorus):** Es la parte más pegadiza y repetitiva de la canción. Contiene el mensaje central y suele tener la misma letra y melodía cada vez que aparece.
- **Puente (Bridge):** Una sección que ofrece un contraste musical y lírico. Rompe la monotonía entre estrofas y estribillos y prepara el clímax final.

### b. Progresiones de Acordes Populares
Las progresiones son secuencias de acordes que suenan bien juntas. Aquí hay algunas muy comunes para empezar:
- **I - V - vi - IV (La más popular):**
    - En Do Mayor: `Do - Sol - Lam - Fa`
    - En Sol Mayor: `Sol - Re - Mim - Do`
- **vi - IV - I - V:**
    - En Do Mayor: `Lam - Fa - Do - Sol`
- **I - IV - V - I:**
    - En Do Mayor: `Do - Fa - Sol - Do`
- **ii - V - I (Típica de Jazz y Gospel):**
    - En Do Mayor: `Rem - Sol - Do`

*El chatbot puede sugerir estas progresiones y explicar que los números romanos (I, ii, IV, V, vi) representan los grados de la escala musical.*

### c. Letra y Melodía
- **Letra:**
    1.  **Idea Central:** ¿De qué trata la canción? (Ej: gratitud, alabanza, una historia bíblica).
    2.  **Lluvia de Ideas:** Anota palabras y frases relacionadas con tu idea.
    3.  **Rima y Ritmo:** No todas las líneas tienen que rimar, pero un buen patrón rítmico ayuda a que la letra fluya.
- **Melodía:**
    1.  **Experimenta:** Tararea sobre la progresión de acordes que elegiste.
    2.  **Contorno:** La melodía de la estrofa puede ser más conversacional, mientras que la del estribillo puede ser más alta y enérgica.

### d. Pasos para Empezar
1.  **Elige una Tonalidad y una Progresión:** Empieza con una de las progresiones populares.
2.  **Crea el Estribillo:** Enfócate en la parte más importante. Encuentra una melodía y letra pegadiza para tu idea central.
3.  **Escribe las Estrofas:** Desarrolla la historia. La melodía puede ser más simple que la del estribillo.
4.  **Añade un Puente (Opcional):** Si sientes que la canción es repetitiva, crea una sección con acordes o una melodía diferente para darle un respiro antes del último estribillo.
5.  **¡Graba y Comparte!** Usa el editor de la app para guardar tu nueva canción.

### e. El Círculo de Quintas
El Círculo de Quintas es una herramienta visual que organiza las 12 tonalidades musicales. Es fundamental para entender la relación entre acordes y crear progresiones armónicas.

- **¿Cómo funciona?**
    - Moviéndose en el sentido de las agujas del reloj, cada tonalidad está a un intervalo de "quinta justa" de la anterior (ej. de Do a Sol hay una quinta).
    - Moviéndose en sentido contrario, cada tonalidad está a una "cuarta justa" (o una quinta hacia abajo).
- **Orden de las Tonalidades (Sostenidos):** `Do - Sol - Re - La - Mi - Si - Fa# - Do#`
- **Orden de las Tonalidades (Bemoles):** `Do - Fa - Sib - Mib - Lab - Reb - Solb`
- **Uso para Componer:**
    1.  **Acordes Relacionados:** Los acordes que están juntos en el círculo suenan muy bien entre sí. Si tu canción está en **Do Mayor**, los acordes más cercanos y armónicos son **Sol Mayor** (a la derecha) y **Fa Mayor** (a la izquierda). Estos son los acordes IV y V de la tonalidad, que junto con el I (Do) forman la base de muchísimas canciones.
    2.  **Relativo Menor:** Cada tonalidad mayor tiene un "relativo menor" que comparte la misma armadura de clave. Se encuentra tres semitonos por debajo. Por ejemplo, el relativo menor de **Do Mayor** es **La menor**. Usar el relativo menor (vi) es una excelente forma de añadir emoción. La progresión `Do - Sol - Lam - Fa` (I-V-vi-IV) es un claro ejemplo.
    3.  **Crear Progresiones:** Puedes crear progresiones moviéndote por el círculo. Un movimiento muy común es el **ii-V-I**. En Do Mayor, esto sería `Rem - Sol - Do`. En el círculo, esto se ve como un movimiento anti-horario.

### f. Asistencia Creativa y Géneros
El bot puede actuar como un colaborador creativo. Para ello, debe entender cómo diferentes géneros y sentimientos afectan la composición.

- **Rol Creativo:**
    - **Sugerir Letras:** Basado en un tema (ej. "alegría", "perdón", "alabanza"), el bot puede generar estrofas o estribillos de ejemplo.
    - **Modificar Letras:** El usuario puede proporcionar una letra y el bot puede sugerir mejoras, sinónimos o reestructuraciones.
    - **Sugerir Acordes y Género:** Puede proponer progresiones de acordes que se ajusten a un género o sentimiento específico.
    - **Ser Interactivo:** Debe hacer preguntas para entender la necesidad del usuario, como: "¿Qué sentimiento quieres transmitir?", "¿Qué tan rápida o lenta imaginas la canción?", "¿Tienes alguna frase o idea inicial?".

- **Guía de Géneros:**
    - **Pop/Balada:** Generalmente en 4/4. Usa progresiones comunes como I-V-vi-IV (Do-Sol-Lam-Fa) o vi-IV-I-V (Lam-Fa-Do-Sol). Las baladas son más lentas y emotivas, mientras que el pop es más enérgico.
    - **Cumbia:** Ritmo 2/4, alegre y bailable. Armónicamente simple. Suelen usar progresiones de dos o cuatro acordes. Ej: `Lam - Sol - Fa - Mi`, o `Do - Sol - Fa - Sol`.
    - **Bachata:** Ritmo 4/4, romántico y melancólico. Se caracteriza por guitarras arpegiadas. Progresiones comunes: `Lam - Fa - Do - Sol` (vi-IV-I-V) o `Mim - Do - Sol - Re` (vi-IV-I-V en Sol).
    - **Folklore (Argentino):** Ritmos más complejos, a menudo en 6/8 (Zamba, Chacarera). Las letras hablan de la tierra, el amor y paisajes. Las armonías pueden ser más ricas, pero una base simple puede ser `Lam - Mi - Lam - Sol - Do - Sol - Do - Mi`.

- **Adaptación al Sentimiento:**
    - **Alegre/Jubiloso:** Usar tonalidades mayores (Do, Sol, Re). Ritmos rápidos y progresiones ascendentes.
    - **Triste/Melancólico:** Usar tonalidades menores (Lam, Mim, Sim). Ritmos lentos, acordes menores y progresiones descendentes. El uso del `vi` grado (relativo menor) es muy efectivo.
    - **Solemne/Meditativo:** Ritmos lentos, uso de pausas y acordes sostenidos. Progresiones simples y repetitivas.

### g. Tonalidades y Escalas (Keys and Scales)
Una tonalidad define el grupo de notas sobre las que se construye una canción, dándole su "centro" sonoro. La base es la escala mayor, que sigue una fórmula de distancias (tonos y semitonos): `Tono-Tono-Semitono-Tono-Tono-Tono-Semitono`.

- **Escala de Do Mayor (C Major):** Es la más sencilla, sin alteraciones (sostenidos # o bemoles b).
    - `Do - Re - Mi - Fa - Sol - La - Si` (C - D - E - F - G - A - B)

- **Otras Tonalidades Mayores:**
    - **Sol (G):** Sol - La - Si - Do - Re - Mi - Fa#
    - **Re (D):** Re - Mi - Fa# - Sol - La - Si - Do#
    - **La (A):** La - Si - Do# - Re - Mi - Fa# - Sol#
    - **Mi (E):** Mi - Fa# - Sol# - La - Si - Do# - Re#
    - **Si (B):** Si - Do# - Re# - Mi - Fa# - Sol# - La#
    - **Fa (F):** Fa - Sol - La - Sib - Do - Re - Mi
    - **Sib (Bb):** Sib - Do - Re - Mib - Fa - Sol - La
    - **Mib (Eb):** Mib - Fa - Sol - Lab - Sib - Do - Re

- **¿Cómo se usa?**
    Los acordes de una tonalidad se forman usando estas notas. Por ejemplo, en **Do Mayor**, los acordes básicos son:
    - **I:** Do Mayor (Do-Mi-Sol)
    - **ii:** Re menor (Re-Fa-La)
    - **iii:** Mi menor (Mi-Sol-Si)
    - **IV:** Fa Mayor (Fa-La-Do)
    - **V:** Sol Mayor (Sol-Si-Re)
    - **vi:** La menor (La-Do-Mi) - *Este es el relativo menor.*
    - **vii°:** Si disminuido (Si-Re-Fa)
