import { useState, useEffect } from 'react';

const useCachedMedia = (remoteUrl?: string): string | undefined => {
    // El Service Worker ahora se encarga de toda la lógica de cacheo de red.
    // Este hook se simplifica para devolver directamente la URL, permitiendo
    // que el navegador (`<img>`, `<audio>`) haga la petición. El Service Worker
    // interceptará esa petición y servirá desde el caché si está disponible.
    // Esto evita los problemas de CORS que surgían al usar `fetch()`
    // programáticamente en contenido de otro dominio.
    return remoteUrl;
};

export default useCachedMedia;