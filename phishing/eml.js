/*
 * Alerta Phishing: leitura de uma mensagem de correio no formato original (RFC 5322 / MIME, ficheiros .eml).
 * Usada no webmail da Ordem dos Advogados (código-fonte da mensagem) e na verificação de ficheiros .eml.
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 */
'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EmlAP = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var LIMITE_PARTES = 60;

  function binParaBytes(s) { var u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; }
  function descodificarBytes(bytes, charset) {
    var cs = String(charset || 'utf-8').toLowerCase().replace(/^"|"$/g, '');
    if (cs === 'latin1' || cs === 'iso8859-1') cs = 'iso-8859-1';
    if (cs === 'us-ascii' || cs === 'ascii') cs = 'utf-8';
    try { return new TextDecoder(cs, { fatal: false }).decode(bytes); }
    catch (e) { try { return new TextDecoder('utf-8').decode(bytes); } catch (e2) { return String.fromCharCode.apply(null, bytes); } }
  }
  function b64Bin(s) {
    s = String(s).replace(/[^A-Za-z0-9+/=]/g, '');
    try { return typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'); } catch (e) { return ''; }
  }
  function qpBin(s, cabecalho) {
    if (cabecalho) s = s.replace(/_/g, ' ');
    return s.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
  }
  /** Palavras codificadas nos cabeçalhos (RFC 2047): =?utf-8?B?...?= e =?iso-8859-1?Q?...?= */
  function descodificarCabecalho(v) {
    v = String(v || '').replace(/\?=\s+=\?/g, '?==?');
    return v.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, function (m, cs, enc, txt) {
      var bin = enc.toUpperCase() === 'B' ? b64Bin(txt) : qpBin(txt, true);
      return descodificarBytes(binParaBytes(bin), cs.split('*')[0]);
    });
  }
  /** Separa cabeçalhos e corpo, a partir de texto em que cada carácter é um byte. */
  function separar(bin) {
    var m = bin.match(/\r?\n\r?\n/);
    var cab = m ? bin.slice(0, m.index) : bin, corpo = m ? bin.slice(m.index + m[0].length) : '';
    var lista = [], porNome = {};
    cab.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach(function (l) {
      var x = l.match(/^([!-9;-~]+):[ \t]*(.*)$/);
      if (!x) return;
      var k = x[1].toLowerCase();
      lista.push([x[1], x[2]]);
      if (!(k in porNome)) porNome[k] = x[2];
    });
    return { cabTexto: cab, lista: lista, h: porNome, corpo: corpo };
  }
  function parametro(v, nome) {
    v = String(v || '');
    var m = v.match(new RegExp(';\\s*' + nome + '\\*=([^;]+)', 'i'));
    if (m) { var p = m[1].trim().replace(/^"|"$/g, '').split("'"); try { return decodeURIComponent(p[p.length - 1]); } catch (e) { return p[p.length - 1]; } }
    var partes = [], i = 0, c;
    while ((c = v.match(new RegExp(';\\s*' + nome + '\\*' + i + '\\*?=("([^"]*)"|[^;]+)', 'i')))) { partes.push((c[2] != null ? c[2] : c[1]).trim()); i++; }
    if (partes.length) { var j = partes.join(''); var q = j.split("'"); try { return decodeURIComponent(q[q.length - 1]); } catch (e) { return q[q.length - 1]; } }
    m = v.match(new RegExp(';\\s*' + nome + '=("([^"]*)"|[^;]+)', 'i'));
    return m ? descodificarCabecalho((m[2] != null ? m[2] : m[1]).trim()) : '';
  }
  function tipo(v) { return String(v || 'text/plain').split(';')[0].trim().toLowerCase(); }

  /** Percorre as partes MIME e recolhe o texto, o HTML e os anexos. */
  function partes(bin, saida, nivel) {
    if (saida.n++ > LIMITE_PARTES || nivel > 8) return;
    var p = separar(bin), ct = p.h['content-type'] || 'text/plain', t = tipo(ct);
    var cte = String(p.h['content-transfer-encoding'] || '').trim().toLowerCase();
    var disp = String(p.h['content-disposition'] || ''), nome = parametro(disp, 'filename') || parametro(ct, 'name');
    if (/^multipart\//.test(t)) {
      var fr = parametro(ct, 'boundary');
      if (!fr) return;
      var pedacos = p.corpo.split(new RegExp('(?:^|\\r?\\n)--' + fr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:--)?[ \\t]*(?=\\r?\\n|$)'));
      pedacos.slice(1).forEach(function (pc) { if (pc.replace(/\s/g, '')) partes(pc.replace(/^\r?\n/, ''), saida, nivel + 1); });
      return;
    }
    if (t === 'message/rfc822' && !/attachment/i.test(disp)) { partes(p.corpo, saida, nivel + 1); return; }
    var anexo = /^attachment/i.test(disp.trim()) || (nome && !/^text\/(plain|html)$/.test(t));
    if (anexo) { if (nome) saida.anexos.push(nome); return; }
    var bruto = cte === 'base64' ? b64Bin(p.corpo) : cte === 'quoted-printable' ? qpBin(p.corpo) : p.corpo;
    var txt = descodificarBytes(binParaBytes(bruto), parametro(ct, 'charset'));
    if (t === 'text/html') saida.html.push(txt);
    else if (t === 'text/plain') saida.texto.push(txt);
  }

  function entidades(s) {
    var mapa = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", eacute: 'é', aacute: 'á', oacute: 'ó', iacute: 'í', uacute: 'ú', ccedil: 'ç', atilde: 'ã', otilde: 'õ', acirc: 'â', ecirc: 'ê', ocirc: 'ô', agrave: 'à', euro: '€' };
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
      if (e[0] === '#') { var n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch (x) { return ''; } }
      var k = e.toLowerCase(); return k in mapa ? mapa[k] : m;
    });
  }
  /** Texto e ligações de um HTML, sem executar nada. */
  function lerHtml(html) {
    var ligs = [], texto = '';
    if (typeof DOMParser !== 'undefined') {
      var d = new DOMParser().parseFromString(html, 'text/html');
      Array.prototype.forEach.call(d.querySelectorAll('script,style,head,title'), function (e) { e.remove(); });
      Array.prototype.forEach.call(d.querySelectorAll('a[href]'), function (a) { ligs.push({ href: a.getAttribute('href'), texto: (a.textContent || '').trim() }); });
      Array.prototype.forEach.call(d.querySelectorAll('br,p,div,tr,li,h1,h2,h3'), function (e) { e.insertAdjacentText('afterend', '\n'); });
      texto = d.body ? d.body.textContent : '';
    } else {
      var limpo = html.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '');
      limpo.replace(/<a\b[^>]*?href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi, function (m, x, a, b, c, t) {
        ligs.push({ href: entidades(a != null ? a : b != null ? b : c), texto: entidades(t.replace(/<[^>]+>/g, '')).trim() });
      });
      texto = entidades(limpo.replace(/<(br|\/p|\/div|\/tr|\/li)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' '));
    }
    return { texto: texto.replace(/[ \t ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim(), ligacoes: ligs };
  }
  function urlsDoTexto(t) {
    var r = [], re = /\bhttps?:\/\/[^\s<>"')\]]+/gi, m;
    while ((m = re.exec(t)) && r.length < 300) r.push({ href: m[0].replace(/[.,;:]+$/, ''), texto: m[0].replace(/[.,;:]+$/, '') });
    return r;
  }
  function nomeEEndereco(v) {
    v = descodificarCabecalho(v || '').trim();
    var m = v.match(/^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
    if (m) return { nome: m[1].trim().replace(/^"|"$/g, '').trim(), email: m[2].toLowerCase() };
    var e = v.match(/[^\s<>"(),;:]+@[^\s<>"(),;:]+/);
    var comentario = v.match(/\(([^)]*)\)/);
    return { nome: comentario ? comentario[1].trim() : '', email: e ? e[0].toLowerCase() : '' };
  }

  /**
   * Lê uma mensagem completa. «fonte» pode ser texto (byte a byte) ou Uint8Array/ArrayBuffer.
   * Devolve o objecto que o motor de análise espera.
   */
  function ler(fonte) {
    var bin;
    if (typeof fonte === 'string') bin = fonte;
    else {
      var u = fonte instanceof Uint8Array ? fonte : new Uint8Array(fonte), s = '';
      for (var i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
      bin = s;
    }
    bin = bin.replace(/^﻿/, '').replace(/^From [^\n]*\n/, '');
    var topo = separar(bin), h = topo.h;
    var de = nomeEEndereco(h['from']), resp = nomeEEndereco(h['reply-to']);
    var saida = { texto: [], html: [], anexos: [], n: 0 };
    partes(bin, saida, 0);
    var ligacoes = [], texto = '';
    if (saida.html.length) {
      saida.html.forEach(function (x) { var r = lerHtml(x); ligacoes = ligacoes.concat(r.ligacoes); texto += r.texto + '\n'; });
      if (!texto.trim()) texto = saida.texto.join('\n');
    } else {
      texto = saida.texto.join('\n');
      ligacoes = urlsDoTexto(texto);
    }
    var para = String(descodificarCabecalho(h['to'] || '')).split(',').map(function (x) { return nomeEEndereco(x).email; }).filter(Boolean);
    return {
      deNome: de.nome, deEmail: de.email, responderPara: resp.email, para: para,
      assunto: descodificarCabecalho(h['subject'] || '').trim(),
      texto: texto.slice(0, 20000), ligacoes: ligacoes.slice(0, 300), anexos: saida.anexos,
      cabecalhos: topo.cabTexto.slice(0, 60000), data: h['date'] || ''
    };
  }
  return { ler: ler, descodificarCabecalho: descodificarCabecalho, lerHtml: lerHtml };
});
