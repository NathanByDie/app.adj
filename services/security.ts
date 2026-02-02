
/**
 * ADJStudios Secure Mobile Protocol (ASMP)
 * Implementación de cifrado AES-GCM para mensajería segura sobre Firestore.
 */

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // Bytes

// Utilidad para convertir string a buffer
const str2ab = (str: string): ArrayBuffer => {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
};

// Utilidad para convertir buffer a base64
const ab2base64 = (buf: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

// Utilidad para convertir base64 a buffer
const base642ab = (base64: string): ArrayBuffer => {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
};

/**
 * Deriva una clave criptográfica única basada en el ID del chat.
 * En un sistema E2EE puro usaríamos Diffie-Hellman, pero para compatibilidad
 * con la arquitectura actual sin servidor de llaves, usamos una derivación determinista
 * robusta basada en los participantes.
 */
const deriveKey = async (chatId: string): Promise<CryptoKey> => {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(chatId + "_ADJ_SECURE_SALT_v1"), // Salt estática para consistencia
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("adj-mobile-protocol"),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: ALGORITHM, length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

export const SecureMessenger = {
  /**
   * Cifra un mensaje de texto.
   * Retorna una cadena en formato: "IV_EN_BASE64:CONTENIDO_EN_BASE64"
   */
  encrypt: async (text: string, chatId: string): Promise<string> => {
    try {
        if (!text) return "";
        const key = await deriveKey(chatId);
        const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
        const encoder = new TextEncoder();
        
        const encrypted = await window.crypto.subtle.encrypt(
            { name: ALGORITHM, iv },
            key,
            encoder.encode(text)
        );

        const ivStr = ab2base64(iv.buffer);
        const dataStr = ab2base64(encrypted);
        
        return `${ivStr}:${dataStr}`;
    } catch (e) {
        console.error("Encryption failed:", e);
        return text; // Fallback a texto plano si falla (no debería ocurrir)
    }
  },

  /**
   * Descifra un mensaje. Si el mensaje no tiene formato de cifrado o falla,
   * retorna el texto original (retrocompatibilidad).
   */
  decrypt: async (cipherText: string, chatId: string): Promise<string> => {
    try {
        if (!cipherText || !cipherText.includes(':')) return cipherText;
        
        const parts = cipherText.split(':');
        if (parts.length !== 2) return cipherText;

        const iv = base642ab(parts[0]);
        const data = base642ab(parts[1]);
        const key = await deriveKey(chatId);

        const decrypted = await window.crypto.subtle.decrypt(
            { name: ALGORITHM, iv: new Uint8Array(iv) },
            key,
            data
        );

        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    } catch (e) {
        // Si falla el desencriptado (ej. es texto plano antiguo con un ':' por casualidad), devolvemos original
        return cipherText;
    }
  }
};
