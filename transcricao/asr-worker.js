/*
 * Assessor de Transcrição: transcrição neste aparelho (modo sem envio).
 * Corre num Web Worker, no computador do utilizador. O áudio não é enviado.
 * Os modelos (Whisper e WeSpeaker) são descarregados uma vez e guardados no browser.
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 */
import { pipeline, env, AutoModel, AutoProcessor } from '../../cofre-anonimizacao-word/audio/lib/transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL('../../cofre-anonimizacao-word/audio/lib/', import.meta.url).href;
if (self.crossOriginIsolated) env.backends.onnx.wasm.numThreads = Math.min(8, navigator.hardwareConcurrency || 4);

let asr = null, spkModel = null, spkProc = null, cfg = null;
let speakers = [];          // centróides normalizados
const SPK_THRESHOLD = 0.42; // semelhança mínima para considerar o mesmo orador

function post(type, data) { self.postMessage(Object.assign({ type }, data || {})); }

function progressCb(label) {
  const files = {};
  return (p) => {
    if (p.status === 'progress' && p.file) {
      files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
      let l = 0, t = 0;
      for (const k in files) { l += files[k].loaded; t += files[k].total; }
      post('load-progress', { label, loaded: l, total: t });
    }
  };
}

async function load(c) {
  cfg = c;
  const device = c.device;
  const dtype = c.dtype;
  asr = await pipeline('automatic-speech-recognition', c.model, { device, dtype, progress_callback: progressCb('modelo de transcrição') });
  if (c.speakers) {
    const sid = 'onnx-community/wespeaker-voxceleb-resnet34-LM';
    spkProc = await AutoProcessor.from_pretrained(sid, { progress_callback: progressCb('modelo de oradores') });
    spkModel = await AutoModel.from_pretrained(sid, { device: 'wasm', dtype: 'fp32', progress_callback: progressCb('modelo de oradores') });
  }
  speakers = [];
  post('loaded', { device });
}

function normalize(v) {
  let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s) || 1; const o = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) o[i] = v[i] / s; return o;
}
function cos(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

async function speakerOf(audio, prev) {
  if (!spkModel || audio.length < 16000 * 0.9) return prev; // trechos muito curtos herdam o orador anterior
  const clip = audio.length > 16000 * 12 ? audio.subarray(0, 16000 * 12) : audio;
  const inputs = await spkProc(clip);
  const out = await spkModel(inputs);
  const t = out.embeddings || out.last_hidden_state || Object.values(out)[0];
  const e = normalize(t.data);
  let best = -1, bi = -1;
  speakers.forEach((s, i) => { const c = cos(e, s.c); if (c > best) { best = c; bi = i; } });
  if (bi >= 0 && best >= SPK_THRESHOLD) {
    const s = speakers[bi]; const n = s.n + 1;
    const c = new Float32Array(e.length);
    for (let i = 0; i < e.length; i++) c[i] = (s.c[i] * s.n + e[i]) / n;
    s.c = normalize(c); s.n = n; return bi;
  }
  speakers.push({ c: e, n: 1 });
  return speakers.length - 1;
}

/* Elimina repetições anómalas (o mesmo grupo de palavras repetido muitas vezes seguidas). */
function cleanRepeats(t) {
  let out = t.replace(/\s+/g, ' ').trim();
  for (let n = 1; n <= 6; n++) {
    const re = new RegExp('((?:\\S+\\s+){' + (n - 1) + '}\\S+)(?:\\s+\\1){3,}', 'gi');
    out = out.replace(re, '$1');
  }
  return out;
}

async function transcribe(audio, offset, prevSpeaker) {
  const res = await asr(audio, {
    language: 'portuguese', task: 'transcribe',
    chunk_length_s: 30, stride_length_s: 5, return_timestamps: true
  });
  const chunks = (res.chunks || [{ timestamp: [0, audio.length / 16000], text: res.text }]);
  const segs = [];
  let prev = prevSpeaker;
  for (const ch of chunks) {
    const text = cleanRepeats(ch.text || '');
    if (!text) continue;
    let [s, e] = ch.timestamp || [0, null];
    if (s == null) s = 0;
    const dur = audio.length / 16000;
    if (e == null || e > dur) e = Math.min(dur, Math.max(s + 1, e == null ? s + 30 : dur));
    if (s >= dur) continue;
    let spk = prev;
    if (cfg.speakers) {
      const a = Math.max(0, Math.floor(s * 16000)), b = Math.min(audio.length, Math.ceil(e * 16000));
      spk = await speakerOf(audio.subarray(a, b), prev);
      if (spk == null) spk = 0;
    }
    prev = spk;
    segs.push({ start: s + offset, end: e + offset, text, speaker: spk });
  }
  return { segs, last: prev };
}

self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.type === 'load') await load(m.config);
    else if (m.type === 'chunk') {
      const r = await transcribe(m.audio, m.offset, m.prevSpeaker);
      post('chunk-done', { id: m.id, segs: r.segs, last: r.last });
    }
  } catch (e) {
    post('error', { message: (e && e.message) || String(e), id: m.id });
  }
};
