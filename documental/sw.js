// Assessor Documental: guarda a aplicação no aparelho para abrir sem rede (a IA continua a precisar de internet).
const CACHE = 'assessor-documental-v3';
const FICHEIROS = ['./', './index.html', './documental.js', './documental.css', './suporte.js', './manifest.webmanifest',
  '../taskpane.css', '../office/office.css', '../office/comum.js', '../office/anexos.js', '../nacl-fast.min.js', '../licenca.js',
  '../engine.js', '../docxutil.js', '../pdf/lib/pdf.min.mjs', '../pdf/lib/pdf.worker.min.mjs', '../assets/icon-64.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHEIROS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // rede primeiro (versão mais recente), cópia local quando não houver rede
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
