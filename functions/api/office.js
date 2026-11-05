// Ponte de IA do Assessor para Outlook e do Assessor para Gmail (e dos suplementos Cofre para Excel e PowerPoint).
// Só funciona com a conta Cloudflare do próprio utilizador: o pedido corre na conta dele, pela API REST,
// e as credenciais não são guardadas. Recebe apenas texto já pseudonimizado no computador do utilizador.
const ORIGENS = ["https://ana-marta-soares-direito-ia.github.io", "https://assessor-ia.pages.dev"];
const MODELOS = {
  principal: "@cf/openai/gpt-oss-120b",
  alternativo: "@cf/openai/gpt-oss-20b",
};
const LIMITE = 120000; // caracteres por pedido
const API = "https://api.cloudflare.com/client/v4";

function cabecalhos(request) {
  const origem = request.headers.get("Origin") || "";
  const h = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-cf-conta, x-cf-token",
    "Access-Control-Max-Age": "86400",
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
  let corpo;
  try { corpo = await request.json(); } catch { return resposta(request, { erro: "Pedido inválido." }, 400); }
  const sistema = String(corpo.sistema || "").slice(0, 12000);
  const mensagem = String(corpo.mensagem || "");
  if (!mensagem || mensagem.length > LIMITE) return resposta(request, { erro: "extenso", detalhe: "O conteúdo a enviar é demasiado extenso. Seleccione uma parte mais pequena." }, 413);
  const max = Math.min(Number(corpo.maxTokens) || 3000, 8000);
  const modelo = MODELOS[corpo.modelo] || MODELOS.principal;
  const pedido = { instructions: sistema, input: mensagem, reasoning: { effort: corpo.esforco === "medio" ? "medium" : "low" }, max_output_tokens: max };
  let r, j;
  try {
    r = await fetch(`${env.CF_API_BASE || API}/accounts/${conta}/ai/run/${modelo}`, {
      method: "POST", headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" }, body: JSON.stringify(pedido),
    });
    j = await r.json().catch(() => ({}));
  } catch (e) {
    return resposta(request, { erro: "rede", detalhe: "Não foi possível contactar a Cloudflare." }, 502);
  }
  if (!r.ok || j.success === false) {
    const msg = JSON.stringify(j.errors || j).slice(0, 300);
    if (r.status === 401 || r.status === 403 || /authenticat|10000|invalid.*token|unauthori/i.test(msg)) return resposta(request, { erro: "credenciais", detalhe: "A Cloudflare recusou o identificador da conta ou o token." }, 401);
    if (r.status === 429 || /4006|daily|neurons|quota|limit/i.test(msg)) return resposta(request, { erro: "limite", detalhe: "Foi atingido o limite diário gratuito da sua conta Cloudflare. Volta a estar disponível amanhã." }, 429);
    return resposta(request, { erro: "modelo", detalhe: msg }, 502);
  }
  const texto = limpar(extrair(j.result));
  if (!texto) return resposta(request, { erro: "vazio", detalhe: "O modelo não devolveu resposta." }, 502);
  return resposta(request, { texto, modelo });
}

function extrair(r) {
  if (!r) return "";
  if (typeof r === "string") return r;
  if (typeof r.response === "string") return r.response;
  if (Array.isArray(r.output)) {
    const partes = [];
    for (const item of r.output) if (item.type === "message" && Array.isArray(item.content)) for (const c of item.content) if (c.text) partes.push(c.text);
    if (partes.length) return partes.join("");
  }
  if (r.output_text) return r.output_text;
  if (r.choices?.[0]?.message?.content) return r.choices[0].message.content;
  return "";
}
function limpar(t) {
  return String(t || "").replace(/<\|[^|]*\|>/g, "").replace(/^\s*(analysis|assistantfinal)\s*/i, "").trim();
}
