import { useState, useEffect } from 'react';
import { getMediaFromCache, saveMediaToCache } from '../services/cache';
import { getFromMemoryCache, setToMemoryCache } from '../services/memoryCache';

const getBaseUrl = (url?: string): string | undefined => {
    return url?.split('?')[0];
};

const useCachedMedia = (remoteUrl?: string): string | undefined => {
    const baseUrl = getBaseUrl(remoteUrl);
    const [resolvedUrl, setResolvedUrl] = useState<string | undefined>();

    useEffect(() => {
        if (!baseUrl || !remoteUrl) {
            setResolvedUrl(undefined);
            return;
        }

        // 1. Check synchronous memory cache first.
        const memUrl = getFromMemoryCache(baseUrl);
        if (memUrl) {
            setResolvedUrl(memUrl);
            return;
        }

        // 2. Not in memory, show placeholder and start async loading.
        setResolvedUrl(undefined);

        let isMounted = true;
        const loadMediaAsync = async () => {
            try {
                // 2a. Check persistent cache (IndexedDB).
                const cachedBlob = await getMediaFromCache(baseUrl);
                if (cachedBlob) {
                    const objectUrl = URL.createObjectURL(cachedBlob);
                    if (isMounted) {
                        setToMemoryCache(baseUrl, objectUrl);
                        setResolvedUrl(objectUrl);
                    }
                    return;
                }

                // 2b. Fetch from network.
                const response = await fetch(remoteUrl);
                if (!response.ok) throw new Error('Network response was not ok');
                const blob = await response.blob();
                
                await saveMediaToCache(baseUrl, blob);
                const objectUrl = URL.createObjectURL(blob);
                if (isMounted) {
                    setToMemoryCache(baseUrl, objectUrl);
                    setResolvedUrl(objectUrl);
                }
            } catch (error) {
                console.warn(`Failed to load and cache media from ${remoteUrl}:`, error);
                if (isMounted) {
                    setResolvedUrl(remoteUrl); // Fallback to remote url on error.
                }
            }
        };

        loadMediaAsync();

        return () => {
            isMounted = false;
        };
    }, [baseUrl, remoteUrl]);

    return resolvedUrl;
};

export default useCachedMedia;
