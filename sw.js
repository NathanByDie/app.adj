// sw.js - Service Worker Principal
// Versión: 1.1 - Forzar actualización para fix de video

// Importamos el script de Firebase Messaging para que las notificaciones push sigan funcionando.
// Usamos una ruta relativa para evitar errores de cross-origin.
importScripts('./firebase-messaging-sw.js');

const CACHE_NAME = 'adjstudios-cache-v1';
// Lista de recursos esenciales para que la app funcione offline.
const APP_SHELL_URLS = [
  './',
  './index.html',
];

// Evento 'install': Se dispara cuando el Service Worker se instala por primera vez.
self.addEventListener('install', (event) => {
  console.log('Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Abriendo caché y guardando App Shell.');
        return cache.addAll(APP_SHELL_URLS);
      })
      .catch(error => {
        console.error('Service Worker: Fallo al cachear App Shell durante la instalación:', error);
      })
  );
});

// Evento 'activate': Se dispara cuando el Service Worker se activa.
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activando...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => {
            console.log('Service Worker: Limpiando caché antigua:', cacheName);
            return caches.delete(cacheName);
          })
      );
    })
  );
  return self.clients.claim();
});

// Evento 'fetch': Intercepta todas las peticiones de red.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar peticiones que no son GET y las de chrome-extension.
  if (request.method !== 'GET' || request.url.startsWith('chrome-extension://')) {
    return;
  }

  // Estrategia "Stale-While-Revalidate" para assets de Firebase (imágenes, audio).
  // Esto sirve desde el caché inmediatamente para velocidad, y actualiza en segundo plano.
  if (url.hostname === 'firebasestorage.googleapis.com') {
    // CRÍTICO: Si la solicitud es para un video, no la interceptamos.
    // Esto permite que el navegador maneje las solicitudes de rango (Range requests)
    // para el streaming, lo cual es esencial para que la reproducción funcione.
    if (/\.(mp4|webm|mov)$/i.test(url.pathname)) {
      return; // Dejar que la solicitud vaya directamente a la red.
    }

    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(request).then(cachedResponse => {
          const fetchPromise = fetch(request).then(networkResponse => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          });
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }
  
  // Estrategia "Cache First" para el App Shell.
  // Si está en caché, lo sirve; si no, va a la red. Ideal para los archivos base de la app.
  event.respondWith(
    caches.match(request).then(response => {
      return response || fetch(request).then(networkResponse => {
        // Opcional: Cachear otros recursos sobre la marcha si es necesario.
        // No lo hacemos por defecto para evitar llenar el caché con recursos no esenciales.
        return networkResponse;
      });
    }).catch(error => {
      console.error('Service Worker: Fallo de fetch:', error);
      // Podríamos devolver una página offline genérica aquí.
    })
  );
});