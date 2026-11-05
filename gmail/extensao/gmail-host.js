/*
 * Assessor para Gmail: adaptador do painel comum (correio.js) ao Gmail, através do script da página (content.js).
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 */
'use strict';
(function () {
  var GMAIL = 'https://mail.google.com/*';
  function separador() {
    return chrome.tabs.query({ active: true, lastFocusedWindow: true, url: GMAIL }).then(function (l) {
      if (l.length) return l[0];
      return chrome.tabs.query({ url: GMAIL }).then(function (t) {
        if (!t.length) return null;
        t.sort(function (a, b) { return (b.lastAccessed || 0) - (a.lastAccessed || 0); });
        return t[0];
      });
    });
  }
  function enviar(id, m) { return chrome.tabs.sendMessage(id, m); }
  function pedir(m) {
    return separador().then(function (t) {
      if (!t) throw new Error('Abra o Gmail (mail.google.com) num separador.');
      return enviar(t.id, m).catch(function () {
        // O script ainda não está na página (por exemplo, o Gmail já estava aberto quando o Assessor foi instalado)
        return chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] }).then(function () { return enviar(t.id, m); });
      });
    }).then(function (r) {
      if (!r) throw new Error('O Gmail não respondeu. Recarregue a página do Gmail e tente de novo.');
      if (!r.ok) throw new Error(r.erro);
      return r.v;
    });
  }
  var ouvintes = [];
  if (window.chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (m) { if (m && m.tipo === 'mudou') ouvintes.forEach(function (f) { setTimeout(f, 600); }); });
  }

  window.CorreioHost = {
    nome: 'Gmail', produto: 'gmail', titulo: 'Assessor para Gmail',
    iniciar: function () { return Promise.resolve(!!(window.chrome && chrome.tabs && chrome.tabs.query)); },
    modo: function () { return pedir({ tipo: 'estado' }).catch(function () { return null; }); },
    lerMensagem: function () { return pedir({ tipo: 'ler' }); },
    responder: function (texto, todos) { return pedir({ tipo: 'responder', texto: texto, todos: !!todos }); },
    inserir: function (texto, assunto) { return pedir({ tipo: 'inserir', texto: texto, assunto: assunto || '' }); },
    obterAnexo: function (a) {
      return pedir({ tipo: 'anexo', url: a.id }).then(function (b64) { return window.Anexos.deBase64(b64); })
        .catch(function (e) {
          // alternativa: pedido feito pelo próprio painel, com a sessão do Gmail
          return fetch(a.id, { credentials: 'include' }).then(function (r) { if (!r.ok) throw e; return r.arrayBuffer(); });
        });
    },
    onMudanca: function (cb) { ouvintes.push(cb); }
  };
})();
