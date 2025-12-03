/**
 * Service Worker for Sanctions Check PWA
 * Implements Network First strategy for API calls and Cache First for static assets
 * 
 * Environment-specific configuration is injected during build
 */

const CACHE_VERSION = 'sanctions-check-v1.0.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Environment-specific configuration (injected during build)
// These placeholders will be replaced by actual values from environment variables
const ALLOWED_ORIGINS = [
  'http://localhost:3000',  // Dev server (always included for local development)
  '__REACT_APP_API_URL__'   // API URL from environment (injected during build)
].filter(url => url && !url.startsWith('__')); // Filter out uninjected placeholders

// Static assets to cache (core assets that must be available)
const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/offline.html'  // Offline fallback page
];

// Optional assets (nice to have cached, but not critical)
const OPTIONAL_ASSETS = [
  '/icon.png',
  '/Panama.avif'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching critical assets');
        // Cache critical assets first (must succeed)
        return cache.addAll(CRITICAL_ASSETS)
          .then(() => {
            // Cache optional assets (can fail)
            console.log('[SW] Caching optional assets');
            return Promise.allSettled(
              OPTIONAL_ASSETS.map(url => cache.add(url).catch(err => {
                console.warn('[SW] Failed to cache optional asset:', url, err);
              }))
            );
          });
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('sanctions-check-') && name !== STATIC_CACHE && name !== API_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - Network First for API, Cache First for static
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Network First strategy for API calls
  if (url.pathname.startsWith('/api/') || url.origin !== location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache successful responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(API_CACHE).then((cache) => {
              cache.put(request, responseClone);
              
              // Update last sync timestamp
              localStorage.setItem('lastSync', Date.now().toString());
              
              // Expire API cache after 5 minutes
              setTimeout(() => {
                cache.delete(request).then(() => {
                  console.log('[SW] Expired API cache:', request.url);
                });
              }, 5 * 60 * 1000);
            });
          }
          return response;
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(request).then((cached) => {
            if (cached) {
              console.log('[SW] Serving from cache (offline):', request.url);
              return cached;
            }
            // No cache available, return offline response
            return new Response(
              JSON.stringify({
                error: 'No internet connection',
                message: 'Please check your connection and try again'
              }),
              {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'application/json' }
              }
            );
          });
        })
    );
    return;
  }

  // Cache First strategy for static assets
  event.respondWith(
    caches.match(request)
      .then((cached) => {
        if (cached) {
          // Return cached and update in background
          fetch(request).then((response) => {
            if (response.ok) {
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(request, response);
              });
            }
          }).catch(() => {
            // Network failed, but we have cache - no action needed
          });
          return cached;
        }

        // Not in cache, fetch from network
        return fetch(request)
          .then((response) => {
            // Cache successful responses
            if (response.ok) {
              const responseClone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return response;
          })
          .catch((err) => {
            console.error('[SW] Fetch failed:', err);
            
            // If it's a navigation request and we're offline, show offline page
            if (request.mode === 'navigate') {
              return caches.match('/offline.html').then((offlinePage) => {
                if (offlinePage) {
                  return offlinePage;
                }
                // Fallback if offline page isn't cached
                return new Response(
                  '<h1>Offline</h1><p>Please check your internet connection.</p>',
                  {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 'Content-Type': 'text/html' }
                  }
                );
              });
            }
            
            throw err;
          });
      })
  );
});

// Message event - handle messages from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
