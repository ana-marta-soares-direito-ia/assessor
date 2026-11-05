/*
 * Assessor para Gmail: script da página do Gmail.
 * Lê a conversa aberta ou o rascunho em escrita e coloca o texto aprovado pelo utilizador no rascunho.
 * Não envia nada para fora do computador: apenas responde ao painel lateral do Cofre.
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 */
'use strict';
(function () {
  if (window.__cofreGmail) return;
  window.__cofreGmail = true;

  var EDITAVEL = 'div[contenteditable="true"][role="textbox"], div[contenteditable="true"][g_editable="true"], div.editable[contenteditable="true"]';
  var ultimoRascunho = null, nos = null;

  function visivel(el) { return !!(el && el.isConnected && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)); }
  function texto(el) { return el ? (el.innerText || el.textContent || '').replace(/ /g, ' ').trim() : ''; }
  document.addEventListener('focusin', function (e) {
    var ed = e.target && e.target.closest && e.target.closest(EDITAVEL);
    if (ed) ultimoRascunho = ed;
  }, true);

  function rascunhos() { return Array.prototype.filter.call(document.querySelectorAll(EDITAVEL), visivel); }
  function rascunhoActivo() {
    if (ultimoRascunho && visivel(ultimoRascunho)) return ultimoRascunho;
    var l = rascunhos(); return l.length ? l[l.length - 1] : null;
  }
  function raiz(ed) {
    var r = ed.closest('.M9, .ip, .aoI, [role="dialog"], form');
    var p = ed; for (var i = 0; i < 14 && p.parentElement; i++) { p = p.parentElement; if (p.querySelector('input[name="subjectbox"]')) return p; }
    return r || ed.parentElement;
  }
  function conversaAberta() {
    var h = document.querySelector('h2.hP');
    return visivel(h) ? h : null;
  }
  function estado() {
    if (ultimoRascunho && visivel(ultimoRascunho)) return 'composicao';
    if (conversaAberta()) return 'leitura';
    if (rascunhos().length) return 'composicao';
    return null;
  }
  function pessoa(el) {
    if (!el) return '';
    var e = el.getAttribute('email') || el.getAttribute('data-hovercard-id') || '';
    var n = el.getAttribute('name') || texto(el);
    return n && e && n !== e ? n + ' <' + e + '>' : (e || n);
  }
  function unicos(l) { var v = {}; return l.filter(function (x) { if (!x || v[x]) return false; v[x] = 1; return true; }); }

  function lerConversa() {
    var h = conversaAberta();
    if (!h) throw new Error('Abra uma conversa no Gmail.');
    var main = h.closest('[role="main"]') || document;
    var msgs = Array.prototype.filter.call(main.querySelectorAll('div.adn'), function (m) { return m.querySelector('div.a3s'); });
    var partes = [], ultimo = null;
    msgs.forEach(function (m) {
      var de = pessoa(m.querySelector('span.gD'));
      var dt = m.querySelector('span.g3');
      var data = dt ? (dt.getAttribute('title') || texto(dt)) : '';
      var corpo = Array.prototype.map.call(m.querySelectorAll('div.a3s'), texto).join('\n');
      partes.push({ de: de, data: data, corpo: corpo });
      ultimo = m;
    });
    if (!partes.length) throw new Error('Expanda a mensagem a analisar e tente de novo.');
    var u = partes[partes.length - 1];
    var para = ultimo ? unicos(Array.prototype.map.call(ultimo.querySelectorAll('span.g2'), pessoa)) : [];
    var anexos = [], vistos = {};
    Array.prototype.forEach.call(main.querySelectorAll('[download_url]'), function (el) {
      var d = el.getAttribute('download_url') || '', i1 = d.indexOf(':'), i2 = d.indexOf(':', i1 + 1);
      if (i1 < 0 || i2 < 0) return;
      var url = d.slice(i2 + 1), nome = d.slice(i1 + 1, i2);
      if (vistos[url]) return; vistos[url] = 1;
      anexos.push({ id: url, nome: nome, tipo: d.slice(0, i1), tamanho: 0 });
    });
    Array.prototype.forEach.call(main.querySelectorAll('span.aV3'), function (el) {
      var n = texto(el); if (n && !anexos.some(function (a) { return a.nome === n; })) anexos.push({ id: null, nome: n, tipo: '', tamanho: 0 });
    });
    var corpo = partes.length === 1 ? u.corpo : partes.map(function (p, i) {
      return '--- Mensagem ' + (i + 1) + ' de ' + partes.length + (p.de ? ', de ' + p.de : '') + (p.data ? ', ' + p.data : '') + ' ---\n' + p.corpo;
    }).join('\n\n');
    return { assunto: texto(h), de: u.de, para: para, cc: [], data: u.data, anexos: anexos, corpo: corpo };
  }
  function lerRascunho() {
    var ed = rascunhoActivo();
    if (!ed) throw new Error('Abra o rascunho no Gmail.');
    var r = raiz(ed);
    var s = r.querySelector('input[name="subjectbox"]');
    var dest = unicos(Array.prototype.map.call(r.querySelectorAll('[email], [data-hovercard-id*="@"]'), function (el) {
      var e = el.getAttribute('email') || el.getAttribute('data-hovercard-id'); return /@/.test(e || '') ? e : '';
    }));
    var anexos = unicos(Array.prototype.map.call(r.querySelectorAll('.vI'), texto)).map(function (n) { return { id: null, nome: n, tipo: '', tamanho: 0 }; });
    var sel = window.getSelection(), seleccao = '';
    if (sel && sel.rangeCount && !sel.isCollapsed && ed.contains(sel.anchorNode)) seleccao = String(sel).trim();
    var assunto = s && s.value ? s.value : (conversaAberta() ? texto(conversaAberta()) : '');
    return { assunto: assunto, para: dest, cc: [], anexos: anexos, seleccao: seleccao, corpo: texto(ed) };
  }

  function inserirEm(ed, t) {
    ed.focus();
    var sel = window.getSelection();
    if (!(sel && sel.rangeCount && !sel.isCollapsed && ed.contains(sel.anchorNode))) {
      var rg = document.createRange(); rg.setStart(ed, 0); rg.collapse(true);
      sel.removeAllRanges(); sel.addRange(rg);
      if (texto(ed)) t = t + '\n\n';
    }
    var ok = false;
    try { ok = document.execCommand('insertText', false, t); } catch (e) { ok = false; }
    if (!ok) {
      var r = sel.getRangeAt(0); r.deleteContents();
      var frag = document.createDocumentFragment();
      t.split('\n').forEach(function (l, i) { if (i) frag.appendChild(document.createElement('br')); frag.appendChild(document.createTextNode(l)); });
      r.insertNode(frag);
      ed.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
    ultimoRascunho = ed;
  }
  function esperar(fn, ms) {
    return new Promise(function (res, rej) {
      var t0 = Date.now();
      (function v() { var x = fn(); if (x) return res(x); if (Date.now() - t0 > ms) return rej(new Error('O Gmail não abriu a resposta.')); setTimeout(v, 120); })();
    });
  }
  function botaoResposta(todos) {
    var rot = todos ? ['Responder a todos', 'Reply all', 'Responder a todos os destinatários'] : ['Responder', 'Reply'];
    var sel = rot.map(function (r) { return '[role="button"][aria-label="' + r + '"], [role="button"][data-tooltip="' + r + '"]'; }).join(', ');
    var l = Array.prototype.filter.call(document.querySelectorAll(sel), visivel);
    if (!l.length) l = Array.prototype.filter.call(document.querySelectorAll(todos ? 'span.ams.bkI' : 'span.ams.bkH'), visivel);
    return l.length ? l[l.length - 1] : null;
  }
  function responder(t, todos) {
    if (!conversaAberta()) throw new Error('Abra a conversa a que pretende responder.');
    var antes = rascunhos();
    var b = botaoResposta(todos);
    if (!b) throw new Error('Não foi encontrado o botão «Responder» do Gmail.');
    b.click();
    return esperar(function () { var l = rascunhos().filter(function (e) { return antes.indexOf(e) < 0; }); return l[0] || null; }, 5000)
      .then(function (ed) { inserirEm(ed, t); return 'Foi aberta a resposta com o texto. Reveja-a antes de enviar.'; });
  }

  function paraBase64(buf) {
    var u = new Uint8Array(buf), s = '';
    for (var i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
    return btoa(s);
  }
  function anexo(url) {
    if (!/^https:\/\/mail\.google\.com\//.test(url)) throw new Error('endereço de anexo inválido');
    return fetch(url, { credentials: 'include' }).then(function (r) {
      if (!r.ok) throw new Error('o Gmail recusou o anexo (' + r.status + ')');
      return r.arrayBuffer();
    }).then(function (b) {
      if (b.byteLength > 15 * 1048576) throw new Error('anexo com mais de 15 MB');
      return paraBase64(b);
    });
  }
  var SALTAR = { SCRIPT: 1, STYLE: 1 };
  function lerNos() {
    var ed = rascunhoActivo();
    if (!ed) throw new Error('Abra o rascunho no Gmail.');
    var s = raiz(ed).querySelector('input[name="subjectbox"]');
    var w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { return n.nodeValue.trim() && !SALTAR[n.parentNode.nodeName] ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } });
    var l = [], n; while ((n = w.nextNode())) l.push(n);
    nos = { ed: ed, assunto: s, l: l };
    return [s ? s.value : ''].concat(l.map(function (x) { return x.nodeValue; }));
  }
  function escreverNos(novos) {
    if (!nos || !nos.ed.isConnected) throw new Error('O rascunho mudou. Verifique-o de novo.');
    if (nos.assunto && typeof novos[0] === 'string' && novos[0] !== nos.assunto.value) {
      nos.assunto.value = novos[0];
      nos.assunto.dispatchEvent(new Event('input', { bubbles: true }));
      nos.assunto.dispatchEvent(new Event('change', { bubbles: true }));
    }
    nos.l.forEach(function (x, i) { if (typeof novos[i + 1] === 'string' && x.nodeValue !== novos[i + 1]) x.nodeValue = novos[i + 1]; });
    nos.ed.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return true;
  }

  var H = {
    estado: function () { return estado(); },
    ler: function () { var e = estado(); if (!e) throw new Error('Abra uma conversa ou um rascunho no Gmail.'); return e === 'composicao' ? lerRascunho() : lerConversa(); },
    inserir: function (m) {
      var ed = rascunhoActivo(); if (!ed) throw new Error('Abra o rascunho em que pretende inserir o texto.');
      var s = raiz(ed).querySelector('input[name="subjectbox"]');
      if (m.assunto && s && !s.value.trim() && s.type !== 'hidden') { s.value = m.assunto; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }
      inserirEm(ed, m.texto); return 'Texto inserido no rascunho. Reveja-o antes de enviar.';
    },
    anexo: function (m) { return anexo(m.url); },
    responder: function (m) { return responder(m.texto, m.todos); },
    lerNos: function () { return lerNos(); },
    escreverNos: function (m) { return escreverNos(m.novos); }
  };
  chrome.runtime.onMessage.addListener(function (m, s, responderAo) {
    if (!m || !H[m.tipo]) return;
    Promise.resolve().then(function () { return H[m.tipo](m); })
      .then(function (v) { responderAo({ ok: true, v: v }); }, function (e) { responderAo({ ok: false, erro: (e && e.message) || String(e) }); });
    return true;
  });

  // Avisa o painel quando o utilizador muda de conversa
  var ultimoEndereco = location.href;
  setInterval(function () {
    if (location.href !== ultimoEndereco) {
      ultimoEndereco = location.href; nos = null;
      try { chrome.runtime.sendMessage({ tipo: 'mudou' }).catch(function () {}); } catch (e) { /* extensão recarregada */ }
    }
  }, 700);

  // Botão discreto para abrir o painel a partir do Gmail
  function botao() {
    if (document.getElementById('cofre-gmail-botao')) return;
    var b = document.createElement('button');
    b.id = 'cofre-gmail-botao'; b.type = 'button'; b.title = 'Abrir o Assessor para Gmail';
    b.textContent = 'Assessor';
    b.setAttribute('style', 'position:fixed;right:0;top:46%;z-index:2147483000;font:600 12px/1 system-ui,-apple-system,Segoe UI,sans-serif;background:#1e1a18;color:#f4efe6;border:0;border-radius:0 10px 10px 0;padding:14px 8px;writing-mode:vertical-rl;transform:rotate(180deg);box-shadow:0 4px 14px rgba(30,26,24,.25);cursor:pointer;letter-spacing:.04em');
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', function () { try { chrome.runtime.sendMessage({ tipo: 'abrir' }); } catch (e) { /* extensão recarregada */ } });
    document.body.appendChild(b);
  }
  if (document.body) botao(); else document.addEventListener('DOMContentLoaded', botao);
})();
