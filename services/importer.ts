
export interface ImportedSongData {
  title: string;
  author: string;
  key: string;
  content: string;
}

// Lista de proxies para intentar en orden. Si uno falla, se prueba el siguiente.
export const PROXIES = [
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
];

/**
 * Fetches and parses a song from a web URL.
 * It has specific logic for lacuerda.net and a generic fallback for other sites.
 * @param url The full URL of the song.
 * @returns A promise that resolves with the parsed song data.
 */
export const importFromLaCuerda = async (url: string): Promise<ImportedSongData> => {
  let htmlContent: string | null = null;
  let lastError: Error | null = null;

  for (const buildProxyUrl of PROXIES) {
    try {
        const proxyUrl = buildProxyUrl(url);
        const response = await fetch(proxyUrl);
        
        if (response.ok) {
            const text = await response.text();
            if (text) {
                htmlContent = text;
                break;
            }
        }
    } catch (e: any) {
        console.warn('Proxy fetch failed, trying next...', e);
        lastError = e;
    }
  }

  if (!htmlContent) {
    throw new Error('Error de conexión: No se pudo acceder a la URL a través de los servidores disponibles.');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  // --- ESTRATEGIA ESPECÍFICA PARA LACUERDA.NET ---
  if (url.includes('lacuerda.net')) {
      let title = doc.querySelector('#tH1 h1')?.textContent || doc.querySelector('#TITULO h1')?.textContent || '';
      let author = doc.querySelector('#tH1 h2')?.textContent || doc.querySelector('#AUTOR a')?.textContent || 'Desconocido';
      let key = 'DO';
      const keyEl = doc.querySelector('#TONO a');
      if (keyEl) {
        const keyText = keyEl.textContent?.trim() || '';
        const keyMatch = keyText.match(/(?:Tono|Tone):\s*([A-G](?:#|b)?m?)/i);
        let parsedKey = keyMatch ? keyMatch[1].toUpperCase() : 'DO';
        key = normalizeKey(parsedKey);
      }
      
      let contentEl = doc.querySelector('#t_body pre') || doc.querySelector('#TEXTO');
      if (!title || !contentEl) {
        throw new Error('No se pudo analizar la página de LaCuerda. El formato puede no ser compatible.');
      }
      const rawContent = (contentEl as HTMLElement).innerText || contentEl.textContent || '';
      const content = rawContent.replace(/^(\s*\n)+/, '').replace(/(\s*\n)+$/, '');
      return { title: title.trim(), author: author.trim(), key, content };
  } 
  // --- ESTRATEGIA GENÉRICA PARA OTRAS WEBS ---
  else {
      const title = doc.title || 'Título Desconocido';
      // Intenta extraer el contenido principal de la página, quitando scripts y estilos.
      doc.querySelectorAll('script, style').forEach(el => el.remove());
      const bodyText = doc.body.innerText || doc.body.textContent || '';
      
      // Limpieza básica
      const content = bodyText.replace(/\s{2,}/g, '\n').trim();

      if (!content) {
          throw new Error('No se pudo extraer contenido legible de esta página.');
      }

      return {
          title,
          author: 'Desconocido (importado de web)',
          key: 'N/A',
          content: content // Se envía el texto crudo para que la IA lo interprete
      };
  }
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