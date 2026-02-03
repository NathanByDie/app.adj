import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Registro del Service Worker para PWA y Notificaciones Push
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // FIX DEFINITIVO: Construimos la URL absoluta manualmente usando el origen actual.
    // Esto evita que las rutas relativas se resuelvan contra el dominio del editor (ai.studio)
    // y evita el uso de 'new URL()' que fallaba anteriormente.
    const swUrl = `${window.location.origin}/sw.js`;

    navigator.serviceWorker.register(swUrl)
      .then(registration => {
        console.log('Service Worker registrado con éxito:', registration.scope);
      })
      .catch(error => {
        // Usamos warn en lugar de error para no alarmar si falla en entornos muy restrictivos
        console.warn('Nota: El Service Worker no se pudo registrar (esto es normal en algunos entornos de preview):', error);
      });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);