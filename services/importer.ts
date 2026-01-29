export interface ImportedSongData {
  title: string;
  author: string;
  key: string;
  content: string;
}

// Lista de proxies para intentar en orden. Si uno falla, se prueba el siguiente.
const PROXIES = [
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
];

/**
 * Fetches and parses a song from a lacuerda.net URL.
 * @param url The full URL of the song on lacuerda.net
 * @returns A promise that resolves with the parsed song data.
 */
export const importFromLaCuerda = async (url: string): Promise<ImportedSongData> => {
  if (!url.includes('lacuerda.net')) {
    throw new Error('URL inválida. Debe ser un enlace de lacuerda.net');
  }

  let htmlContent: string | null = null;
  let lastError: Error | null = null;

  // Intentar con cada proxy en la lista hasta que uno funcione
  for (const buildProxyUrl of PROXIES) {
    try {
        const proxyUrl = buildProxyUrl(url);
        const response = await fetch(proxyUrl);
        
        if (response.ok) {
            const text = await response.text();
            // Validación básica para asegurar que recibimos HTML y no un error del proxy
            if (text && (text.includes('<html') || text.includes('<!DOCTYPE') || text.includes('lacuerda.net'))) {
                htmlContent = text;
                break; // ¡Éxito! Salimos del bucle
            }
        }
    } catch (e: any) {
        console.warn('Fallo al intentar con un proxy, probando el siguiente...', e);
        lastError = e;
    }
  }

  if (!htmlContent) {
    throw new Error('Error de conexión: No se pudo acceder a LaCuerda.net a través de los servidores disponibles. Por favor, verifica tu internet e intenta de nuevo.');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  const titleEl = doc.querySelector('#TITULO h1');
  const authorEl = doc.querySelector('#AUTOR a');
  const keyEl = doc.querySelector('#TONO a'); // Este elemento puede ser nulo
  const contentEl = doc.querySelector('#TEXTO');

  // El tono es opcional, pero título y contenido son obligatorios
  if (!titleEl || !authorEl || !contentEl) {
    throw new Error('No se pudo analizar la página. El formato puede no ser compatible o la página no cargó correctamente.');
  }

  const title = titleEl.textContent?.trim() || '';
  const author = authorEl.textContent?.trim() || 'Desconocido';
  let key = 'DO'; // Tono por defecto

  // Si existe el elemento de tono, lo analizamos
  if (keyEl) {
    const keyText = keyEl.textContent?.trim() || '';
    const keyMatch = keyText.match(/(?:Tono|Tone):\s*([A-G](?:#|b)?m?)/i);
    let parsedKey = keyMatch ? keyMatch[1].toUpperCase() : 'DO';

    // Convertir notación inglesa a latina
    const keyMap: { [key: string]: string } = {
      'C': 'DO', 'C#': 'DO#', 'DB': 'REb', 'D': 'RE', 'D#': 'RE#', 'EB': 'MIb',
      'E': 'MI', 'F': 'FA', 'F#': 'FA#', 'GB': 'SOLb', 'G': 'SOL', 'G#': 'SOL#',
      'AB': 'LAb', 'A': 'LA', 'A#': 'LA#', 'BB': 'SIb', 'B': 'SI'
    };
    
    // Manejar acordes menores (ej: Am)
    const isMinor = parsedKey.endsWith('M');
    if (isMinor) {
        const root = parsedKey.slice(0, -1);
        parsedKey = (keyMap[root] || root) + 'm';
    } else {
        parsedKey = keyMap[parsedKey] || parsedKey;
    }

    key = parsedKey;
  }

  const content = (contentEl as HTMLElement).innerText || '';

  if (!title || !content) {
    throw new Error('Faltan datos esenciales (título o contenido) en la página.');
  }

  return { title, author, key, content };
};
