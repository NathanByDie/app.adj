
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

  // --- ESTRATEGIA DE TÍTULO ---
  // Nuevo: <div id=tH1><h1>...</h1></div>
  // Antiguo: <div id=TITULO><h1>...</h1></div>
  let title = doc.querySelector('#tH1 h1')?.textContent;
  if (!title) title = doc.querySelector('#TITULO h1')?.textContent;
  title = title?.trim() || '';

  // --- ESTRATEGIA DE AUTOR ---
  // Nuevo: <div id=tH1>...<h2>...</h2></div>
  // Antiguo: <div id=AUTOR><a>...</a></div>
  let author = doc.querySelector('#tH1 h2')?.textContent;
  if (!author) author = doc.querySelector('#AUTOR a')?.textContent;
  author = author?.trim() || 'Desconocido';

  // --- ESTRATEGIA DE TONO ---
  // El tono es opcional o a veces no está explícito en el nuevo diseño fuera de scripts.
  // Intentamos buscarlo, si no, inferimos DO por defecto.
  let key = 'DO'; 
  const keyEl = doc.querySelector('#TONO a'); // Formato antiguo o explícito
  
  if (keyEl) {
    const keyText = keyEl.textContent?.trim() || '';
    const keyMatch = keyText.match(/(?:Tono|Tone):\s*([A-G](?:#|b)?m?)/i);
    let parsedKey = keyMatch ? keyMatch[1].toUpperCase() : 'DO';
    key = normalizeKey(parsedKey);
  } else {
      // Intento de inferencia simple: Buscar si hay un script con metadatos (común en diseño nuevo)
      // o simplemente dejar DO. En el diseño nuevo (tHead), el tono a veces no es visible como texto simple.
      // Podríamos intentar parsear el primer acorde del contenido, pero por seguridad dejamos el default o lo que encuentre.
  }

  // --- ESTRATEGIA DE CONTENIDO ---
  // Nuevo: <div id=t_body><PRE>...</PRE></div>
  // Antiguo: <div id=TEXTO>...</div>
  let contentEl = doc.querySelector('#t_body pre');
  if (!contentEl) contentEl = doc.querySelector('#TEXTO');

  if (!title || !contentEl) {
    throw new Error('No se pudo analizar la página. El formato puede no ser compatible o la página no cargó correctamente.');
  }

  // Limpieza del contenido
  // En el nuevo formato, los acordes están dentro de <a> tags.
  // innerText suele preservar mejor el formato visual (saltos de línea) de un <pre>
  const rawContent = (contentEl as HTMLElement).innerText || contentEl.textContent || '';
  
  // Limpieza adicional: Eliminar líneas vacías excesivas al inicio o final
  const content = rawContent.replace(/^(\s*\n)+/, '').replace(/(\s*\n)+$/, '');

  return { title, author, key, content };
};

// Helper para normalizar tonos de inglés a latino
function normalizeKey(englishKey: string): string {
    const keyMap: { [key: string]: string } = {
      'C': 'DO', 'C#': 'DO#', 'DB': 'REb', 'D': 'RE', 'D#': 'RE#', 'EB': 'MIb',
      'E': 'MI', 'F': 'FA', 'F#': 'FA#', 'GB': 'SOLb', 'G': 'SOL', 'G#': 'SOL#',
      'AB': 'LAb', 'A': 'LA', 'A#': 'LA#', 'BB': 'SIb', 'B': 'SI'
    };
    
    let normalized = englishKey.toUpperCase();
    const isMinor = normalized.endsWith('M');
    
    let root = isMinor ? normalized.slice(0, -1) : normalized;
    
    // Mapeo directo si existe
    if (keyMap[root]) {
        root = keyMap[root];
    }

    return root + (isMinor ? 'm' : '');
}
