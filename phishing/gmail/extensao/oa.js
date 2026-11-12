/*
 * Alerta Phishing no webmail da Ordem dos Advogados (webmail.oa.pt).
 * Quando uma mensagem é aberta, pede ao webmail o original da mensagem (cabeçalhos incluídos), analisa-o no computador
 * e mostra o resultado por cima da mensagem. Se o original não estiver disponível, lê o que está no ecrã.
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 */
'use strict';
(function () {
  if (window.__alertaPhishingOA) return; window.__alertaPhishingOA = true;
  var estado = { codigo: '', confianca: [] }, feito = '', fontes = {};
  function texto(el) { return el ? (el.innerText || el.textContent || '').trim() : ''; }
  function licenciado() { return LicencaAP.verificar(estado.codigo).ok; }
  function q() { return new URLSearchParams(location.search); }
  function mensagemAberta() {
    var p = q(), accao = p.get('_action') || '';
    if (!/^(preview|show)$/.test(accao) || !p.get('_uid')) return null;
    return { uid: p.get('_uid'), mbox: p.get('_mbox') || 'INBOX' };
  }
  function obterOriginal(m) {
    var chave = m.mbox + '|' + m.uid;
    if (fontes[chave]) return fontes[chave];
    var url = location.origin + location.pathname + '?_task=mail&_action=viewsource&_uid=' + encodeURIComponent(m.uid) + '&_mbox=' + encodeURIComponent(m.mbox);
    fontes[chave] = fetch(url, { credentials: 'include' })
      .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
      .then(function (b) {
        if (!b) return null;
        var msg = EmlAP.ler(b);
        return msg.deEmail ? msg : null; // se o webmail devolveu uma página em vez da mensagem, não se usa
      })
      .catch(function () { return null; });
    return fontes[chave];
  }
  /** Leitura a partir do ecrã, quando o original não está disponível. */
  function lerEcra() {
    var a = document.querySelector('.header .from a[title*="@"], #message-header .from a[title*="@"], a.rcmContactAddress[title*="@"], a.rcmContactAddress[href^="mailto:"]');
    var email = a ? (a.getAttribute('title') || a.getAttribute('href') || '').replace(/^mailto:/i, '') : '';
    var nome = a ? texto(a) : '';
    if (nome && nome.indexOf('@') >= 0 && email && nome.toLowerCase() === email.toLowerCase()) nome = '';
    var corpo = document.querySelector('#messagebody') || document.querySelector('#message-content') || document.body;
    var ligs = [];
    Array.prototype.forEach.call(corpo.querySelectorAll('a[href]'), function (x) { ligs.push({ href: x.getAttribute('href'), texto: texto(x) }); });
    var anexos = [];
    Array.prototype.forEach.call(document.querySelectorAll('#attachment-list li a.filename .attachment-name, #attachment-list li a.filename, ul.attachmentslist li a'), function (x) { var n = texto(x); if (n && anexos.indexOf(n) < 0) anexos.push(n); });
    var assunto = texto(document.querySelector('h2.subject, .header .subject, #message-header .subject'));
    return { deNome: nome, deEmail: email, assunto: assunto.replace(/^(Assunto|Subject)\s*:?\s*/i, ''), texto: texto(corpo).slice(0, 20000), ligacoes: ligs, anexos: anexos };
  }
  function alvo() {
    var f = document.querySelector('.ap-oa');
    if (f) return f;
    f = document.createElement('div'); f.className = 'ap-oa';
    var corpo = document.querySelector('#messagebody');
    if (corpo && corpo.parentNode) corpo.parentNode.insertBefore(f, corpo);
    else { var c = document.querySelector('#message-content') || document.body; c.insertBefore(f, c.firstChild); }
    return f;
  }
  function confiar(email) {
    if (estado.confianca.indexOf(email) < 0) estado.confianca.push(email);
    try { chrome.storage.local.set({ confianca: estado.confianca }); } catch (e) {}
    verificar(true);
  }
  function mostrarPedido(f) {
    f.textContent = '';
    var p = document.createElement('div'); p.className = 'ap-pedir';
    var s = document.createElement('span'); s.textContent = 'Alerta Phishing: active a licença para analisar as mensagens.';
    var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Activar';
    b.addEventListener('click', function () { try { chrome.runtime.sendMessage({ tipo: 'opcoes' }); } catch (e) {} });
    p.appendChild(s); p.appendChild(b); f.appendChild(p);
  }
  function verificar(forcar) {
    var m = mensagemAberta(); if (!m) return;
    if (!document.querySelector('#messagebody, #message-content')) return;
    var marca = m.mbox + '|' + m.uid + '|' + (licenciado() ? 1 : 0) + '|' + estado.confianca.length;
    if (!forcar && feito === marca && document.querySelector('.ap-oa')) return;
    feito = marca;
    var f = alvo();
    if (!licenciado()) { mostrarPedido(f); return; }
    var ecra = lerEcra(); ecra.confianca = estado.confianca;
    if (ecra.deEmail) VistaAP.desenhar(f, AlertaPhishing.analisar(ecra), { confiar: confiar });
    obterOriginal(m).then(function (msg) {
      if (!msg || feito !== marca) return;
      msg.confianca = estado.confianca;
      VistaAP.desenhar(f, AlertaPhishing.analisar(msg), { confiar: confiar });
    });
  }
  var pendente = null;
  function agendar() { if (pendente) return; pendente = setTimeout(function () { pendente = null; verificar(false); }, 400); }
  try {
    chrome.storage.local.get(['codigo', 'confianca'], function (v) {
      estado.codigo = (v && v.codigo) || ''; estado.confianca = (v && v.confianca) || [];
      verificar(false);
      new MutationObserver(agendar).observe(document.documentElement, { childList: true, subtree: true });
    });
    chrome.storage.onChanged.addListener(function (c) {
      if (c.codigo) estado.codigo = c.codigo.newValue || '';
      if (c.confianca) estado.confianca = c.confianca.newValue || [];
      verificar(true);
    });
  } catch (e) {}
})();
