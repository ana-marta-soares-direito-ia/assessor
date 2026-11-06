// Ponte de transcrição do Assessor de Transcrição.
// Só funciona com a conta Cloudflare do próprio utilizador: o pedido corre na conta dele, pela API REST,
// com o modelo Whisper (sem retenção de dados). Nem o áudio nem as credenciais são guardados.
const ORIGENS = ["https://ana-marta-soares-direito-ia.github.io", "https://assessor-ia.pages.dev"];
const MODELO = "@cf/openai/whisper-large-v3-turbo";
const LIMITE = 25 * 1024 * 1024; // bytes por pedido (cada parte tem cerca de minuto e meio)
const API = "https://api.cloudflare.com/client/v4";

function cabecalhos(request) {
  const origem = request.headers.get("Origin") || "";
  const h = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-cf-conta, x-cf-token",
    "Access-Control-Max-Age": "86400",
    "Cross-Origin-Resource-Policy": "cross-origin",
    Vary: "Origin",
  };
  if (ORIGENS.includes(origem)) h["Access-Control-Allow-Origin"] = origem;
  return h;
}
const resposta = (request, obj, estado = 200) => new Response(JSON.stringify(obj), { status: estado, headers: cabecalhos(request) });

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cabecalhos(request) });
}

export async function onRequestPost({ request, env }) {
  const conta = (request.headers.get("x-cf-conta") || "").trim();
  const chave = (request.headers.get("x-cf-token") || "").trim();
  if (!conta || !chave) return resposta(request, { erro: "sem-conta", detalhe: "Ligue a sua conta Cloudflare no separador «Conta de IA»." }, 401);
  if (!/^[a-f0-9]{32}$/i.test(conta) || !/^[A-Za-z0-9_\-]{20,200}$/.test(chave)) return resposta(request, { erro: "credenciais", detalhe: "O identificador da conta ou o token não têm o formato esperado." }, 401);
  const tamanho = Number(request.headers.get("content-length") || 0);
  if (tamanho > LIMITE) return resposta(request, { erro: "extenso", detalhe: "Parte de áudio demasiado extensa." }, 413);
  // o corpo (JSON com o áudio em base64 e as opções do modelo) segue tal como chegou, sem ser lido
  const corpo = await request.arrayBuffer();
  if (!corpo.byteLength || corpo.byteLength > LIMITE) return resposta(request, { erro: "extenso", detalhe: "Parte de áudio vazia ou demasiado extensa." }, 413);
  let r, j;
  try {
    r = await fetch(`${env.CF_API_BASE || API}/accounts/${conta}/ai/run/${MODELO}`, {
      method: "POST", headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" }, body: corpo,
    });
    j = await r.json().catch(() => ({}));
  } catch (e) {
    return resposta(request, { erro: "rede", detalhe: "Não foi possível contactar a Cloudflare." }, 503);
  }
  if (!r.ok || j.success === false) {
    const msg = JSON.stringify(j.errors || j).slice(0, 300);
    if (r.status === 401 || r.status === 403 || /authenticat|10000|invalid.*token|unauthori/i.test(msg)) return resposta(request, { erro: "credenciais", detalhe: "A Cloudflare recusou o identificador da conta ou o token." }, 401);
    if (r.status === 429 || /4006|daily|neurons|quota|limit/i.test(msg)) return resposta(request, { erro: "limite", detalhe: "Foi atingido o limite diário gratuito da sua conta Cloudflare." }, 429);
    if (r.status >= 500) return resposta(request, { erro: "rede", detalhe: "Serviço de IA temporariamente indisponível (" + r.status + ")." }, 503);
    return resposta(request, { erro: "modelo", detalhe: msg }, 502);
  }
  const res = j.result || {};
  const segmentos = (Array.isArray(res.segments) ? res.segments : [])
    .map((s) => ({ s: Number(s.start) || 0, e: Number(s.end) || 0, t: String(s.text || "").trim() }))
    .filter((s) => s.t);
  if (!segmentos.length && res.text && String(res.text).trim()) segmentos.push({ s: 0, e: Number(res.transcription_info && res.transcription_info.duration) || 0, t: String(res.text).trim() });
  return resposta(request, { segmentos, duracao: (res.transcription_info && res.transcription_info.duration) || null });
}
