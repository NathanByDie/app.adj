
import { NOTES_SHARP, NOTES_FLAT, NOTES_ES_SHARP, NOTES_ES_FLAT } from '../constants';

// Regex para encontrar posibles acordes.
// Grupos: 1=Raíz, 2=Sufijo, 3=Bajo(opcional)
const CHORD_REGEX = /\b((?:Do|Re|Mi|Fa|Sol|La|Si|[A-G])(?:##|bb|#|b)?)([^\/\s\n]*)(?:\/((?:Do|Re|Mi|Fa|Sol|La|Si|[A-G])(?:##|bb|#|b)?))?/gi;

// Palabras que NUNCA deben ser tratadas como acordes aunque coincidan con la estructura básica
const LYRIC_BLACK_LIST = [
  'GLORIA', 'PAZ', 'DIOS', 'CIELO', 'REY', 'POR', 'CON', 'SIN', 'QUE', 'LOS', 'LAS', 'DEL', 'COMO',
  'PARA', 'ESTA', 'ESTE', 'ESE', 'ESA', 'MIRA', 'DIME', 'DALE', 'VIVE', 'VIVO', 'VIVA', 'TUYA', 
  'TUYO', 'MIO', 'MIA', 'TODO', 'TODA', 'ALMA', 'VIDA', 'SOLO', 'SOLA', 'ERES', 'CADA', 'HAY',
  'SANTO', 'ALELUYA', 'AMEN', 'VEN', 'VER', 'HOY', 'LUZ', 'SAL', 'DAR', 'PAN', 'SER', 'FUE', 'HAS',
  'SOY', 'DOY', 'VOY', 'SINO', 'DONDE', 'DAMA', 'CIMA', 'CUNA', 'MINA', 'TEMA', 'CAMA', 'SANA'
];

// Caracteres que son extremadamente improbables en un sufijo de acorde válido.
// Los sufijos válidos suelen tener: m, i, n, a, j, d, u, g, s, b, #, 0-9, +, -, (, ), /, °, dim, aug, sus, add
// Si contiene e, f, h, k, l, o, p, q, r, t, v, w, x, y, z, ñ -> Probablemente es texto (ej: "Sola" -> Sufijo 'a' ok, pero "Solamente" -> 'mente' tiene e, n, t)
const INVALID_SUFFIX_CHARS = /[cefhklopqrtvwxyzñ]/i;

const PITCH_MAP: { [key: string]: number } = {
  'C': 0, 'C#': 1, 'C##': 2, 'DB': 1, 'DBB': 0,
  'D': 2, 'D#': 3, 'D##': 4, 'EB': 3, 'EBB': 2,
  'E': 4, 'E#': 5, 'FB': 4, 'FBB': 3,
  'F': 5, 'F#': 6, 'F##': 7, 'GB': 6, 'GBB': 5,
  'G': 7, 'G#': 8, 'G##': 9, 'AB': 8, 'ABB': 7,
  'A': 9, 'A#': 10, 'A##': 11, 'BB': 10, 'BBB': 9,
  'B': 11, 'B#': 0, 'CB': 11, 'CBB': 10,
  'DO': 0, 'DO#': 1, 'DO##': 2, 'REB': 1, 'REBB': 0,
  'RE': 2, 'RE#': 3, 'RE##': 4, 'MIB': 3, 'MIBB': 2,
  'MI': 4, 'MI#': 5, 'FAB': 4, 'FABB': 3,
  'FA': 5, 'FA#': 6, 'FA##': 7, 'SOLB': 6, 'SOLBB': 5,
  'SOL': 7, 'SOL#': 8, 'SOL##': 9, 'LAB': 8, 'LABB': 7,
  'LA': 9, 'LA#': 10, 'LA##': 11, 'SIB': 10, 'SIBB': 9,
  'SI': 11, 'SI#': 0, 'DOB': 11, 'DOBB': 10
};

// Validador estricto para una sola palabra
const isValidChordWord = (word: string): boolean => {
  const cleanWord = word.replace(/[().,;:¡!¿?]/g, ''); 
  if (!cleanWord) return false;
  
  // 1. Chequeo de lista negra directa
  if (LYRIC_BLACK_LIST.includes(cleanWord.toUpperCase())) return false;

  // 2. Ejecutar Regex manualmente para inspeccionar partes
  CHORD_REGEX.lastIndex = 0;
  const match = CHORD_REGEX.exec(cleanWord);
  
  // Debe coincidir y la coincidencia debe empezar al principio de la palabra
  if (!match || match.index !== 0) return false;

  const root = match[1];
  const suffix = match[2];
  
  // 3. Validación de Sufijos
  // Si el sufijo contiene caracteres inválidos para notación musical, es texto.
  if (INVALID_SUFFIX_CHARS.test(suffix)) return false;

  // 4. Heurística de longitud
  // Acordes simples no son super largos a menos que tengan barras
  if (cleanWord.length > 6 && !cleanWord.includes('/')) return false;

  // 5. Casos especiales cortos que son palabras comunes
  if (cleanWord.length === 1) {
    const up = cleanWord.toUpperCase();
    if (up === 'Y') return false;
    // Nueva regla: 'a' y 'e' minúsculas son preposiciones/conjunciones en español, no acordes.
    // Solo aceptamos A y E mayúsculas como acordes (notación inglesa).
    if (cleanWord === 'a' || cleanWord === 'e') return false;
  }

  return true;
};

/**
 * Determina si una línea es de acordes analizando su contenido y su entorno.
 */
export const isChordLine = (line: string, nextLine?: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 1) return false;

  // 1. Señales inmediatas de que es letra
  if (/[¿?!¡]/.test(trimmed)) return false; // Exclamaciones/Interrogaciones
  if (trimmed.endsWith('.') || trimmed.endsWith(',')) return false; // Frases terminan en puntuación

  const words = trimmed.split(/\s+/);
  
  // 2. Si hay palabras muy largas que no son acordes con bajo (/), es letra
  if (words.some(w => w.length > 8 && !w.includes('/'))) return false;

  let chordCount = 0;
  let invalidWordCount = 0;

  words.forEach(word => {
    if (isValidChordWord(word)) {
      chordCount++;
    } else {
      if (word.length > 0) invalidWordCount++;
    }
  });

  // Si no se detectó ningún acorde válido, no es línea de acordes
  if (chordCount === 0) return false;

  const total = chordCount + invalidWordCount;
  const ratio = chordCount / (total || 1);

  // 3. Umbrales de decisión
  
  // Confianza alta: La gran mayoría son acordes
  if (ratio > 0.75) return true;

  // Confianza media: Verificar espaciado
  // Se requiere que MÁS de la mitad sean acordes (ratio > 0.5) para evitar falsos positivos
  // en frases de 2 palabras como "La casa" (1 acorde / 2 palabras = 0.5)
  if (ratio > 0.5) {
     const rawLength = line.length;
     const contentLength = trimmed.replace(/\s/g, '').length;
     const spaceRatio = (rawLength - contentLength) / rawLength;
     
     // Si hay mucho espacio (> 20%) o son pocas palabras (<= 4), aceptamos
     // Pero gracias al ratio > 0.5, evitamos frases cortas de texto.
     return spaceRatio > 0.2 || words.length <= 4;
  }

  return false;
};

const transposeRoot = (root: string, semiTones: number): string => {
  const isSpanish = /^(Do|Re|Mi|Fa|Sol|La|Si)/i.test(root);
  const lookup = root.toUpperCase();
  const currentPitch = PITCH_MAP[lookup];

  if (currentPitch === undefined) return root;

  let newPitch = (currentPitch + semiTones) % 12;
  if (newPitch < 0) newPitch += 12;

  const targetList = semiTones >= 0
    ? (isSpanish ? NOTES_ES_SHARP : NOTES_SHARP)
    : (isSpanish ? NOTES_ES_FLAT : NOTES_FLAT);

  return targetList[newPitch];
};

export const transposeChord = (fullMatch: string, semiTones: number): string => {
  if (semiTones === 0) return fullMatch;

  // Doble verificación: no transponer si parece una palabra falso positivo
  if (!isValidChordWord(fullMatch)) return fullMatch;

  CHORD_REGEX.lastIndex = 0;
  const match = CHORD_REGEX.exec(fullMatch);
  if (!match) return fullMatch;

  const root = match[1];
  const suffix = match[2];
  const bass = match[3];

  const newRoot = transposeRoot(root, semiTones);
  const newBass = bass ? `/${transposeRoot(bass, semiTones)}` : '';

  return newRoot + suffix + newBass;
};

export const transposeSong = (content: string, semiTones: number): string => {
  if (semiTones === 0) return content;
  const lines = content.split('\n');
  return lines.map((line, index) => {
    const nextLine = lines[index + 1];
    if (isChordLine(line, nextLine)) {
      return line.replace(CHORD_REGEX, (match) => transposeChord(match, semiTones));
    }
    return line;
  }).join('\n');
};
