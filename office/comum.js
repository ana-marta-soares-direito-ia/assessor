/*
 * Cofre para Excel, PowerPoint, Outlook e Gmail: funções comuns aos painéis.
 * Licença, separadores, revisão dos dados identificados, conta de IA do utilizador,
 * pseudonimização antes do envio e pilha de desfazer.
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 */
'use strict';
window.Cofre = (function () {
  var E = window.AnonEngine;
  var $ = function (id) { return document.getElementById(id); };
  var PONTE = 'https://assessor-ia.pages.dev/api/office';
  var CONTA_KEY = 'cofre.ia.conta', TOKEN_KEY = 'cofre.ia.token';

  /* ------------------------------------------------------------ utilitários */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  function tick() { return new Promise(function (r) { setTimeout(r, 15); }); }
  function setStatus(id, msg, kind) { var el = $(id); if (!el) return; el.className = 'status' + (kind ? ' ' + kind : ''); el.textContent = msg || ''; }
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }
  function errMsg(e) {
    var m = (e && (e.message || (e.debugInfo && e.debugInfo.message))) || String(e);
    return 'Não foi possível concluir a operação: ' + m;
  }
  function store(k, v) {
    try { if (v === undefined) return window.localStorage.getItem(k); if (v === null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); return true; }
    catch (e) { return v === undefined ? null : false; }
  }
  function descarregar(nome, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  /* ---------------------------------------------------------------- licença */
  var cfg = null, estado = { licensed: false, tab: 'assist' };
  function revogadas() {
    return fetch(((cfg && cfg.revogadas) || '../revogadas.json') + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : { revogadas: [] }; })
      .then(function (j) { return (j && j.revogadas) || []; })
      .catch(function () { return []; });
  }
  function verificar(code) {
    var v = window.Licenca ? window.Licenca.verify(code) : { ok: false, motivo: 'Não foi possível verificar a licença.' };
    if (!v.ok) return Promise.resolve(v);
    if (!window.Licenca.allows(cfg.produto, v.tipo)) return Promise.resolve({ ok: false, motivo: 'Este código é de outro produto e não activa o ' + cfg.nome + '.' });
    return revogadas().then(function (l) { if (l.indexOf(v.num) >= 0) { v.ok = false; v.motivo = 'Esta licença foi desactivada. Contacte Ana Marta Soares.'; } return v; });
  }
  function setLicensed(v) {
    estado.licensed = !!(v && v.ok);
    $('licInfo').textContent = estado.licensed
      ? v.tipoNome + ' n.º ' + v.num + ', ' + (v.validade ? 'válida até ' + v.validade.toLocaleDateString('pt-PT') : 'sem prazo de validade') + '.'
      : 'Sem licença activada.';
    $('btnDeactivate').hidden = !estado.licensed;
    showTab(estado.tab);
  }
  function showTab(name) {
    estado.tab = name;
    document.querySelectorAll('.tab').forEach(function (x) { var on = x.dataset.tab === name; x.classList.toggle('active', on); x.setAttribute('aria-selected', on); });
    var gate = !estado.licensed && name !== 'info';
    $('licGate').hidden = !gate;
    document.querySelectorAll('.panel').forEach(function (p) { p.classList.toggle('active', !gate && p.id === 'tab-' + name); });
  }
  function iniciarLicenca() {
    var key = 'cofre.licenca.' + cfg.produto;
    var code = store(key);
    if (code) verificar(code).then(function (v) { if (!v.ok) { store(key, null); setStatus('licStatus', v.motivo, 'err'); } setLicensed(v); });
    else setLicensed(null);
    $('btnActivate').addEventListener('click', function () {
      var c = $('licCode').value.replace(/\s+/g, '');
      if (!c) { setStatus('licStatus', 'Cole o código de licença.', 'err'); return; }
      setStatus('licStatus', 'A verificar…', 'busy');
      verificar(c).then(function (v) {
        if (!v.ok) { setStatus('licStatus', v.motivo, 'err'); return; }
        if (!store(key, c)) setStatus('licStatus', 'Licença válida. Este programa não permite guardar a activação, pelo que poderá ser necessário repeti-la.', 'busy');
        else setStatus('licStatus', '');
        $('licCode').value = '';
        setLicensed(v);
      });
    });
    $('btnDeactivate').addEventListener('click', function () { store(key, null); setLicensed(null); setStatus('licStatus', 'A licença foi removida deste computador.', 'ok'); });
  }

  /* ------------------------------------------------------------- arranque */
  function iniciar(opcoes) {
    cfg = opcoes;
    document.querySelectorAll('.tab').forEach(function (t) { t.addEventListener('click', function () { showTab(t.dataset.tab); window.scrollTo(0, 0); }); });
    iniciarLicenca();
    iniciarConta();
    construirCategorias();
    construirTiposManuais();
    document.querySelectorAll('[data-sugestao]').forEach(function (b) {
      b.addEventListener('click', function () { $('instrucao').value = b.dataset.sugestao; $('instrucao').focus(); });
    });
  }
  function licenciado() { return estado.licensed; }

  /* ------------------------------------------------- conta de IA do utilizador */
  function conta() { return { conta: (store(CONTA_KEY) || '').trim(), token: (store(TOKEN_KEY) || '').trim() }; }
  function mostrarConta() {
    var c = conta();
    $('iaConta').value = c.conta;
    $('iaToken').value = c.token ? '••••••••••••' + c.token.slice(-4) : '';
    $('iaToken').dataset.guardado = c.token ? '1' : '';
    $('iaEstado').textContent = c.conta && c.token ? 'Conta ligada: ' + c.conta.slice(0, 6) + '…' : 'Sem conta ligada. O assistente precisa da sua conta Cloudflare gratuita.';
    $('iaEstado').className = 'notice small ' + (c.conta && c.token ? 'info' : 'warn');
    var aviso = $('avisoConta'); if (aviso) aviso.hidden = !!(c.conta && c.token);
  }
  function iniciarConta() {
    mostrarConta();
    $('iaToken').addEventListener('focus', function () { if ($('iaToken').dataset.guardado) $('iaToken').value = ''; });
    $('btnGuardarConta').addEventListener('click', function () {
      var id = $('iaConta').value.trim(), tk = $('iaToken').value.trim();
      if (!tk && $('iaToken').dataset.guardado) tk = conta().token;
      if (!/^[a-f0-9]{32}$/i.test(id)) { setStatus('contaStatus', 'O identificador da conta tem 32 caracteres (letras de a a f e algarismos).', 'err'); return; }
      if (!/^[A-Za-z0-9_\-]{20,200}$/.test(tk)) { setStatus('contaStatus', 'O token não tem o formato esperado. Copie-o de novo da Cloudflare.', 'err'); return; }
      store(CONTA_KEY, id); store(TOKEN_KEY, tk); mostrarConta();
      setStatus('contaStatus', 'A testar a ligação…', 'busy');
      pedirIA({ sistema: 'Responda em português europeu.', mensagem: 'Responda apenas com a palavra: ok', maxTokens: 50 })
        .then(function () { setStatus('contaStatus', 'Ligação confirmada. O assistente está pronto a usar.', 'ok'); })
        .catch(function (e) { setStatus('contaStatus', e.message, 'err'); });
    });
    $('btnRemoverConta').addEventListener('click', function () { store(CONTA_KEY, null); store(TOKEN_KEY, null); mostrarConta(); setStatus('contaStatus', 'A conta foi removida deste computador.', 'ok'); });
  }
  function pedirIA(o) {
    var c = conta();
    if (!c.conta || !c.token) return Promise.reject(new Error('Ligue primeiro a sua conta Cloudflare gratuita no separador «Conta de IA».'));
    return fetch(PONTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cf-conta': c.conta, 'x-cf-token': c.token },
      body: JSON.stringify({ sistema: o.sistema, mensagem: o.mensagem, maxTokens: o.maxTokens || 3000, esforco: o.esforco || 'baixo' })
    }).catch(function () { throw new Error('Sem ligação à internet ou ao serviço de IA. Verifique a ligação e tente de novo.'); })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.ok && j.texto) return j.texto;
          var msg = j.erro === 'credenciais' ? 'A Cloudflare recusou o identificador da conta ou o token. Verifique-os no separador «Conta de IA».'
            : j.erro === 'limite' ? 'Atingiu o limite diário gratuito da sua conta Cloudflare. Volta a estar disponível amanhã.'
            : j.erro === 'sem-conta' ? 'Ligue primeiro a sua conta Cloudflare gratuita no separador «Conta de IA».'
            : j.erro === 'extenso' ? 'O conteúdo a enviar é demasiado extenso. Seleccione uma parte mais pequena.'
            : 'O serviço de IA não respondeu (' + (j.detalhe || r.status) + '). Tente de novo dentro de momentos.';
          throw new Error(msg);
        });
      });
  }
  // Extrai o primeiro objecto JSON de uma resposta do modelo
  function extrairJSON(t) {
    t = String(t || '').replace(/```(?:json)?/gi, '');
    var i = t.indexOf('{');
    while (i >= 0) {
      var nivel = 0, dentro = false, escape = false;
      for (var j = i; j < t.length; j++) {
        var ch = t[j];
        if (dentro) { if (escape) escape = false; else if (ch === '\\') escape = true; else if (ch === '"') dentro = false; continue; }
        if (ch === '"') dentro = true;
        else if (ch === '{') nivel++;
        else if (ch === '}') { nivel--; if (nivel === 0) { try { return JSON.parse(t.slice(i, j + 1)); } catch (e) { break; } } }
      }
      i = t.indexOf('{', i + 1);
    }
    throw new Error('A resposta do serviço de IA não veio no formato esperado. Tente reformular a instrução.');
  }

  /* --------------------------------------- pseudonimização antes do envio à IA */
  // Substitui os dados pessoais por etiquetas nos textos a enviar e repõe-nos na resposta.
  function mascara(textos, activa) {
    if (!activa) return { tapar: function (t) { return t; }, destapar: function (t) { return t; }, n: 0 };
    var linhas = [];
    // análise por linha (nomes em maiúsculas no início de linha) e por parágrafo (dados partidos entre linhas)
    textos.forEach(function (t) {
      if (typeof t !== 'string' || !t) return;
      t.split('\n').forEach(function (l) { if (l.trim()) linhas.push(l); });
      t.replace(/([^\n])\n(?!\n)/g, '$1 ').split('\n').forEach(function (l) { if (l.trim()) linhas.push(l); });
    });
    var res = E.analyze(linhas, {});
    var ents = res.entities.filter(function (e) { return e.selected; });
    var plano = E.buildPlan(ents, { style: 'label' });
    var mapa = E.parseTable(E.buildTable(ents, {}));
    return {
      tapar: function (t) { return typeof t === 'string' && t ? E.applyToText(t, plano) : t; },
      destapar: function (t) { return typeof t === 'string' && t ? E.revertText(t, mapa) : t; },
      n: ents.length
    };
  }
  // Grafia anterior ao Acordo Ortográfico de 1990 e termos em português nos textos produzidos pelo assistente
  var GRAFIA = [
    ['ação', 'acção'], ['ações', 'acções'], ['redação', 'redacção'], ['redações', 'redacções'], ['direção', 'direcção'], ['direções', 'direcções'],
    ['proteção', 'protecção'], ['seleção', 'selecção'], ['coleção', 'colecção'], ['correção', 'correcção'], ['correções', 'correcções'],
    ['exceção', 'excepção'], ['exceções', 'excepções'], ['receção', 'recepção'], ['infeção', 'infecção'], ['inspeção', 'inspecção'],
    ['atual', 'actual'], ['atuais', 'actuais'], ['atualmente', 'actualmente'], ['atualizar', 'actualizar'], ['atualização', 'actualização'],
    ['ativo', 'activo'], ['ativos', 'activos'], ['ativa', 'activa'], ['ativas', 'activas'], ['atividade', 'actividade'], ['atividades', 'actividades'],
    ['objeto', 'objecto'], ['objetos', 'objectos'], ['objetivo', 'objectivo'], ['objetivos', 'objectivos'], ['projeto', 'projecto'], ['projetos', 'projectos'],
    ['efetivo', 'efectivo'], ['efetiva', 'efectiva'], ['efetivamente', 'efectivamente'], ['efetuar', 'efectuar'], ['efetuado', 'efectuado'], ['efetuada', 'efectuada'], ['efetuou', 'efectuou'], ['efetua', 'efectua'], ['efetuam', 'efectuam'], ['efetuados', 'efectuados'], ['efetuadas', 'efectuadas'],
    ['direto', 'directo'], ['direta', 'directa'], ['diretamente', 'directamente'], ['diretor', 'director'], ['diretiva', 'directiva'],
    ['exato', 'exacto'], ['exata', 'exacta'], ['exatamente', 'exactamente'], ['fator', 'factor'], ['fatores', 'factores'],
    ['adotar', 'adoptar'], ['adotado', 'adoptado'], ['adotada', 'adoptada'], ['ótimo', 'óptimo'], ['setor', 'sector'], ['setores', 'sectores'],
    ['aspeto', 'aspecto'], ['aspetos', 'aspectos'], ['perspetiva', 'perspectiva'], ['respetivo', 'respectivo'], ['respetiva', 'respectiva'], ['respetivamente', 'respectivamente'],
    ['coletivo', 'colectivo'], ['coletiva', 'colectiva'], ['contato', 'contacto'], ['contatos', 'contactos'],
    ['ativação', 'activação'], ['atuação', 'actuação'], ['atuar', 'actuar'], ['transação', 'transacção'], ['transações', 'transacções'],
    ['reação', 'reacção'], ['interação', 'interacção'], ['fração', 'fracção'], ['frações', 'fracções'], ['infração', 'infracção'], ['infrações', 'infracções'],
    ['correto', 'correcto'], ['correta', 'correcta'], ['corretos', 'correctos'], ['corretas', 'correctas'], ['corretamente', 'correctamente'],
    ['receção', 'recepção'], ['receções', 'recepções'], ['ótima', 'óptima'], ['ótimos', 'óptimos'], ['contratual', 'contractual'], ['contratuais', 'contractuais'], ['eletrónico', 'electrónico'], ['eletrónica', 'electrónica'], ['eletrónicos', 'electrónicos'],
    ['janeiro', 'Janeiro'], ['fevereiro', 'Fevereiro'], ['março', 'Março'], ['abril', 'Abril'], ['maio', 'Maio'], ['junho', 'Junho'], ['julho', 'Julho'], ['agosto', 'Agosto'], ['setembro', 'Setembro'], ['outubro', 'Outubro'], ['novembro', 'Novembro'], ['dezembro', 'Dezembro'],
    ['slides', 'diapositivos'], ['slide', 'diapositivo']
  ];
  // Sem travessões: nas linhas de lista, o primeiro passa a dois pontos; os restantes, a vírgula
  function semTravessoes(t) {
    t = t.replace(/[\u2010\u2011]/g, '-');
    t = t.replace(/\.[ \t]+[\u2013\u2014][ \t]+([^\n]*?)\.?([ \t]*)$/gm, ' ($1).$2');
    t = t.replace(/^(\s*(?:(?:[•\-*]|\d+[.)])\s+[^\n]*?|«[^»\n]+»))\s+[\u2013\u2014]\s+/gm, '$1: ');
    t = t.replace(/\s+[\u2013\u2014]\s+/g, ', ').replace(/[\u2013\u2014]/g, '-');
    return t;
  }
  // literal: não substitui palavras (por exemplo, «slides»), só corrige a grafia (transcrições)
  function grafia(t, literal) {
    if (typeof t !== 'string' || !t) return t;
    t = semTravessoes(t);
    GRAFIA.forEach(function (par) {
      if (literal && /^slides?$/.test(par[0])) return;
      t = t.replace(new RegExp('(^|[^\\p{L}])(' + par[0] + ')(?![\\p{L}])', 'giu'), function (m, antes, palavra) {
        var novo = par[1];
        if (palavra === palavra.toUpperCase()) novo = novo.toUpperCase();
        else if (palavra[0] === palavra[0].toUpperCase()) novo = novo[0].toUpperCase() + novo.slice(1);
        return antes + novo;
      });
    });
    return t;
  }
  function destaparFundo(obj, m) {
    if (typeof obj === 'string') return grafia(m.destapar(obj));
    if (Array.isArray(obj)) return obj.map(function (x) { return destaparFundo(x, m); });
    if (obj && typeof obj === 'object') { var o = {}; Object.keys(obj).forEach(function (k) { o[k] = destaparFundo(obj[k], m); }); return o; }
    return obj;
  }

  /* ------------------------------------------------------- pilha de desfazer */
  var pilha = [];
  function registar(desc, fn) { pilha.push({ desc: desc, fn: fn }); actualizarDesfazer(); }
  function actualizarDesfazer() { var b = $('btnDesfazer'); if (b) { b.hidden = !pilha.length; b.textContent = pilha.length ? 'Desfazer as alterações do assistente (' + pilha.length + ')' : 'Desfazer'; } }
  async function desfazerTudo() {
    var falhas = 0;
    while (pilha.length) {
      var p = pilha.pop();
      try { await p.fn(); } catch (e) { falhas++; }
    }
    actualizarDesfazer();
    return falhas;
  }

  /* ---------------------------------------------- revisão dos dados (anonimizar) */
  function construirCategorias() {
    var box = $('catList'); if (!box) return;
    E.TYPE_ORDER.forEach(function (t) {
      if (t === 'TERMO') return;
      var l = document.createElement('label'); l.className = 'check';
      l.innerHTML = '<input type="checkbox" data-type="' + t + '" checked><span>' + esc(E.TYPES[t].name) + '</span>';
      box.appendChild(l);
    });
  }
  function construirTiposManuais() {
    var sel = $('manualType'); if (!sel) return;
    ['TERMO', 'PESSOA', 'ENTIDADE', 'MORADA'].forEach(function (t) {
      var o = document.createElement('option'); o.value = t;
      o.textContent = { TERMO: 'Outro termo', PESSOA: 'Pessoa', ENTIDADE: 'Entidade', MORADA: 'Morada' }[t];
      sel.appendChild(o);
    });
  }
  function tiposActivos() { var r = {}; document.querySelectorAll('#catList input').forEach(function (c) { r[c.dataset.type] = c.checked; }); return r; }
  function mostrarEntidades(ents, aoLocalizar) {
    var list = $('entityList'); list.innerHTML = '';
    var total = ents.reduce(function (a, e) { return a + (e.count || 0); }, 0);
    var grupos = {};
    ents.forEach(function (en) { (grupos[en.type] = grupos[en.type] || []).push(en); });
    $('reviewSummary').textContent = ents.length
      ? plural(ents.length, 'elemento distinto', 'elementos distintos') + ', em ' + plural(total, 'ocorrência', 'ocorrências') + '. Desmarque o que não deve ser substituído e acrescente o que não tiver sido identificado.'
      : 'Não foram identificados dados pessoais. Pode acrescentar manualmente os termos a substituir.';
    if (!ents.length) { list.innerHTML = '<div class="empty">Sem elementos identificados.</div>'; return; }
    E.TYPE_ORDER.forEach(function (t) {
      var g = grupos[t]; if (!g) return;
      var wrap = document.createElement('div'); wrap.className = 'group';
      var head = document.createElement('div'); head.className = 'group-h';
      head.innerHTML = '<span class="chev">▼</span><input type="checkbox" ' + (g.every(function (e) { return e.selected; }) ? 'checked' : '') + ' aria-label="Seleccionar a categoria"><span>' + esc(E.TYPES[t].name) + '</span><span class="cnt">' + g.length + '</span>';
      var gchk = head.querySelector('input');
      gchk.addEventListener('click', function (ev) { ev.stopPropagation(); g.forEach(function (e) { e.selected = gchk.checked; }); mostrarEntidades(ents, aoLocalizar); });
      head.addEventListener('click', function () { wrap.classList.toggle('closed'); });
      wrap.appendChild(head);
      var items = document.createElement('div'); items.className = 'items';
      g.forEach(function (en) {
        var row = document.createElement('div'); row.className = 'item' + (en.selected ? '' : ' off');
        var vars = Array.from(en.variants.keys()).filter(function (v) { return v !== en.canonical; });
        row.innerHTML = '<input type="checkbox" ' + (en.selected ? 'checked' : '') + ' aria-label="Substituir">' +
          '<div class="txt"><div class="val">' + esc(en.canonical) + '</div><div class="meta"><span class="chip">' + esc(en.label) + '</span>' +
          (en.manual ? '<span class="times">acrescentado</span>' : '<span class="times">' + plural(en.count, 'ocorrência', 'ocorrências') + '</span>') + '</div>' +
          (vars.length ? '<div class="var">Também: ' + esc(vars.join('; ')) + '</div>' : '') + '</div>' +
          (aoLocalizar ? '<button class="loc" title="Localizar">Localizar</button>' : '');
        row.querySelector('input').addEventListener('change', function (ev) { en.selected = ev.target.checked; row.classList.toggle('off', !en.selected); gchk.checked = g.every(function (e) { return e.selected; }); });
        if (aoLocalizar) row.querySelector('.loc').addEventListener('click', function () { aoLocalizar(en); });
        items.appendChild(row);
      });
      wrap.appendChild(items); list.appendChild(wrap);
    });
  }
  function tabelaDocx(nome, texto) {
    var paras = String(texto).split('\n').map(function (l, i) { return { text: l, bold: i === 0, size: i === 0 ? 14 : 11 }; });
    var bytes = window.DocxUtil.buildDocx(paras);
    descarregar(nome, new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  }
  function lerFicheiroTabela(file) {
    if (!file) return Promise.resolve('');
    if (/\.docx$/i.test(file.name)) return file.arrayBuffer().then(function (b) { return window.DocxUtil.readDocxText(b); });
    return file.text();
  }

  return {
    $: $, esc: esc, plural: plural, tick: tick, setStatus: setStatus, busy: busy, errMsg: errMsg, descarregar: descarregar,
    iniciar: iniciar, licenciado: licenciado, showTab: showTab,
    pedirIA: pedirIA, extrairJSON: extrairJSON, conta: conta,
    mascara: mascara, destaparFundo: destaparFundo, grafia: grafia,
    registar: registar, desfazerTudo: desfazerTudo, actualizarDesfazer: actualizarDesfazer,
    tiposActivos: tiposActivos, mostrarEntidades: mostrarEntidades, tabelaDocx: tabelaDocx, lerFicheiroTabela: lerFicheiroTabela
  };
})();
