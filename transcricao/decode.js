/*
 * Assessor de Transcrição: leitura de ficheiros de áudio e de vídeo, por partes,
 * convertidas para 16 kHz mono. Usa o ffmpeg compilado para o browser.
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 */
import { FFmpeg } from '../../cofre-anonimizacao-word/audio/lib/ffmpeg/index.js';

let ff = null, mounted = null, logBuf = [];

export async function initDecoder() {
  if (ff) return ff;
  ff = new FFmpeg();
  ff.on('log', ({ message }) => { logBuf.push(message); if (logBuf.length > 400) logBuf.shift(); });
  await ff.load({
    coreURL: new URL('../../cofre-anonimizacao-word/audio/lib/ffmpeg/ffmpeg-core.js', import.meta.url).href,
    wasmURL: new URL('../../cofre-anonimizacao-word/audio/lib/ffmpeg/ffmpeg-core.wasm', import.meta.url).href,
    classWorkerURL: new URL('../../cofre-anonimizacao-word/audio/lib/ffmpeg/worker.js', import.meta.url).href
  });
  return ff;
}

function safeName(name) { return 'f' + Date.now() + (name.match(/\.[A-Za-z0-9]{1,5}$/) || ['.bin'])[0]; }

/** Prepara um ficheiro e devolve {path, duration}. */
export async function openMedia(file) {
  await initDecoder();
  if (mounted) { try { await ff.unmount('/in'); } catch (e) {} }
  try { await ff.createDir('/in'); } catch (e) {}
  // o ficheiro é lido por partes, sem ser copiado para a memória
  const f = new File([file], safeName(file.name), { type: file.type });
  await ff.mount('WORKERFS', { files: [f] }, '/in');
  mounted = '/in/' + f.name;
  let duration = await durationFromElement(file);
  if (!duration) {
    logBuf = [];
    try { await ff.exec(['-hide_banner', '-i', mounted]); } catch (e) {}
    const m = logBuf.join('\n').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (m) duration = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
  }
  if (!duration) throw new Error('Não foi possível ler a duração do ficheiro. Verifique se é um ficheiro de áudio ou de vídeo.');
  return { path: mounted, duration };
}

function durationFromElement(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('audio');
    let done = false;
    const end = (v) => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(v); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => end(isFinite(a.duration) && a.duration > 0 ? a.duration : 0);
    a.onerror = () => end(0);
    setTimeout(() => end(0), 8000);
    a.src = url;
  });
}

/** Extrai [start, start+len] segundos como Float32Array a 16 kHz mono. */
export async function readSegment(path, start, len) {
  const out = '/seg.raw';
  await ff.exec(['-hide_banner', '-loglevel', 'error', '-ss', String(start), '-t', String(len), '-i', path,
    '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-y', out]);
  const data = await ff.readFile(out);
  try { await ff.deleteFile(out); } catch (e) {}
  const copy = new Uint8Array(data.byteLength); copy.set(data);
  return new Float32Array(copy.buffer);
}

/** Converte [start, start+len] segundos para MP3 mono a 16 kHz e 32 kbit/s (Uint8Array). */
export async function convertPiece(path, start, len) {
  const out = '/peca.mp3';
  await ff.exec(['-hide_banner', '-loglevel', 'error', '-ss', String(start), '-t', String(len), '-i', path,
    '-vn', '-map_metadata', '-1', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '32k', '-write_xing', '0', '-f', 'mp3', '-y', out]);
  const data = await ff.readFile(out);
  try { await ff.deleteFile(out); } catch (e) {}
  const copy = new Uint8Array(data.byteLength); copy.set(data);
  return copy;
}
