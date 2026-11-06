// Assessor de Transcrição: codificação MP3 (mono, 16 kHz, 32 kbit/s) das partes gravadas, fora da linha principal.
// Ana Marta Soares, Especialista em IA aplicada ao Direito.
importScripts('lib/lame.min.js');
self.onmessage = function (e) {
  var pcm = e.data.pcm, n = pcm.length, i16 = new Int16Array(n);
  for (var i = 0; i < n; i++) { var v = pcm[i]; v = v < -1 ? -1 : v > 1 ? 1 : v; i16[i] = v < 0 ? v * 32768 : v * 32767; }
  var enc = new lamejs.Mp3Encoder(1, 16000, 32), partes = [], total = 0;
  for (var j = 0; j < n; j += 1152) { var b = enc.encodeBuffer(i16.subarray(j, j + 1152)); if (b.length) { partes.push(b); total += b.length; } }
  var f = enc.flush(); if (f.length) { partes.push(f); total += f.length; }
  var out = new Uint8Array(total), p = 0;
  partes.forEach(function (x) { out.set(x, p); p += x.length; });
  self.postMessage({ id: e.data.id, buf: out.buffer }, [out.buffer]);
};
