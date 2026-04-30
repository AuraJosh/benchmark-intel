import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Hook to restore scroll position of a specific container.
 * @param {string} key Unique key for this scrollable container (e.g., 'projects-list')
 * @param {Array} deps Dependencies that trigger restoration (e.g., [loading])
 */
export const useScrollRestoration = (key, deps = []) => {
    const location = useLocation();
    const scrollContainerRef = useRef(null);
    const storageKey = `scroll-pos-${key}-${location.pathname}`;

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        // Restore scroll position
        const savedPos = sessionStorage.getItem(storageKey);
        if (savedPos && !deps.some(d => d === true)) {
            // Wait for next tick to ensure DOM is updated after deps change
            const timeoutId = setTimeout(() => {
                container.scrollTop = parseInt(savedPos, 10);
            }, 100);
            return () => clearTimeout(timeoutId);
        }
    }, [storageKey, ...deps]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const handleScroll = () => {
            if (container.scrollTop > 0 || sessionStorage.getItem(storageKey)) {
                sessionStorage.setItem(storageKey, container.scrollTop);
            }
        };

        container.addEventListener('scroll', handleScroll);
        return () => {
            container.removeEventListener('scroll', handleScroll);
        };
    }, [storageKey]);

    return scrollContainerRef;
};
