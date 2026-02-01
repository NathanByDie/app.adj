
import { useState, useEffect } from 'react';
import { getMediaFromCache, saveMediaToCache } from '../services/cache';

const useCachedMedia = (remoteUrl?: string): string | undefined => {
    const [localUrl, setLocalUrl] = useState<string | undefined>();

    useEffect(() => {
        let objectUrl: string | undefined;

        const loadMedia = async () => {
            if (!remoteUrl) {
                setLocalUrl(undefined);
                return;
            }

            try {
                // 1. Check cache first
                const cachedBlob = await getMediaFromCache(remoteUrl);
                if (cachedBlob) {
                    objectUrl = URL.createObjectURL(cachedBlob);
                    setLocalUrl(objectUrl);
                    return;
                }

                // 2. Not in cache, fetch from network
                const response = await fetch(remoteUrl);
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                const newBlob = await response.blob();
                
                // 3. Save to cache and update state
                await saveMediaToCache(remoteUrl, newBlob);
                objectUrl = URL.createObjectURL(newBlob);
                setLocalUrl(objectUrl);

            } catch (error) {
                console.warn(`Failed to cache media from ${remoteUrl}:`, error);
                // Fallback to remote URL on error
                setLocalUrl(remoteUrl);
            }
        };

        loadMedia();

        return () => {
            // Cleanup: Revoke the object URL to prevent memory leaks
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [remoteUrl]);

    return localUrl;
};

export default useCachedMedia;
