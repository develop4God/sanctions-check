/**
 * Platform detection utilities for Sanctions Check
 * Detects whether app is running as Electron desktop, PWA, or web
 */

/**
 * Check if running in Electron
 * @returns {boolean} True if running in Electron
 */
export const isElectron = () => {
  return !!window.electron;
};

/**
 * Check if running as PWA (installed web app)
 * @returns {boolean} True if running in standalone mode (PWA)
 */
export const isPWA = () => {
  return window.matchMedia('(display-mode: standalone)').matches;
};

/**
 * Get current platform
 * @returns {'DESKTOP' | 'PWA' | 'WEB'} Platform identifier
 */
export const getPlatform = () => {
  if (isElectron()) return 'DESKTOP';
  if (isPWA()) return 'PWA';
  return 'WEB';
};

/**
 * Get app version from environment
 * @returns {string} Version string
 */
export const getVersion = () => {
  return process.env.REACT_APP_VERSION || '1.0.0';
};

/**
 * Get platform display name
 * @returns {string} Human-readable platform name
 */
export const getPlatformName = () => {
  const platform = getPlatform();
  const names = {
    DESKTOP: 'Desktop',
    PWA: 'Progressive Web App',
    WEB: 'Web'
  };
  return names[platform] || 'Unknown';
};
