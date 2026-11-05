/*
 * Leitura do texto dos anexos (PDF, Word, texto) no computador do utilizador, para os assistentes de correio.
 * O PDF é lido com o pdf.js, carregado a partir de window.ANEXOS_PDFJS (pasta com pdf.min.mjs e pdf.worker.min.mjs).
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 */
'use strict';
window.Anexos = (function () {
  var pdfjs = null;
  function ext(nome) { var m = String(nome || '').toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ''; }
  var TEXTO = { txt: 1, csv: 1, md: 1, json: 1, xml: 1, eml: 1, htm: 1, html: 1, rtf: 1, log: 1 };
  function legivel(nome, tipo) {
    var e = ext(nome);
    return e === 'pdf' || e === 'docx' || !!TEXTO[e] || /pdf|wordprocessingml|^text\//i.test(tipo || '');
  }
  function carregarPdf() {
    if (pdfjs) return Promise.resolve(pdfjs);
    var base = window.ANEXOS_PDFJS || '../pdf/lib/';
    var abs = new URL(base, location.href).href;
    return import(abs + 'pdf.min.mjs').then(function (m) {
      m.GlobalWorkerOptions.workerSrc = abs + 'pdf.worker.min.mjs';
      pdfjs = { lib: m, fontes: abs + 'standard_fonts/' };
      return pdfjs;
    });
  }
  function textoPdf(buf, maxPaginas) {
    return carregarPdf().then(function (p) {
      return p.lib.getDocument({ data: new Uint8Array(buf), standardFontDataUrl: p.fontes, isEvalSupported: false }).promise;
    }).then(function (doc) {
      var n = Math.min(doc.numPages, maxPaginas || 80), partes = [], i = 1;
      function pagina() {
        if (i > n) {
          var t = partes.join('\n\n').replace(/[ \t]+\n/g, '\n').trim();
          if (doc.numPages > n) t += '\n[…documento com ' + doc.numPages + ' páginas; foram lidas as primeiras ' + n + '…]';
          return t;
        }
        return doc.getPage(i).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
          var s = '';
          tc.items.forEach(function (it) { s += it.str + (it.hasEOL ? '\n' : (it.str && !/\s$/.test(it.str) ? ' ' : '')); });
          partes.push(s.replace(/ {2,}/g, ' ').trim());
          i++; return pagina();
        });
      }
      return pagina();
    });
  }
  function semMarcas(t) {
    return String(t).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
  }
  function semRtf(t) { return String(t).replace(/\\par[d]?/g, '\n').replace(/\{\\\*[^}]*\}/g, '').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '').trim(); }
  // Devolve o texto do anexo. buf: ArrayBuffer
  function extrair(nome, tipo, buf) {
    var e = ext(nome);
    if (e === 'pdf' || /pdf/i.test(tipo || '')) {
      return textoPdf(buf).then(function (t) { return t || '[PDF sem texto: provavelmente digitalizado; o texto não pôde ser lido]'; });
    }
    if (e === 'docx' || /wordprocessingml/i.test(tipo || '')) return window.DocxUtil.readDocxText(buf);
    var t = new TextDecoder('utf-8').decode(new Uint8Array(buf));
    if (e === 'htm' || e === 'html' || /html/i.test(tipo || '')) return Promise.resolve(semMarcas(t));
    if (e === 'rtf') return Promise.resolve(semRtf(t));
    if (e === 'eml') { var i = t.search(/\r?\n\r?\n/); return Promise.resolve((i > 0 ? t.slice(0, Math.min(i, 2000)) + '\n\n' + semMarcas(t.slice(i)) : t)); }
    return Promise.resolve(t);
  }
  function deBase64(b64) {
    var bin = atob(b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  return { legivel: legivel, extrair: extrair, deBase64: deBase64, ext: ext };
})();
