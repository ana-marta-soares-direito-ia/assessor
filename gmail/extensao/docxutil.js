/*
 * Utilitários locais para criar e ler ficheiros .docx simples, sem bibliotecas
 * externas e sem comunicação de rede.
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 */
'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DocxUtil = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(s) { return new TextEncoder().encode(s); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Cria um arquivo ZIP sem compressão a partir de [{name, data(Uint8Array)}]. */
  function zipStore(files) {
    var parts = [], central = [], offset = 0;
    var now = new Date();
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    files.forEach(function (f) {
      var name = utf8(f.name), data = f.data, crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint16(30, 0, true);
      ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var cdSize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    var all = parts.concat(central, [new Uint8Array(end.buffer)]);
    var total = all.reduce(function (a, b) { return a + b.length; }, 0);
    var out = new Uint8Array(total), p = 0;
    all.forEach(function (b) { out.set(b, p); p += b.length; });
    return out;
  }

  /**
   * Cria um .docx simples. paragraphs: [{text, bold, size, color, italic}]
   */
  function buildDocx(paragraphs) {
    var body = paragraphs.map(function (p) {
      var rpr = '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' +
        (p.bold ? '<w:b/>' : '') + (p.italic ? '<w:i/>' : '') +
        (p.color ? '<w:color w:val="' + p.color + '"/>' : '') +
        '<w:sz w:val="' + ((p.size || 11) * 2) + '"/></w:rPr>';
      var runs = String(p.text || '').split('\t').map(function (seg, i) {
        return (i ? '<w:r>' + rpr + '<w:tab/></w:r>' : '') +
          (seg ? '<w:r>' + rpr + '<w:t xml:space="preserve">' + esc(seg) + '</w:t></w:r>' : '');
      }).join('');
      return '<w:p><w:pPr><w:spacing w:after="' + (p.after == null ? 120 : p.after) + '"/></w:pPr>' + runs + '</w:p>';
    }).join('');
    var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>' +
      '</w:body></w:document>';
    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>';
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>';
    return zipStore([
      { name: '[Content_Types].xml', data: utf8(ct) },
      { name: '_rels/.rels', data: utf8(rels) },
      { name: 'word/document.xml', data: utf8(doc) }
    ]);
  }

  function toBase64(bytes) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
  }

  /** Lê o texto de um .docx (ArrayBuffer). Devolve uma Promise<string>. */
  function readDocxText(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return Promise.reject(new Error('O ficheiro não é um documento .docx válido.'));
    var count = dv.getUint16(eocd + 10, true), cd = dv.getUint32(eocd + 16, true);
    var dec = new TextDecoder('utf-8'), entry = null;
    for (var n = 0, p = cd; n < count; n++) {
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      var nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      var off = dv.getUint32(p + 42, true);
      var name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      if (name === 'word/document.xml') { entry = { method: method, csize: csize, off: off }; break; }
      p += 46 + nlen + xlen + clen;
    }
    if (!entry) return Promise.reject(new Error('O ficheiro .docx não contém texto legível.'));
    var lnl = dv.getUint16(entry.off + 26, true), lxl = dv.getUint16(entry.off + 28, true);
    var start = entry.off + 30 + lnl + lxl;
    var data = u8.subarray(start, start + entry.csize);
    var p2;
    if (entry.method === 0) p2 = Promise.resolve(data);
    else if (entry.method === 8) {
      if (typeof DecompressionStream === 'undefined')
        return Promise.reject(new Error('Esta versão do Office não permite ler ficheiros .docx. Cole o texto da tabela na caixa abaixo.'));
      var ds = new DecompressionStream('deflate-raw');
      var stream = new Blob([data]).stream().pipeThrough(ds);
      p2 = new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    } else return Promise.reject(new Error('Formato de compressão não suportado.'));
    return p2.then(function (xmlBytes) { return xmlToText(dec.decode(xmlBytes)); });
  }

  function xmlToText(xml) {
    var ent = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    return xml.split(/<\/w:p>/).map(function (para) {
      var out = '';
      var re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g, m;
      while ((m = re.exec(para)) !== null) {
        if (m[0] === '<w:tab/>') out += '\t';
        else if (m[0] === '<w:br/>') out += '\n';
        else out += m[1].replace(/&(amp|lt|gt|quot|apos);|&#(\d+);/g, function (x, a, d) { return d ? String.fromCharCode(+d) : ent[x]; });
      }
      return out;
    }).join('\n');
  }

  return { crc32: crc32, buildDocx: buildDocx, toBase64: toBase64, readDocxText: readDocxText, xmlToText: xmlToText };
});
