// Service Worker مجید تل: فایل‌های ثابت کش می‌شوند تا سایت سریع باز شود.
// داده‌ها (موجودی، سفارش) همیشه زنده از سرور خوانده می‌شوند و کش نمی‌شوند.
const VERSION = 'mt-__BUILD__';
const SHELL = ['./', 'index.html', 'config.js', 'assets/app.css', 'assets/icons.css', 'assets/app.js',
  'assets/fonts/Vazirmatn-wght.woff2', 'assets/fonts/Phosphor.woff2', 'assets/fonts/Phosphor-Bold.woff2',
  'assets/fonts/Phosphor-Fill.woff2', 'assets/fonts/Phosphor-Duotone.woff2', 'icons/icon-192.png', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('.apk')) return;
  // HTML/JS/config: اول شبکه (برای دریافت نسخه جدید)، در صورت قطعی از کش
  if (/\.(html|js|webmanifest)$|\/$/.test(url.pathname)) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  // فونت/تصویر/CSS: اول کش
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); return res; })));
});
