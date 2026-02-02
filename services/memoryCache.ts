/**
 * A simple in-memory cache for blob URLs to avoid async lookups for already loaded media
 * during the current app session. This provides instant access to images that have been
 * displayed at least once.
 */
const memoryCache = new Map<string, string>();

export const getFromMemoryCache = (key: string): string | undefined => {
    return memoryCache.get(key);
};

export const setToMemoryCache = (key: string, value: string) => {
    // Before setting a new URL, check if there's an old one for the same key and revoke it to prevent memory leaks.
    const oldUrl = memoryCache.get(key);
    if (oldUrl && oldUrl.startsWith('blob:')) {
        // Only revoke if it's a different URL.
        if (oldUrl !== value) {
            URL.revokeObjectURL(oldUrl);
        }
    }
    memoryCache.set(key, value);
};
