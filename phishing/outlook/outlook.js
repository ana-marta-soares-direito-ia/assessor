/*
 * Alerta Phishing para Outlook: lê a mensagem aberta através da API do Outlook (Office.js) e apresenta o resultado da análise.
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 */
'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var CH_LIC = 'alertaPhishing.codigo', CH_CONF = 'alertaPhishing.confianca';
  function asy(fn) {
    return new Promise(function (res, rej) {
      try { fn(function (r) { if (r.status === Office.AsyncResultStatus.Succeeded) res(r.value); else rej(new Error((r.error && r.error.message) || 'O Outlook não concluiu a operação.')); }); }
      catch (e) { rej(e); }
    });
  }
  function suporta(v) { try { return Office.context.requirements.isSetSupported('Mailbox', v); } catch (e) { return false; } }
  // Definições: acompanham a caixa de correio (roamingSettings); se não existirem, ficam neste computador.
  function ler(ch) {
    try { var rs = Office.context.roamingSettings; if (rs) { var v = rs.get(ch); if (v != null) return v; } } catch (e) {}
    try { return window.localStorage.getItem(ch); } catch (e) { return null; }
  }
  function gravar(ch, v) {
    try { window.localStorage.setItem(ch, v == null ? '' : v); } catch (e) {}
    try { var rs = Office.context.roamingSettings; if (rs) { if (v == null) rs.remove(ch); else rs.set(ch, v); rs.saveAsync(function () {}); } } catch (e) {}
  }
  function confianca() { try { return JSON.parse(ler(CH_CONF) || '[]') || []; } catch (e) { return []; } }
  function licenciado() { return LicencaAP.verificar(ler(CH_LIC)).ok; }

  function desenharConfianca() {
    var l = confianca(), ul = $('listaConf');
    ul.textContent = '';
    $('confianca').hidden = !l.length;
    l.forEach(function (e) {
      var li = document.createElement('li'), s = document.createElement('span'), b = document.createElement('button');
      s.textContent = e; b.className = 'sec'; b.type = 'button'; b.textContent = 'Retirar';
      b.addEventListener('click', function () { gravar(CH_CONF, JSON.stringify(confianca().filter(function (x) { return x !== e; }))); analisar(); });
      li.appendChild(s); li.appendChild(b); ul.appendChild(li);
    });
  }
  function lerMensagem() {
    var it = Office.context.mailbox.item;
    if (!it || typeof it.subject !== 'string') return Promise.resolve(null); // sem mensagem, ou rascunho em edição
    var de = it.from || it.sender || {};
    var m = { deNome: de.displayName || '', deEmail: de.emailAddress || '', assunto: it.subject || '', para: (it.to || []).map(function (p) { return p.emailAddress; }),
      anexos: (it.attachments || []).filter(function (a) { return !a.isInline; }).map(function (a) { return a.name || ''; }), confianca: confianca() };
    var corpo = asy(function (cb) { it.body.getAsync(Office.CoercionType.Html, cb); }).then(function (h) {
      m.ligacoes = AlertaPhishing.ligacoesDeHtml(h);
      var d = new DOMParser().parseFromString(h, 'text/html');
      Array.prototype.forEach.call(d.querySelectorAll('script,style,head'), function (x) { x.remove(); });
      m.texto = (d.body ? d.body.textContent : '').replace(/\s+/g, ' ').slice(0, 20000);
    }).catch(function () { m.ligacoes = []; m.texto = ''; });
    var cab = suporta('1.8') && it.getAllInternetHeadersAsync ? asy(function (cb) { it.getAllInternetHeadersAsync(cb); }).then(function (h) { m.cabecalhos = h; }).catch(function () {}) : Promise.resolve();
    return Promise.all([corpo, cab]).then(function () { return m; });
  }
  var vez = 0;
  function analisar() {
    var n = ++vez;
    $('activar').hidden = licenciado();
    $('btnSair').hidden = !licenciado();
    desenharConfianca();
    if (!licenciado()) { $('resultado').textContent = ''; $('semMsg').hidden = true; return; }
    lerMensagem().then(function (m) {
      if (n !== vez) return;
      $('semMsg').hidden = !!m;
      if (!m) { $('resultado').textContent = ''; return; }
      var r = AlertaPhishing.analisar(m);
      VistaAP.desenhar($('resultado'), r, { confiar: function (email) { var l = confianca(); if (l.indexOf(email) < 0) l.push(email); gravar(CH_CONF, JSON.stringify(l)); analisar(); } });
    }).catch(function (e) { if (n === vez) { $('resultado').textContent = 'Não foi possível ler a mensagem: ' + e.message; } });
  }
  function iniciar() {
    $('btnActivar').addEventListener('click', function () {
      var r = LicencaAP.verificar($('codigo').value);
      if (!r.ok) { $('estadoLic').textContent = r.motivo; return; }
      gravar(CH_LIC, r.codigo); $('estadoLic').textContent = ''; analisar();
    });
    $('btnSair').addEventListener('click', function () { gravar(CH_LIC, null); try { window.localStorage.removeItem(CH_LIC); } catch (e) {} analisar(); });
    try { Office.context.mailbox.addHandlerAsync(Office.EventType.ItemChanged, analisar); } catch (e) {}
    analisar();
  }
  if (typeof Office === 'undefined') { $('fora').hidden = false; return; }
  Office.onReady(function (info) {
    if (!info || info.host !== Office.HostType.Outlook) { $('fora').hidden = false; return; }
    iniciar();
  });
})();
