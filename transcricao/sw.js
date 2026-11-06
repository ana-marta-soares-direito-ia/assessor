// Assessor de Transcrição: guarda a aplicação no aparelho para abrir sem rede e activa o isolamento de origem
// (permite usar vários núcleos na transcrição neste computador). Não guarda áudio nem transcrições.
const CACHE = 'assessor-transcricao-v1';
const FICHEIROS = ['./', './index.html', './transcricao.js', './transcricao.css', './codificador.js', './manifest.webmanifest', './lib/lame.min.js',
  '../documental/suporte.js', '../taskpane.css', '../office/office.css', '../office/comum.js', '../nacl-fast.min.js', '../licenca.js',
  '../engine.js', '../docxutil.js', '../assets/icon-64.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHEIROS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x.startsWith('assessor-transcricao') && x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  if (u.pathname.endsWith('revogadas.json')) return;
  e.respondWith((async () => {
    let r;
    try {
      r = await fetch(req);
      if (r.ok && !/\.(wasm)$/.test(u.pathname)) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); }
    } catch (err) { r = await caches.match(req); if (!r) throw err; }
    if (r.status === 0 || r.type === 'opaque') return r;
    const h = new Headers(r.headers);
    h.set('Cross-Origin-Opener-Policy', 'same-origin');
    h.set('Cross-Origin-Embedder-Policy', 'require-corp');
    h.set('Cross-Origin-Resource-Policy', 'same-origin');
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
  })());
});
