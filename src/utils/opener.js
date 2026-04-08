/**
 * Smart Utility to open external links.
 * Works seamlessly in both the Web App and the Desktop (Tauri) App.
 */

export const openExternalLink = async (url) => {
    if (!url) return;

    try {
        // 1. Detect if we are running in Tauri
        const isTauri = window.__TAURI_INTERNALS__ !== undefined;

        if (isTauri) {
            // Use the Tauri Shell plugin to open in the system browser
            const { open } = await import('@tauri-apps/plugin-shell');
            await open(url);
        } else {
            // Fallback for standard web browser
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    } catch (error) {
        console.error('Failed to open external link:', error);
        // Fallback fallback
        window.open(url, '_blank', 'noopener,noreferrer');
    }
};
