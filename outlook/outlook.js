/*
 * Assessor para Outlook: adaptador do painel comum (correio.js) à API do Outlook (Office.js, Mailbox 1.1 e seguintes).
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 */
'use strict';
(function () {
  var doc = null, tipoCorpo = 'html'; // documento do rascunho lido por lerNos, reutilizado por escreverNos
  function asy(fn) {
    return new Promise(function (res, rej) {
      try {
        fn(function (r) {
          if (r.status === Office.AsyncResultStatus.Succeeded) res(r.value);
          else rej(new Error((r.error && r.error.message) || 'O Outlook não concluiu a operação.'));
        });
      } catch (e) { rej(e); }
    });
  }
  function item() { return Office.context.mailbox && Office.context.mailbox.item; }
  function composicao(it) { return !!(it && it.subject && typeof it.subject !== 'string' && typeof it.subject.getAsync === 'function'); }
  function suporta(v) { try { return Office.context.requirements.isSetSupported('Mailbox', v); } catch (e) { return false; } }
  function pessoa(r) {
    if (!r) return '';
    var n = r.displayName || '', e = r.emailAddress || '';
    return n && e && n !== e ? n + ' <' + e + '>' : (e || n);
  }
  function html(texto) {
    var esc = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    return String(texto).split(/\n{2,}/).map(function (p) { return '<p style="margin:0 0 12px">' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join('');
  }
  function tipo(it) { return it.body.getTypeAsync ? asy(function (cb) { it.body.getTypeAsync(cb); }).catch(function () { return 'html'; }) : Promise.resolve('html'); }
  function anexo(a) {
    var tipo = String(a.attachmentType || 'file').toLowerCase(), nome = a.name || 'anexo';
    if (tipo === 'item' && !/\.eml$/i.test(nome)) nome += '.eml';
    return { id: tipo === 'cloud' ? null : a.id, nome: nome, tipo: tipo === 'item' ? 'message/rfc822' : (a.contentType || ''), tamanho: a.size || 0 };
  }
  var SALTAR = { SCRIPT: 1, STYLE: 1, HEAD: 1, TITLE: 1, META: 1 };
  function nosDeTexto(d) {
    var w = d.createTreeWalker(d.body || d.documentElement, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { return n.nodeValue.trim() && !(n.parentNode && SALTAR[n.parentNode.nodeName]) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
    });
    var l = [], n; while ((n = w.nextNode())) l.push(n); return l;
  }

  window.CorreioHost = {
    nome: 'Outlook', produto: 'outlook', titulo: 'Assessor para Outlook',
    iniciar: function () {
      return new Promise(function (res) {
        if (typeof Office === 'undefined') return res(false);
        Office.onReady(function (info) { res(!!(info && info.host === Office.HostType.Outlook)); });
      });
    },
    modo: function () {
      var it = item();
      if (!it) return Promise.resolve(null);
      if (it.itemType && it.itemType !== 'message' && it.itemType !== (Office.MailboxEnums && Office.MailboxEnums.ItemType && Office.MailboxEnums.ItemType.Message)) return Promise.resolve(null);
      return Promise.resolve(composicao(it) ? 'composicao' : 'leitura');
    },
    lerMensagem: function () {
      var it = item();
      if (!it) return Promise.reject(new Error('Não há nenhuma mensagem aberta.'));
      var corpo = asy(function (cb) { it.body.getAsync(Office.CoercionType.Text, cb); });
      if (!composicao(it)) {
        return corpo.then(function (t) {
          return {
            assunto: it.subject || '', de: pessoa(it.from || it.sender),
            para: (it.to || []).map(pessoa), cc: (it.cc || []).map(pessoa),
            data: it.dateTimeCreated ? new Date(it.dateTimeCreated).toLocaleString('pt-PT') : '',
            anexos: (it.attachments || []).filter(function (a) { return !a.isInline; }).map(anexo),
            corpo: String(t || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
          };
        });
      }
      var lista = function (campo) { return it[campo] && it[campo].getAsync ? asy(function (cb) { it[campo].getAsync(cb); }).then(function (v) { return (v || []).map(pessoa); }).catch(function () { return []; }) : Promise.resolve([]); };
      var anexos = it.getAttachmentsAsync ? asy(function (cb) { it.getAttachmentsAsync(cb); }).then(function (v) { return (v || []).filter(function (a) { return !a.isInline; }).map(anexo); }).catch(function () { return []; }) : Promise.resolve([]);
      var seleccao = it.getSelectedDataAsync ? asy(function (cb) { it.getSelectedDataAsync(Office.CoercionType.Text, cb); })
        .then(function (v) { return v && v.sourceProperty === 'body' && v.data && v.data.trim() ? v.data.trim() : ''; }).catch(function () { return ''; }) : Promise.resolve('');
      return Promise.all([asy(function (cb) { it.subject.getAsync(cb); }), corpo, lista('to'), lista('cc'), lista('bcc'), anexos, seleccao]).then(function (v) {
        return { assunto: v[0] || '', corpo: String(v[1] || '').replace(/\r\n/g, '\n').trim(), para: v[2], cc: v[3], bcc: v[4], anexos: v[5], seleccao: v[6] };
      });
    },
    responder: function (texto, todos) {
      var it = item();
      if (!it || composicao(it)) return Promise.reject(new Error('Abra a mensagem a que pretende responder.'));
      if (todos) it.displayReplyAllForm({ htmlBody: html(texto) }); else it.displayReplyForm({ htmlBody: html(texto) });
      return Promise.resolve('Foi aberta a resposta com o texto. Reveja-a antes de enviar.');
    },
    inserir: function (texto, assunto) {
      var it = item();
      if (!it || !composicao(it)) return Promise.reject(new Error('Abra o rascunho em que pretende inserir o texto.'));
      var antes = assunto ? asy(function (cb) { it.subject.getAsync(cb); }).then(function (a) { if (!String(a || '').trim()) return asy(function (cb) { it.subject.setAsync(assunto, cb); }); }).catch(function () {}) : Promise.resolve();
      return antes.then(function () { return tipo(it); }).then(function (t) {
        var h = t === 'html' || t === (Office.CoercionType && Office.CoercionType.Html);
        return asy(function (cb) { it.body.setSelectedDataAsync(h ? html(texto) : texto, { coercionType: h ? Office.CoercionType.Html : Office.CoercionType.Text }, cb); });
      });
    },
    lerNos: function () {
      var it = item();
      if (!it || !composicao(it)) return Promise.reject(new Error('Abra o rascunho.'));
      return tipo(it).then(function (t) {
        tipoCorpo = t === 'text' ? 'text' : 'html';
        return Promise.all([asy(function (cb) { it.subject.getAsync(cb); }),
          asy(function (cb) { it.body.getAsync(tipoCorpo === 'html' ? Office.CoercionType.Html : Office.CoercionType.Text, cb); })]);
      }).then(function (v) {
        if (tipoCorpo === 'text') { doc = { linhas: String(v[1] || '').split('\n') }; return [v[0] || ''].concat(doc.linhas); }
        doc = new DOMParser().parseFromString(String(v[1] || ''), 'text/html');
        doc.__nos = nosDeTexto(doc);
        return [v[0] || ''].concat(doc.__nos.map(function (n) { return n.nodeValue; }));
      });
    },
    escreverNos: function (novos) {
      var it = item();
      if (!doc) return Promise.reject(new Error('Leia primeiro o rascunho.'));
      var corpo;
      if (doc.linhas) corpo = novos.slice(1).join('\n');
      else { doc.__nos.forEach(function (n, i) { n.nodeValue = novos[i + 1]; }); corpo = '<!DOCTYPE html>' + doc.documentElement.outerHTML; }
      return asy(function (cb) { it.subject.setAsync(novos[0] || '', cb); }).then(function () {
        return asy(function (cb) { it.body.setAsync(corpo, { coercionType: doc.linhas ? Office.CoercionType.Text : Office.CoercionType.Html }, cb); });
      });
    },
    obterAnexo: function (a) {
      var it = item();
      if (!suporta('1.8') || !it.getAttachmentContentAsync) return Promise.reject(new Error('esta versão do Outlook não permite ler o conteúdo dos anexos'));
      return asy(function (cb) { it.getAttachmentContentAsync(a.id, cb); }).then(function (v) {
        var f = String(v.format || '').toLowerCase();
        if (f === 'base64') return window.Anexos.deBase64(v.content);
        if (f === 'eml' || f === 'icalendar') return new TextEncoder().encode(v.content || '').buffer;
        throw new Error('anexo guardado na nuvem; abra-o no OneDrive');
      });
    },
    onMudanca: function (cb) {
      try { if (suporta('1.5')) Office.context.mailbox.addHandlerAsync(Office.EventType.ItemChanged, function () { doc = null; cb(); }); } catch (e) { /* sem painel fixável */ }
    }
  };
})();
