/*
 * Assessor Documental: resumos de documentos Word e PDF e perguntas sobre eles.
 * Os documentos são lidos e guardados apenas no aparelho (IndexedDB). Para cada pergunta, os excertos
 * mais relevantes são escolhidos no aparelho e enviados ao serviço de IA da conta Cloudflare do utilizador,
 * com os dados pessoais substituídos por etiquetas, que são repostas no aparelho.
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 */
'use strict';
(function () {
  var C = window.Cofre, A = window.Anexos, $ = C.$;
  var st = { dossies: [], actual: null, indice: null, ocupado: false };
  var MAX_CONTEXTO = 30000, TAM_EXCERTO = 1100, PARTE_RESUMO = 26000;

  /* ============================================================ armazenamento local */
  var BD = null;
  function abrirBD() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('assessor-documental', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('dossies', { keyPath: 'id' }); };
      r.onsuccess = function () { BD = r.result; res(); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function tx(modo, fn) {
    return new Promise(function (res, rej) {
      var t = BD.transaction('dossies', modo), s = t.objectStore('dossies'), out;
      var q = fn(s); if (q) q.onsuccess = function () { out = q.result; };
      t.oncomplete = function () { res(out); }; t.onerror = function () { rej(t.error); };
    });
  }
  function todos() { return tx('readonly', function (s) { return s.getAll(); }); }
  function guardar(d) { d.alterado = Date.now(); return tx('readwrite', function (s) { return s.put(d); }); }
  function apagarBD(id) { return tx('readwrite', function (s) { return s.delete(id); }); }
  function novoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ============================================================ arranque */
  function boot() {
    if (!window.__cofreSuportado || !C || !A || !window.indexedDB) { $('unsupported').hidden = false; return; }
    C.iniciar({ produto: 'documental', nome: 'Assessor Documental', revogadas: 'https://ana-marta-soares-direito-ia.github.io/assessor/revogadas.json' });
    C.showTab('dossies');
    bind();
    abrirBD().then(carregar).catch(function () { $('outside').hidden = false; });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  function bind() {
    $('dossie').addEventListener('change', function () { abrir($('dossie').value); });
    $('btnNovo').addEventListener('click', novoDossie);
    $('btnRenomear').addEventListener('click', renomear);
    $('btnApagar').addEventListener('click', apagarDossie);
    $('ficheiros').addEventListener('change', function () { importar(Array.prototype.slice.call($('ficheiros').files)); $('ficheiros').value = ''; });
    $('btnColar').addEventListener('click', colar);
    $('btnPerguntar').addEventListener('click', perguntar);
    $('instrucao').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) perguntar(); });
    document.querySelectorAll('[data-nota]').forEach(function (b) { b.addEventListener('click', function () { gerarNota(b.dataset.nota); }); });
    $('btnLimpar').addEventListener('click', function () {
      if (!st.actual || !st.actual.conversa.length) return;
      if (!confirmar('Apagar a conversa deste dossiê? Os documentos mantêm-se.')) return;
      st.actual.conversa = []; guardar(st.actual).then(mostrarConversa);
    });
  }
  function confirmar(t) { try { return window.confirm(t); } catch (e) { return true; } }
  function carregar() {
    return todos().then(function (l) {
      st.dossies = (l || []).sort(function (a, b) { return (b.alterado || 0) - (a.alterado || 0); });
      if (!st.dossies.length) {
        var d = { id: novoId(), nome: 'O meu primeiro dossiê', docs: [], conversa: [], criado: Date.now() };
        st.dossies.push(d); return guardar(d).then(function () { return d.id; });
      }
      return st.dossies[0].id;
    }).then(function (id) { listarDossies(id); abrir(id); });
  }
  function listarDossies(sel) {
    var s = $('dossie'); s.innerHTML = '';
    st.dossies.forEach(function (d) { var o = document.createElement('option'); o.value = d.id; o.textContent = d.nome + ' (' + C.plural(d.docs.length, 'documento', 'documentos') + ')'; s.appendChild(o); });
    if (sel) s.value = sel;
  }
  function abrir(id) {
    st.actual = st.dossies.filter(function (d) { return d.id === id; })[0] || st.dossies[0];
    st.indice = null;
    mostrarDocs(); mostrarConversa();
  }
  function novoDossie() {
    var nome = pedirTexto('Nome do novo dossiê (por exemplo, o nome do processo ou do cliente):', ''); if (!nome) return;
    var d = { id: novoId(), nome: nome, docs: [], conversa: [], criado: Date.now() };
    st.dossies.unshift(d); guardar(d).then(function () { listarDossies(d.id); abrir(d.id); });
  }
  function pedirTexto(t, v) { try { var r = window.prompt(t, v); return r && r.trim(); } catch (e) { return ''; } }
  function renomear() {
    var nome = pedirTexto('Novo nome do dossiê:', st.actual.nome); if (!nome) return;
    st.actual.nome = nome; guardar(st.actual).then(function () { listarDossies(st.actual.id); });
  }
  function apagarDossie() {
    if (!confirmar('Apagar o dossiê «' + st.actual.nome + '» e todos os documentos e conversas que contém, deste aparelho?')) return;
    var id = st.actual.id;
    apagarBD(id).then(function () {
      st.dossies = st.dossies.filter(function (d) { return d.id !== id; });
      if (!st.dossies.length) return carregar();
      listarDossies(st.dossies[0].id); abrir(st.dossies[0].id);
    });
  }

  /* ============================================================ documentos */
  function tamanhoTexto(d) { return d.paginas.reduce(function (a, p) { return a + p.length; }, 0); }
  function mostrarDocs() {
    var box = $('docs'); box.innerHTML = '';
    var d = st.actual;
    if (!d.docs.length) { box.innerHTML = '<div class="vazio small">Ainda não há documentos neste dossiê.</div>'; return; }
    d.docs.forEach(function (doc) {
      var el = document.createElement('div'); el.className = 'doc' + (doc.incluir ? '' : ' off');
      var info = (doc.tipo === 'pdf' ? C.plural(doc.paginas.length, 'página', 'páginas') + ' · ' : '') + Math.max(1, Math.round(tamanhoTexto(doc) / 1000)) + ' mil caracteres';
      el.innerHTML = '<label class="check"><input type="checkbox"' + (doc.incluir ? ' checked' : '') + ' aria-label="Considerar este documento"><span><b>' + C.esc(doc.nome) + '</b><small>' + C.esc(info) + (doc.semTexto ? ' · sem texto legível' : '') + '</small></span></label>' +
        '<div class="doc-acoes"><button class="link-btn res">Resumir</button><button class="link-btn rem">Remover</button></div>';
      el.querySelector('input').addEventListener('change', function (e) { doc.incluir = e.target.checked; el.classList.toggle('off', !doc.incluir); st.indice = null; guardar(d); });
      el.querySelector('.res').addEventListener('click', function () { resumirDocumento(doc); });
      el.querySelector('.rem').addEventListener('click', function () {
        if (!confirmar('Remover «' + doc.nome + '» deste dossiê?')) return;
        d.docs = d.docs.filter(function (x) { return x !== doc; }); st.indice = null;
        guardar(d).then(function () { mostrarDocs(); listarDossies(d.id); });
      });
      box.appendChild(el);
    });
  }
  function lerFicheiro(f) {
    var ext = A.ext(f.name);
    return f.arrayBuffer().then(function (buf) {
      if (ext === 'pdf' || /pdf/i.test(f.type)) {
        return A.paginasPdf(buf, 600, function (i, n) { C.setStatus('docsStatus', 'A ler «' + f.name + '»: página ' + i + ' de ' + n + '…', 'busy'); })
          .then(function (r) { return { tipo: 'pdf', paginas: r.paginas }; });
      }
      if (ext === 'docx') return window.DocxUtil.readDocxText(buf).then(function (t) { return { tipo: 'docx', paginas: [t] }; });
      if (ext === 'doc') throw new Error('o formato .doc antigo não é lido; guarde o documento como .docx no Word');
      return A.extrair(f.name, f.type, buf).then(function (t) { return { tipo: 'texto', paginas: [t] }; });
    });
  }
  function importar(fs) {
    if (!fs.length || !C.licenciado()) return;
    var d = st.actual, i = 0, ok = 0, erros = [];
    function proximo() {
      if (i >= fs.length) {
        st.indice = null;
        return guardar(d).then(function () {
          mostrarDocs(); listarDossies(d.id);
          C.setStatus('docsStatus', (ok ? C.plural(ok, 'documento acrescentado', 'documentos acrescentados') + '. ' : '') + (erros.length ? 'Não foi possível ler: ' + erros.join('; ') : ''), erros.length ? 'err' : 'ok');
        });
      }
      var f = fs[i++];
      C.setStatus('docsStatus', 'A ler «' + f.name + '»…', 'busy');
      return lerFicheiro(f).then(function (r) {
        var total = r.paginas.join('').trim().length;
        d.docs.push({ id: novoId(), nome: f.name, tipo: r.tipo, paginas: r.paginas, incluir: true, semTexto: total < 20, adicionado: Date.now() });
        ok++;
      }).catch(function (e) { erros.push(f.name + ' (' + ((e && e.message) || e) + ')'); }).then(proximo);
    }
    proximo();
  }
  function colar() {
    if (!C.licenciado()) return;
    var t = $('colarTexto').value.trim(); if (!t) { C.setStatus('docsStatus', 'Cole primeiro o texto.', 'err'); return; }
    var nome = $('colarNome').value.trim() || 'Texto colado';
    st.actual.docs.push({ id: novoId(), nome: nome, tipo: 'texto', paginas: [t], incluir: true, adicionado: Date.now() });
    st.indice = null;
    guardar(st.actual).then(function () { $('colarTexto').value = ''; $('colarNome').value = ''; mostrarDocs(); listarDossies(st.actual.id); C.setStatus('docsStatus', 'Texto acrescentado.', 'ok'); });
  }

  /* ============================================================ pesquisa local (BM25) */
  var VAZIAS = ('a o as os um uma uns umas de do da dos das em no na nos nas por pelo pela pelos pelas para com sem sob sobre entre ate desde ' +
    'e ou mas que se nao sim ja ha ao aos a as é sao ser foi era esta este isto isso aquilo esse essa estes estas esses essas seu sua seus suas ' +
    'lhe lhes me te nos vos ele ela eles elas eu tu voce mais menos muito muita tambem como quando onde qual quais quem cujo cuja tem ter sido ' +
    'pode podem deve devem caso tenho cliente situacao aplica aplicase aplicam documento documentos').split(' ');
  var VAZ = {}; VAZIAS.forEach(function (w) { VAZ[w] = 1; });
  function normal(t) { return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function termos(t) {
    return (normal(t).match(/[a-z0-9]+/g) || []).filter(function (w) { return (w.length > 2 || /^\d+$/.test(w)) && !VAZ[w]; })
      .map(function (w) { return /^\d+$/.test(w) ? w : w.slice(0, 6); });
  }
  function excertos() {
    var out = [];
    st.actual.docs.forEach(function (doc, di) {
      if (!doc.incluir) return;
      doc.paginas.forEach(function (pg, pi) {
        var paras = pg.split(/\n{2,}|\n(?=\s*(?:Artigo|Art\.º|Cláusula|CAPÍTULO|Capítulo|SECÇÃO|Secção|\d+\.º|\d+\s*[-.)]\s))/), atual = '';
        function fechar() { if (atual.trim()) out.push({ doc: doc, di: di, pagina: doc.tipo === 'pdf' ? pi + 1 : null, texto: atual.trim() }); atual = ''; }
        paras.forEach(function (p) {
          p = p.trim(); if (!p) return;
          if (atual && atual.length + p.length > TAM_EXCERTO) fechar();
          if (p.length > TAM_EXCERTO * 1.6) { for (var k = 0; k < p.length; k += TAM_EXCERTO) { atual = p.slice(k, k + TAM_EXCERTO); fechar(); } return; }
          atual += (atual ? '\n' : '') + p;
        });
        fechar();
      });
    });
    out.forEach(function (e, i) { e.ordem = i; });
    return out;
  }
  function indice() {
    if (st.indice) return st.indice;
    var ex = excertos(), df = {}, soma = 0;
    ex.forEach(function (e) {
      e.tf = {}; var ts = termos(e.texto); e.len = ts.length; soma += ts.length;
      ts.forEach(function (t) { e.tf[t] = (e.tf[t] || 0) + 1; });
      Object.keys(e.tf).forEach(function (t) { df[t] = (df[t] || 0) + 1; });
    });
    st.indice = { ex: ex, df: df, media: ex.length ? soma / ex.length : 1 };
    return st.indice;
  }
  function escolher(pergunta) {
    var ix = indice(), ex = ix.ex;
    var total = ex.reduce(function (a, e) { return a + e.texto.length; }, 0);
    if (total <= MAX_CONTEXTO) return { lista: ex.slice(), todos: true };
    var q = termos(pergunta), N = ex.length, k1 = 1.4, b = 0.75;
    ex.forEach(function (e) {
      var s = 0;
      q.forEach(function (t) {
        var f = e.tf[t]; if (!f) return;
        var idf = Math.log(1 + (N - ix.df[t] + 0.5) / (ix.df[t] + 0.5));
        s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * e.len / ix.media));
      });
      e.pont = s;
    });
    var ord = ex.slice().sort(function (a, c) { return c.pont - a.pont; });
    var esc = [], usado = 0, marcados = {};
    function junta(e) { if (!e || marcados[e.ordem] || usado + e.texto.length > MAX_CONTEXTO) return; marcados[e.ordem] = 1; esc.push(e); usado += e.texto.length; }
    for (var i = 0; i < ord.length && usado < MAX_CONTEXTO; i++) {
      if (ord[i].pont <= 0 && esc.length >= 6) break;
      junta(ord[i]);
      if (i < 4) { junta(ex[ord[i].ordem + 1]); } // contexto imediato dos excertos mais relevantes
    }
    esc.sort(function (a, c) { return a.ordem - c.ordem; });
    return { lista: esc, todos: false };
  }

  /* ============================================================ IA */
  function juntarLinhas(t) { return String(t).replace(/([^\n])\n(?!\n)/g, '$1 '); }
  // Resposta noutra língua ou degradada: repete-se uma vez o pedido
  function emIngles(t) { return (String(t).match(/\b(the|and|of|with|which|is|are|that)\b/gi) || []).length > 8; }
  // brutos: os textos originais, com as mudanças de linha, também analisados para detectar os dados pessoais
  function pedir(sistema, mensagem, maxTokens, brutos) {
    var m = C.mascara([mensagem].concat(brutos || []), $('optMascara').checked);
    var o = { sistema: sistema, mensagem: m.tapar(mensagem), maxTokens: maxTokens || 5000, esforco: 'baixo' };
    return C.pedirIA(o).then(function (t) {
      if (!emIngles(t)) return t;
      return C.pedirIA(o).then(function (t2) { return emIngles(t2) ? t : t2; });
    }).then(function (t) { return { texto: C.destaparFundo(String(t || '').trim(), m), n: m.n }; });
  }
  var REGRAS_COMUNS =
    'Escreve em português europeu, com a grafia anterior ao Acordo Ortográfico de 1990, em registo jurídico, claro e sem travessões. ' +
    'As etiquetas como [PESSOA_1] ou [NIF_1] substituem dados pessoais: mantém-nas exactamente como estão. ' +
    'Não uses formatação Markdown com asteriscos nem cardinais; usa parágrafos curtos e, quando útil, linhas iniciadas por «•».';
  var SIS_PERGUNTA =
    'És o Assessor Documental, um assistente jurídico ao serviço de juristas e advogados em Portugal. Respondes sempre em português europeu, com base nos excertos de documentos fornecidos, numerados [1], [2] e seguintes.\n' +
    'Regras:\n' +
    '1. Fundamenta cada afirmação sobre o conteúdo dos documentos nos excertos e cita o número do excerto entre parênteses rectos, por exemplo [3]. Não atribuas aos documentos o que deles não consta.\n' +
    '2. Se a resposta não constar dos excertos, di-lo claramente e indica que elementos seriam necessários. Não cites legislação, artigos, prazos legais nem jurisprudência que não constem dos excertos: se outra legislação puder ser relevante, limita-te a recomendar que seja verificada, sem afirmar o seu conteúdo.\n' +
    '3. Quando o utilizador descreve o caso de um cliente, aplica as disposições dos excertos aos factos descritos: identifica os requisitos ou pressupostos, verifica se cada um está preenchido pelos factos, conclui com «Em princípio, aplica-se», «Em princípio, não se aplica» ou «Depende de…», e indica os factos que falta apurar.\n' +
    '4. Não prestes aconselhamento definitivo; quando aplicável, termina com os pontos a verificar.\n' +
    '5. ' + REGRAS_COMUNS;
  var SIS_RESUMO =
    'És o Assessor Documental, um assistente jurídico ao serviço de juristas e advogados em Portugal. Escreves sempre em português europeu. Resume o documento fornecido, sem acrescentar nada que dele não conste. ' +
    'Organiza o resumo nestas partes, omitindo as que não se apliquem: Natureza do documento; Partes ou entidades; Objecto; Disposições ou factos principais; Prazos, datas e valores; Pontos de atenção. ' +
    'Indica, sempre que possível, a página entre parênteses, por exemplo (p. 4). ' + REGRAS_COMUNS;

  function compor(pergunta, esc) {
    var l = ['PERGUNTA OU CASO: ' + pergunta];
    var hist = st.actual.conversa.filter(function (m) { return m.tipo === 'pergunta' || m.tipo === 'resposta'; }).slice(-4);
    if (hist.length) {
      l.push('', 'Conversa anterior (apenas para contexto):');
      hist.forEach(function (m) { l.push((m.tipo === 'pergunta' ? 'Pergunta: ' : 'Resposta: ') + String(m.texto).slice(0, 1500)); });
    }
    l.push('', 'EXCERTOS DOS DOCUMENTOS' + (esc.todos ? ' (texto integral dos documentos seleccionados)' : ' (os mais relevantes para a pergunta)') + ':');
    esc.lista.forEach(function (e, i) {
      l.push('', '[' + (i + 1) + '] ' + e.doc.nome + (e.pagina ? ', página ' + e.pagina : ''), juntarLinhas(e.texto));
    });
    return l.join('\n');
  }
  function ocupar(on, btn, rotulo) { st.ocupado = on; C.busy(btn, on, rotulo); }
  function perguntar() {
    if (!C.licenciado() || st.ocupado) return;
    var p = $('instrucao').value.trim();
    if (!p) { C.setStatus('assistStatus', 'Escreva a pergunta ou escolha uma sugestão.', 'err'); return; }
    if (!st.actual.docs.some(function (d) { return d.incluir; })) { C.setStatus('assistStatus', 'Acrescente e seleccione pelo menos um documento.', 'err'); return; }
    var btn = $('btnPerguntar'); ocupar(true, btn, 'A preparar…');
    var esc = escolher(p);
    C.setStatus('assistStatus', C.plural(esc.lista.length, 'excerto escolhido', 'excertos escolhidos') + ' neste aparelho. A aguardar o serviço de IA…', 'busy');
    var d = st.actual, mensagem = compor(p, esc);
    d.conversa.push({ tipo: 'pergunta', texto: p, data: Date.now() });
    mostrarConversa();
    pedir(SIS_PERGUNTA, mensagem, 5000, [p].concat(esc.lista.map(function (e) { return e.texto; }))).then(function (r) {
      var fontes = esc.lista.map(function (e) { return { nome: e.doc.nome, pagina: e.pagina, texto: e.texto.slice(0, 1200) }; });
      d.conversa.push({ tipo: 'resposta', texto: limparMd(r.texto).replace(/\*\*(.+?)\*\*/g, '$1'), fontes: fontes, protegidos: r.n, data: Date.now() });
      $('instrucao').value = '';
      C.setStatus('assistStatus', '');
      return guardar(d);
    }).catch(function (e) {
      d.conversa.pop();
      C.setStatus('assistStatus', e.message || C.errMsg(e), 'err');
    }).then(function () { ocupar(false, btn); mostrarConversa(); });
  }
  function partesTexto(t, n) {
    var out = [], i = 0;
    while (i < t.length) {
      var fim = Math.min(t.length, i + n);
      if (fim < t.length) { var q = t.lastIndexOf('\n', fim); if (q > i + n * 0.6) fim = q; }
      out.push(t.slice(i, fim)); i = fim;
    }
    return out;
  }
  function textoComPaginas(doc) {
    return doc.paginas.map(function (p, i) { return doc.tipo === 'pdf' ? '[p. ' + (i + 1) + ']\n' + p : p; }).join('\n\n');
  }
  function resumirDocumento(doc) {
    if (!C.licenciado() || st.ocupado) return;
    if (doc.semTexto) { C.setStatus('assistStatus', '«' + doc.nome + '» não tem texto legível (provavelmente digitalizado).', 'err'); return; }
    var btn = $('btnPerguntar'); ocupar(true, btn, 'A resumir…');
    var partes = partesTexto(juntarLinhas(textoComPaginas(doc)), PARTE_RESUMO), parciais = [], i = 0;
    var d = st.actual;
    d.conversa.push({ tipo: 'pergunta', texto: 'Resumir «' + doc.nome + '»', data: Date.now() });
    mostrarConversa();
    function proxima() {
      if (i >= partes.length) return Promise.resolve();
      C.setStatus('assistStatus', partes.length > 1 ? 'A resumir a parte ' + (i + 1) + ' de ' + partes.length + '…' : 'A resumir…', 'busy');
      var msg = 'DOCUMENTO: ' + doc.nome + (partes.length > 1 ? ' (parte ' + (i + 1) + ' de ' + partes.length + ')' : '') + '\n\n' + partes[i];
      return pedir(SIS_RESUMO, msg, 3500, [textoComPaginas(doc)]).then(function (r) { parciais.push(r.texto); i++; return proxima(); });
    }
    proxima().then(function () {
      if (parciais.length === 1) return parciais[0];
      C.setStatus('assistStatus', 'A juntar os resumos parciais…', 'busy');
      return pedir(SIS_RESUMO + ' Recebes resumos parciais de partes sucessivas do mesmo documento: junta-os num único resumo, sem repetições.',
        'DOCUMENTO: ' + doc.nome + '\n\n' + parciais.map(function (t, k) { return 'RESUMO DA PARTE ' + (k + 1) + ':\n' + t; }).join('\n\n'), 4000, [textoComPaginas(doc)]).then(function (r) { return r.texto; });
    }).then(function (texto) {
      d.conversa.push({ tipo: 'resposta', texto: limparMd(texto).replace(/\*\*(.+?)\*\*/g, '$1'), fontes: [], resumoDe: doc.nome, data: Date.now() });
      C.setStatus('assistStatus', '');
      return guardar(d);
    }).catch(function (e) {
      d.conversa.pop();
      C.setStatus('assistStatus', e.message || C.errMsg(e), 'err');
    }).then(function () { ocupar(false, btn); mostrarConversa(); });
  }

  /* ============================================================ notas do dossiê */
  var NOTAS = {
    enquadramento: { titulo: 'Nota de enquadramento', maxT: 4000,
      sis: 'Elabora uma nota de enquadramento do dossiê, destinada ao jurista que vai trabalhar o caso, com base exclusiva nos documentos fornecidos. ' +
        'Organiza-a nestas partes, omitindo as que não se apliquem: Objecto e contexto; Partes e intervenientes; Factos e disposições principais; Questões jurídicas que se colocam; Pontos de atenção e elementos em falta. ' +
        'Em cada afirmação, indica entre parênteses o documento e, quando exista, a página, por exemplo (contrato.docx) ou (peticao.pdf, p. 3).' },
    faq: { titulo: 'Perguntas frequentes', maxT: 4500,
      sis: 'Elabora entre dez e quinze perguntas frequentes sobre o dossiê, isto é, as perguntas que um jurista, o cliente ou a parte contrária colocariam sobre os documentos, cada uma seguida de uma resposta breve com base exclusiva nos documentos fornecidos. ' +
        'Usa o formato: «P: pergunta» numa linha e «R: resposta (documento, p. N)» na linha seguinte, com uma linha em branco entre pares. Se a resposta não constar dos documentos, di-lo.' },
    cronologia: { titulo: 'Cronologia', maxT: 4500,
      sis: 'Elabora a cronologia do dossiê com base exclusiva nos documentos fornecidos: todos os factos, actos, comunicações, prazos e vencimentos datados, por ordem cronológica, cada um numa linha no formato «• data: facto (documento, p. N)». ' +
        'Quando a data for apenas aproximada ou resultar de cálculo a partir dos documentos, assinala-o. Termina com uma parte «Intervenientes», com cada pessoa ou entidade e o seu papel, e uma parte «Datas a confirmar», se as houver. Não calcules prazos legais.' },
    estudo: { titulo: 'Guia de estudo', maxT: 4500,
      sis: 'Elabora um guia de estudo do dossiê, com base exclusiva nos documentos fornecidos, com estas partes: Questionário, com oito a dez perguntas de resposta curta; Respostas ao questionário, com a indicação do documento e da página; Glossário dos termos e conceitos jurídicos usados nos documentos, explicados como neles são usados; Temas para desenvolvimento, com três a cinco questões de reflexão sobre o caso.' }
  };
  function gerarNota(tipo) {
    var N = NOTAS[tipo]; if (!N || !C.licenciado() || st.ocupado) return;
    var docs = st.actual.docs.filter(function (x) { return x.incluir && !x.semTexto; });
    if (!docs.length) { C.setStatus('assistStatus', 'Acrescente e seleccione pelo menos um documento com texto.', 'err'); return; }
    var sis = 'És o Assessor Documental, um assistente jurídico ao serviço de juristas e advogados em Portugal. Escreves sempre em português europeu. ' + N.sis +
      ' Não atribuas aos documentos o que deles não consta e não cites legislação nem jurisprudência que neles não esteja referida. ' + REGRAS_COMUNS;
    var integral = docs.map(function (doc) { return '=== DOCUMENTO: ' + doc.nome + ' ===\n' + juntarLinhas(textoComPaginas(doc)); }).join('\n\n');
    var brutos = docs.map(textoComPaginas);
    var partes = partesTexto(integral, PARTE_RESUMO), parciais = [], i = 0, d = st.actual;
    var btn = $('btnPerguntar'); ocupar(true, btn, 'A preparar…');
    document.querySelectorAll('[data-nota]').forEach(function (b) { b.disabled = true; });
    var rotulo = N.titulo + ' do dossiê (' + C.plural(docs.length, 'documento', 'documentos') + ')';
    d.conversa.push({ tipo: 'pergunta', texto: rotulo, data: Date.now() });
    mostrarConversa();
    function proxima() {
      if (i >= partes.length) return Promise.resolve();
      C.setStatus('assistStatus', partes.length > 1 ? 'A analisar a parte ' + (i + 1) + ' de ' + partes.length + '…' : 'A aguardar o serviço de IA…', 'busy');
      var msg = 'DOCUMENTOS DO DOSSIÊ' + (partes.length > 1 ? ' (parte ' + (i + 1) + ' de ' + partes.length + ')' : '') + ':\n\n' + partes[i];
      return pedir(sis, msg, N.maxT, brutos).then(function (r) { parciais.push(r.texto); i++; return proxima(); });
    }
    proxima().then(function () {
      if (parciais.length === 1) return parciais[0];
      C.setStatus('assistStatus', 'A juntar as partes…', 'busy');
      return pedir(sis + ' Recebes versões parciais, elaboradas sobre partes sucessivas dos documentos: junta-as num único texto, sem repetições e com a mesma estrutura.',
        parciais.map(function (t, k) { return 'VERSÃO PARCIAL ' + (k + 1) + ':\n' + t; }).join('\n\n'), N.maxT, brutos).then(function (r) { return r.texto; });
    }).then(function (texto) {
      var t = limparMd(texto).replace(/\*\*(.+?)\*\*/g, '$1').split('\n');
      if (t.length > 1 && normal(t[0]).replace(/[^a-z ]/g, '').trim().indexOf(normal(N.titulo)) === 0 && t[0].length < N.titulo.length + 25) t.shift();
      d.conversa.push({ tipo: 'resposta', texto: t.join('\n').trim(), fontes: [], titulo: N.titulo, data: Date.now() });
      C.setStatus('assistStatus', '');
      return guardar(d);
    }).catch(function (e) {
      d.conversa.pop();
      C.setStatus('assistStatus', e.message || C.errMsg(e), 'err');
    }).then(function () {
      ocupar(false, btn); mostrarConversa();
      document.querySelectorAll('[data-nota]').forEach(function (b) { b.disabled = false; });
    });
  }

  /* ============================================================ conversa */
  function limparMd(t) {
    return String(t).replace(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/gm, '').replace(/^\s*#{1,6}\s*/gm, '').replace(/^\s*>\s?/gm, '').replace(/^\s*[-*]\s+/gm, '• ').replace(/\n{3,}/g, '\n\n').trim();
  }
  function formatar(t, nFontes) {
    var h = C.esc(limparMd(t)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    h = h.replace(/\[(\d{1,3})\]/g, function (m, n) { return +n >= 1 && +n <= nFontes ? '<button class="cit" data-n="' + n + '">' + n + '</button>' : m; });
    h = h.replace(/(^|\n)(P: [^\n]+)/g, '$1<b>$2</b>');
    return h.split(/\n{2,}/).map(function (p) { return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; }).join('');
  }
  function mostrarConversa() {
    var box = $('conversa'); box.innerHTML = '';
    var c = st.actual ? st.actual.conversa : [];
    if (!c.length) {
      box.innerHTML = '<div class="vazio"><p><b>Acrescente os documentos e pergunte.</b></p><p>Por exemplo: «Tenho um cliente arrendatário há 12 anos a quem o senhorio quer opor-se à renovação. Esta norma aplica-se ao caso dele?»</p></div>';
      return;
    }
    c.forEach(function (m) {
      var el = document.createElement('div'); el.className = 'msg ' + m.tipo;
      if (m.tipo === 'pergunta') { el.textContent = m.texto; box.appendChild(el); return; }
      var fontes = m.fontes || [];
      el.innerHTML = (m.resumoDe ? '<div class="msg-t">Resumo de «' + C.esc(m.resumoDe) + '»</div>' : m.titulo ? '<div class="msg-t">' + C.esc(m.titulo) + '</div>' : '') + '<div class="msg-c">' + formatar(m.texto, fontes.length) + '</div>' +
        (fontes.length ? '<details class="fontes"><summary>' + C.plural(fontes.length, 'excerto consultado', 'excertos consultados') + '</summary>' +
          fontes.map(function (f, i) { return '<div class="fonte" data-n="' + (i + 1) + '"><b>[' + (i + 1) + '] ' + C.esc(f.nome) + (f.pagina ? ', p. ' + f.pagina : '') + '</b><p>' + C.esc(f.texto) + '</p></div>'; }).join('') + '</details>' : '') +
        '<div class="msg-acoes"><button class="link-btn copiar">Copiar</button><button class="link-btn docx">Descarregar (.docx)</button></div>';
      el.querySelectorAll('.cit').forEach(function (b) {
        b.addEventListener('click', function () {
          var det = el.querySelector('.fontes'); if (!det) return; det.open = true;
          var f = det.querySelector('.fonte[data-n="' + b.dataset.n + '"]');
          if (f) { f.classList.add('realce'); f.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(function () { f.classList.remove('realce'); }, 1600); }
        });
      });
      el.querySelector('.copiar').addEventListener('click', function (ev) {
        var t = m.texto; var feito = function () { ev.target.textContent = 'Copiado'; };
        if (navigator.clipboard) navigator.clipboard.writeText(t).then(feito).catch(function () {});
      });
      el.querySelector('.docx').addEventListener('click', function () { descarregar(m); });
      box.appendChild(el);
    });
    box.scrollTop = box.scrollHeight;
  }
  function descarregar(m) {
    var idx = st.actual.conversa.indexOf(m), perg = idx > 0 ? st.actual.conversa[idx - 1] : null;
    var paras = [{ text: 'Assessor Documental: ' + st.actual.nome, bold: true, size: 14 }];
    if (perg) { paras.push({ text: 'Pergunta', bold: true, size: 11 }); perg.texto.split('\n').forEach(function (l) { paras.push({ text: l, size: 11 }); }); }
    paras.push({ text: m.resumoDe ? 'Resumo de «' + m.resumoDe + '»' : m.titulo || 'Resposta', bold: true, size: 11 });
    m.texto.split('\n').forEach(function (l) { paras.push({ text: l, size: 11 }); });
    if (m.fontes && m.fontes.length) {
      paras.push({ text: 'Excertos consultados', bold: true, size: 11 });
      m.fontes.forEach(function (f, i) { paras.push({ text: '[' + (i + 1) + '] ' + f.nome + (f.pagina ? ', p. ' + f.pagina : ''), bold: true, size: 10 }); paras.push({ text: f.texto, size: 10 }); });
    }
    paras.push({ text: 'Documento gerado com o Assessor Documental. As respostas devem ser verificadas nos documentos de origem. Ana Marta Soares, Especialista em IA aplicada ao Direito.', size: 9 });
    var bytes = window.DocxUtil.buildDocx(paras);
    C.descarregar('assessor-documental.docx', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  }

  window.__documental = { st: st, NOTAS: NOTAS, escolher: escolher, termos: termos };
  boot();
})();
