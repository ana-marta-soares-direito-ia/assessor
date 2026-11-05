/*
 * Assistente de correio electrónico (Outlook e Gmail): painel comum.
 * Analisa e resume mensagens e anexos, identifica pedidos e prazos, prepara respostas e novos e-mails
 * e melhora o texto em escrita. Os dados pessoais são substituídos por etiquetas antes do envio à IA
 * da conta Cloudflare do utilizador e repostos no computador quando a resposta chega.
 * O acesso ao programa de correio é feito por um adaptador: window.CorreioHost.
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 */
'use strict';
(function () {
  var C = window.Cofre, E = window.AnonEngine, A = window.Anexos, $ = C.$;
  var H = window.CorreioHost;
  var st = { modo: null, msg: null, ultimo: null, anexosLidos: {} };
  var MAX_ANEXO = 30000, MAX_ANEXOS = 60000, MAX_CORPO = 40000, MAX_MB = 15;

  /* ============================================================ arranque */
  function boot() {
    if (!window.__cofreSuportado || !E || !C || !H || !A) { $('unsupported').hidden = false; return; }
    C.iniciar({ produto: H.produto, nome: H.titulo, revogadas: 'https://ana-marta-soares-direito-ia.github.io/assessor/revogadas.json' });
    bind();
    H.iniciar().then(function (ok) {
      if (!ok) { $('outside').hidden = false; return; }
      actualizarContexto();
      H.onMudanca(function () { st.ultimo = null; st.anexosLidos = {}; $('resultadoCard').hidden = true; actualizarContexto(); });
    }).catch(function () { $('outside').hidden = false; });
  }
  function bind() {
    $('btnExecutar').addEventListener('click', executar);
    $('instrucao').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) executar(); });
    $('btnActualizar').addEventListener('click', actualizarContexto);
    $('btnResponder').addEventListener('click', function () { usarRascunho('responder'); });
    $('btnResponderTodos').addEventListener('click', function () { usarRascunho('todos'); });
    $('btnInserir').addEventListener('click', function () { usarRascunho('inserir'); });
    $('btnCopiar').addEventListener('click', function () { copiar($('rascunhoCorpo').value, 'rascunhoStatus', 'Texto copiado.'); });
  }

  /* ============================================================ contexto */
  function tamanho(b) { return !b ? '' : b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function mostrarAnexos(lista) {
    var box = $('anexosLista'); box.innerHTML = '';
    var l = lista || [];
    $('anexosBloco').hidden = !l.length;
    l.forEach(function (a, i) {
      var ok = !!a.id && A.legivel(a.nome, a.tipo) && (!a.tamanho || a.tamanho <= MAX_MB * 1048576);
      var lab = document.createElement('label'); lab.className = 'check anexo' + (ok ? '' : ' off');
      lab.innerHTML = '<input type="checkbox" data-i="' + i + '"' + (ok ? (i < 6 ? ' checked' : '') : ' disabled') + '><span>' + C.esc(a.nome) +
        '<small>' + C.esc([tamanho(a.tamanho), ok ? '' : (!a.id ? 'não disponível para leitura' : 'formato não lido')].filter(Boolean).join(' · ')) + '</small></span>';
      box.appendChild(lab);
    });
  }
  function actualizarContexto() {
    return H.modo().then(function (m) {
      st.modo = m;
      document.body.dataset.modo = m || 'nenhum';
      var leitura = m === 'leitura', comp = m === 'composicao';
      $('semMensagem').hidden = !!m;
      $('contexto').hidden = !m;
      $('sugLeitura').hidden = !leitura; $('sugComposicao').hidden = !comp;
      $('btnResponder').hidden = !leitura; $('btnResponderTodos').hidden = !leitura; $('btnInserir').hidden = !comp; $('notaInserir').hidden = !comp;
      $('modoTexto').textContent = leitura ? 'Mensagem aberta' : comp ? 'Rascunho em escrita' : '';
      $('instrucao').placeholder = comp
        ? 'Por exemplo: escreve um e-mail ao cliente a marcar reunião para a próxima semana; ou melhora o meu texto.'
        : 'Por exemplo: resume a mensagem e o contrato anexo e prepara uma resposta a confirmar a reunião.';
      if (!m) { mostrarAnexos([]); return; }
      return H.lerMensagem().then(function (msg) {
        st.msg = msg;
        $('ctxAssunto').textContent = msg.assunto || '(sem assunto)';
        $('ctxDe').textContent = leitura ? (msg.de || '') : (msg.para && msg.para.length ? 'Para: ' + msg.para.join(', ') : 'Sem destinatários');
        mostrarAnexos(msg.anexos);
      });
    }).catch(function (e) { C.setStatus('assistStatus', e.message || C.errMsg(e), 'err'); });
  }

  /* ============================================================ anexos */
  function lerAnexosSeleccionados(msg) {
    var sel = Array.prototype.filter.call(document.querySelectorAll('#anexosLista input:checked'), function (c) { return !c.disabled; })
      .map(function (c) { return (msg.anexos || [])[+c.dataset.i]; }).filter(Boolean);
    var out = [], i = 0;
    function proximo() {
      if (i >= sel.length) return Promise.resolve(out);
      var a = sel[i++], chave = a.id + '|' + a.nome;
      if (st.anexosLidos[chave] != null) { out.push({ nome: a.nome, texto: st.anexosLidos[chave] }); return proximo(); }
      C.setStatus('assistStatus', 'A ler o anexo «' + a.nome + '»…', 'busy');
      return H.obterAnexo(a).then(function (buf) { return A.extrair(a.nome, a.tipo, buf); })
        .then(function (t) { t = String(t || '').trim(); st.anexosLidos[chave] = t; out.push({ nome: a.nome, texto: t }); })
        .catch(function (e) { out.push({ nome: a.nome, texto: '[não foi possível ler este anexo: ' + ((e && e.message) || e) + ']', falhou: true }); })
        .then(proximo);
    }
    return proximo();
  }

  /* ============================================================ assistente */
  function sistema() {
    return 'És o assistente de correio electrónico de ' + H.nome + ' ao serviço de juristas, advogados, solicitadores, empresas e serviços públicos em Portugal. ' +
      'Recebes uma instrução do utilizador e uma mensagem de correio electrónico que ele recebeu, com o texto dos anexos quando existam, ou o rascunho que está a escrever.\n' +
      'Respondes SEMPRE e APENAS com um objecto JSON, sem texto antes ou depois, com esta forma:\n' +
      '{"resposta":"texto para o utilizador: o resumo, a análise, a resposta à pergunta ou uma frase a apresentar o rascunho",' +
      '"pontos":{"pedidos":["o que é pedido ao utilizador"],"prazos":[{"data":"data ou prazo, tal como resulta da mensagem ou dos anexos","descricao":"..."}],"atencao":["pontos jurídicos ou de risco a ponderar"],"prioridade":"alta|media|baixa"},' +
      '"anexos":[{"nome":"nome do ficheiro","resumo":"..."}],' +
      '"rascunho":{"assunto":"...","corpo":"..."}}\n' +
      'Regras:\n' +
      '1. Preenche "pontos" quando a instrução pede análise, resumo, prazos, tarefas ou pedidos; caso contrário, "pontos":null.\n' +
      '2. Preenche "anexos" quando há anexos e a instrução pede resumo ou análise: para cada anexo, um resumo de três a seis frases com o tipo de documento, as partes, as datas, os valores, as obrigações e os pedidos relevantes. Caso contrário, "anexos":null.\n' +
      '3. Preenche "rascunho" quando a instrução pede uma resposta, um e-mail novo, um texto ou a melhoria do rascunho; caso contrário, "rascunho":null. O corpo é texto simples, com os parágrafos separados por \\n, com saudação e fórmula de despedida adequadas, sem assinatura com nome (termina na fórmula de despedida). Ao melhorar um rascunho, devolve apenas o texto escrito pelo utilizador, melhorado, sem a mensagem citada. Na resposta, a saudação dirige-se ao remetente da mensagem recebida; não repitas o tratamento que o remetente usou para o utilizador.\n' +
      '4. Escreve em português europeu, com a grafia anterior ao Acordo Ortográfico de 1990, em registo profissional e jurídico, sem travessões. Se a mensagem recebida estiver noutra língua, o rascunho é escrito nessa língua, salvo instrução em contrário; a "resposta" e os resumos são sempre em português.\n' +
      '5. As etiquetas como [PESSOA_1], [EMAIL_1] ou [NIF_1] substituem dados pessoais: mantém-nas exactamente como estão, sem as explicar nem alterar.\n' +
      '6. Não inventes factos, datas, valores, documentos nem compromissos que não constem da mensagem, dos anexos ou da instrução. Quando faltar informação para o rascunho, escreve [a completar].\n' +
      '7. Nos prazos, indica a data ou o prazo tal como resulta da mensagem ou dos anexos e não calcules datas que não seja possível determinar.\n' +
      '8. Não prestes aconselhamento definitivo: nos pontos de atenção, assinala o que deve ser verificado pelo utilizador.';
  }
  function cortar(t, n) { t = String(t || ''); return t.length > n ? t.slice(0, n) + '\n[…texto truncado…]' : t; }
  function compor(msg, instr, anexos) {
    var tom = $('tom').value;
    var l = ['INSTRUÇÃO: ' + instr];
    if (tom) l.push('TOM PRETENDIDO PARA O RASCUNHO: ' + tom);
    if (st.modo === 'composicao') {
      l.push('', 'RASCUNHO EM ESCRITA', 'Assunto: ' + (msg.assunto || ''), 'Para: ' + (msg.para || []).join(', '));
      if (msg.seleccao) l.push('TEXTO SELECCIONADO PELO UTILIZADOR (a instrução refere-se a este texto):', msg.seleccao, '');
      l.push('CORPO DO RASCUNHO (pode estar vazio, ou incluir no fim a mensagem citada a que se responde):', cortar(msg.corpo, MAX_CORPO) || '(vazio)');
    } else {
      l.push('', 'MENSAGEM RECEBIDA', 'Assunto: ' + (msg.assunto || ''), 'De: ' + (msg.de || ''), 'Para: ' + (msg.para || []).join(', '));
      if (msg.cc && msg.cc.length) l.push('Cc: ' + msg.cc.join(', '));
      if (msg.data) l.push('Data: ' + msg.data);
      if (msg.anexos && msg.anexos.length) l.push('Anexos: ' + msg.anexos.map(function (a) { return a.nome; }).join(', '));
      l.push('CORPO:', cortar(msg.corpo, MAX_CORPO));
    }
    if (anexos.length) {
      var cada = Math.max(4000, Math.min(MAX_ANEXO, Math.floor(MAX_ANEXOS / anexos.length)));
      anexos.forEach(function (a, i) { l.push('', 'ANEXO ' + (i + 1) + ': ' + a.nome, cortar(a.texto, cada)); });
    }
    return l.join('\n');
  }

  function executar() {
    if (!C.licenciado()) return;
    var instr = $('instrucao').value.trim();
    if (!instr) { C.setStatus('assistStatus', 'Escreva o que pretende ou escolha uma das sugestões.', 'err'); return; }
    if (!st.modo) { C.setStatus('assistStatus', 'Abra uma mensagem ou um rascunho e tente de novo.', 'err'); return; }
    var btn = $('btnExecutar'); C.busy(btn, true, 'A preparar…');
    C.setStatus('assistStatus', 'A ler ' + (st.modo === 'composicao' ? 'o rascunho' : 'a mensagem') + '…', 'busy');
    $('resultadoCard').hidden = true;
    var msg;
    H.lerMensagem().then(function (m) {
      msg = m; st.msg = m;
      return lerAnexosSeleccionados(m);
    }).then(function (anexos) {
      var texto = compor(msg, instr, anexos);
      var m = C.mascara([texto], $('optMascara').checked);
      C.setStatus('assistStatus', (anexos.length ? C.plural(anexos.length, 'anexo lido', 'anexos lidos') + '. ' : '') + (m.n ? C.plural(m.n, 'dado pessoal protegido', 'dados pessoais protegidos') + ' antes do envio. ' : '') + 'A aguardar o serviço de IA…', 'busy');
      return C.pedirIA({ sistema: sistema(), mensagem: m.tapar(texto), maxTokens: 6000, esforco: 'medio' }).then(function (t) {
        return C.destaparFundo(C.extrairJSON(t), m);
      });
    }).then(function (j) {
      st.ultimo = j;
      mostrarResultado(j);
      C.setStatus('assistStatus', '');
    }).catch(function (e) { C.setStatus('assistStatus', e.message || C.errMsg(e), 'err'); })
      .then(function () { C.busy(btn, false); });
  }
  function lista(titulo, itens) {
    if (!itens || !itens.length) return '';
    return '<h3>' + C.esc(titulo) + '</h3><ul class="plano">' + itens.map(function (x) { return '<li>' + C.esc(x) + '</li>'; }).join('') + '</ul>';
  }
  function mostrarResultado(j) {
    $('resposta').textContent = j.resposta || '';
    var p = j.pontos, h = '';
    if (p && typeof p === 'object') {
      var pr = String(p.prioridade || '').toLowerCase();
      if (pr) h += '<p class="prio prio-' + (pr.indexOf('alta') >= 0 ? 'alta' : pr.indexOf('baixa') >= 0 ? 'baixa' : 'media') + '">Prioridade ' + C.esc(pr.replace('media', 'média')) + '</p>';
      h += lista('Pedidos', p.pedidos);
      h += lista('Prazos', (p.prazos || []).map(function (x) { return typeof x === 'string' ? x : (x.data ? x.data + ': ' : '') + (x.descricao || ''); }));
      h += lista('Pontos de atenção', p.atencao);
    }
    if (Array.isArray(j.anexos) && j.anexos.length) {
      h += '<h3>Anexos</h3>' + j.anexos.map(function (a) { return '<div class="anexo-res"><b>' + C.esc(a.nome || 'Anexo') + '</b><p>' + C.esc(a.resumo || '') + '</p></div>'; }).join('');
    }
    $('pontos').innerHTML = h; $('pontos').hidden = !h;
    var r = j.rascunho && (j.rascunho.corpo || j.rascunho.assunto) ? j.rascunho : null;
    $('rascunhoBloco').hidden = !r;
    if (r) { $('rascunhoAssunto').value = r.assunto || ''; $('rascunhoCorpo').value = r.corpo || ''; }
    C.setStatus('rascunhoStatus', '');
    $('resultadoCard').hidden = false;
    $('resultadoCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function usarRascunho(como) {
    var corpo = $('rascunhoCorpo').value.trim(), assunto = $('rascunhoAssunto').value.trim();
    if (!corpo) { C.setStatus('rascunhoStatus', 'O rascunho está vazio.', 'err'); return; }
    var p = como === 'inserir' ? H.inserir(corpo, assunto) : H.responder(corpo, como === 'todos');
    C.setStatus('rascunhoStatus', 'A transferir o texto…', 'busy');
    p.then(function (msg) {
      C.setStatus('rascunhoStatus', msg || (como === 'inserir' ? 'Texto inserido no rascunho. Reveja-o antes de enviar.' : 'Foi aberta a resposta com o texto. Reveja-a antes de enviar.'), 'ok');
    }).catch(function (e) {
      copiar(corpo, null);
      C.setStatus('rascunhoStatus', (e && e.message ? e.message + ' ' : '') + 'O texto foi copiado: cole-o na resposta com Cmd+V ou Ctrl+V.', 'err');
    });
  }
  function copiar(texto, statusId, msgOk) {
    var feito = function () { if (statusId) C.setStatus(statusId, msgOk, 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto).then(feito).catch(function () { if (copiarAntigo(texto)) feito(); else if (statusId) C.setStatus(statusId, 'Seleccione o texto e copie-o manualmente.', 'err'); });
    }
    if (copiarAntigo(texto)) feito(); else if (statusId) C.setStatus(statusId, 'Seleccione o texto e copie-o manualmente.', 'err');
  }
  function copiarAntigo(texto) {
    var ta = document.createElement('textarea'); ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove(); return ok;
  }

  window.__cofreCorreio = { st: st, executar: executar };
  boot();
})();
