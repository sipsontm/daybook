'use strict';

// Change the cache version when publishing a new app shell. A waiting worker
// activates after existing app windows close, so editing is never interrupted.
const VERSION = 'daybook-shell-v3';
const BASE = new URL('./', self.location.href);
const APP_URL = new URL('./', BASE).href;
const INDEX_URL = new URL('index.html', BASE).href;
const STATIC_FILES = [
  ['pwa.js', 'javascript'],
  ['manifest.webmanifest', 'json'],
  ['icons/icon.svg', 'image/svg+xml'],
  ['icons/icon-192.png', 'image/png'],
  ['icons/icon-512.png', 'image/png'],
  ['icons/icon-maskable-512.png', 'image/png'],
  ['icons/apple-touch-icon.png', 'image/png']
];
const STATIC_TYPES = new Map(STATIC_FILES.map(([path, type]) => [new URL(path, BASE).href, type]));
const APP_MARKER = /<meta\s+name=["']application-name["']\s+content=["']Daybook["']\s*\/?\s*>/i;

function validResponse(response, expectedUrl, mime) {
  if (!response.ok || response.redirected || response.type === 'opaque' || response.type === 'opaqueredirect') return false;
  if (new URL(response.url).origin !== BASE.origin) return false;
  if (new URL(response.url).pathname !== new URL(expectedUrl).pathname) return false;
  const type = response.headers.get('content-type') || '';
  return mime === 'json' ? /(?:json|manifest\+json)/i.test(type) : type.toLowerCase().includes(mime);
}

async function isAppShell(response, expectedUrl) {
  if (!validResponse(response, expectedUrl, 'text/html')) return false;
  return APP_MARKER.test(await response.clone().text());
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Redirect rejection and the HTML marker keep sign-in pages out of the cache.
    const shell = await fetch(APP_URL, { credentials: 'same-origin', cache: 'reload', redirect: 'error' });
    if (!(await isAppShell(shell, APP_URL))) throw new Error('The Daybook shell is not available.');
    const assets = await Promise.all(STATIC_FILES.map(async ([path, type]) => {
      const url = new URL(path, BASE).href;
      const response = await fetch(url, { credentials: 'same-origin', cache: 'reload', redirect: 'error' });
      if (!validResponse(response, url, type)) throw new Error('A Daybook file is not available.');
      return [url, response];
    }));
    const cache = await caches.open(VERSION);
    await cache.put(APP_URL, shell);
    await Promise.all(assets.map(([url, response]) => cache.put(url, response)));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('daybook-shell-') && key !== VERSION).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function appNavigation(request) {
  try {
    const response = await fetch(request);
    if (await isAppShell(response, request.url)) {
      const cache = await caches.open(VERSION);
      await cache.put(APP_URL, response.clone());
    }
    // An expired login or access denial is returned as-is, never replaced by
    // an offline copy. Offline fallback is only for a failed network request.
    return response;
  } catch (error) {
    const cached = await caches.match(APP_URL, { cacheName: VERSION });
    if (cached) return cached;
    return new Response('Daybook needs a connection for its first visit.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
}

async function staticFile(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (validResponse(response, request.url, STATIC_TYPES.get(request.url))) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE.origin || url.search) return;
  if (request.mode === 'navigate' && (url.href === APP_URL || url.href === INDEX_URL)) {
    event.respondWith(appNavigation(request));
  } else if (STATIC_TYPES.has(url.href)) {
    event.respondWith(staticFile(request));
  }
  // API responses, uploads, auth, account pages and other URLs bypass the worker.
});
