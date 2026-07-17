// public/sw.js
const CACHE_NAME = 'comed23-pwa-v1';
const ASSETS = [
    'index.html',
    'login.html',
    'student.html',
    'admin.html',
    'inbox.html',
    'recipt.html',
    'css/variables.css',
    'css/dashboard.css',
    'js/config.js',
    'js/auth.js',
    'js/login.js',
    'js/portal.js',
    'js/dashboard.js',
    'logo.png'
];

// Install Event
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// Activate Event
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
});

// Fetch Event
self.addEventListener('fetch', (e) => {
    // Ignore non-GET requests
    if (e.request.method !== 'GET') {
        return;
    }

    const url = new URL(e.request.url);

    // Ignore cross-origin requests
    if (url.origin !== self.location.origin) {
        return;
    }

    // Ignore local API requests
    if (url.pathname.includes('/api/')) {
        return;
    }

    e.respondWith(
        caches.match(e.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Stale-while-revalidate strategy
                fetch(e.request).then((networkResponse) => {
                    if (networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
                    }
                }).catch(() => { /* ignore offline fetch errors */ });
                return cachedResponse;
            }
            return fetch(e.request);
        })
    );
});
