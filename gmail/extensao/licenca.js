/*
 * Cofre de Anonimização para Word: verificação de licenças.
 * Os códigos são assinados com uma chave privada que só a titular detém;
 * o painel verifica a assinatura com a chave pública abaixo.
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 */
'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('tweetnacl'));
  else root.Licenca = factory(root.nacl);
})(typeof self !== 'undefined' ? self : this, function (nacl) {
  var PUBLIC_KEY = 'jOhFm3xJ97tVVa1svD0PGRm3rPNR+DA7DQWW2fa+5fY=';
  // Chaves aceites: a original (códigos já emitidos) e a do gerador único (2026-11).
  var PUBLIC_KEYS = [PUBLIC_KEY, '8kedyj60XgI3ghCCGQymeEWysRBOBpGUjhBsyoHALq4='];
  var PREFIX = 'COFRE-';
  var EPOCH = Date.UTC(2026, 0, 1);
  var DAY = 86400000;
  var TIPOS = { 1: 'Licença individual (Word)', 2: 'Licença de escritório (Word)', 3: 'Licença de validação (Word)',
    11: 'Licença individual (PDF)', 12: 'Licença de escritório (PDF)', 13: 'Licença de validação (PDF)',
    21: 'Licença individual (Word e PDF)', 22: 'Licença de escritório (Word e PDF)',
    31: 'Licença individual (Transcrição)', 32: 'Licença de escritório (Transcrição)', 33: 'Licença de validação (Transcrição)',
    41: 'Licença individual (Excel)', 42: 'Licença de escritório (Excel)', 43: 'Licença de validação (Excel)',
    51: 'Licença individual (PowerPoint)', 52: 'Licença de escritório (PowerPoint)', 53: 'Licença de validação (PowerPoint)',
    61: 'Licença individual (Outlook)', 62: 'Licença de escritório (Outlook)', 63: 'Licença de validação (Outlook)',
    71: 'Licença individual (Gmail)', 72: 'Licença de escritório (Gmail)', 73: 'Licença de validação (Gmail)',
    81: 'Licença individual (Assessor Documental)', 82: 'Licença de escritório (Assessor Documental)', 83: 'Licença de validação (Assessor Documental)' };
  var PRODUTOS = { word: [1, 2, 3, 21, 22], pdf: [11, 12, 13, 21, 22], audio: [31, 32, 33], excel: [41, 42, 43], powerpoint: [51, 52, 53], outlook: [61, 62, 63], gmail: [71, 72, 73], documental: [81, 82, 83] };
  function allows(produto, tipo) { return (PRODUTOS[produto] || []).indexOf(tipo) >= 0; }

  function b64ToBytes(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function bytesToB64url(u) {
    var s = '';
    for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    var b = typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function payload(num, expiryDays, tipo) {
    return new Uint8Array([1, (num >> 16) & 255, (num >> 8) & 255, num & 255, (expiryDays >> 8) & 255, expiryDays & 255, tipo & 255]);
  }
  /** Cria um código (só utilizado pelo gerador, que detém a chave privada). */
  function sign(secretKeyB64, num, expiryDate, tipo) {
    var exp = expiryDate ? Math.max(1, Math.ceil((expiryDate.getTime() - EPOCH) / DAY)) : 0;
    var p = payload(num, exp, tipo || 1);
    var sig = nacl.sign.detached(p, b64ToBytes(secretKeyB64));
    var all = new Uint8Array(p.length + sig.length);
    all.set(p); all.set(sig, p.length);
    return PREFIX + bytesToB64url(all);
  }
  /** Verifica um código. Devolve {ok, num, tipo, tipoNome, validade, motivo}. */
  function verify(code, now) {
    try {
      code = String(code || '').replace(/\s+/g, '');
      if (code.indexOf(PREFIX) !== 0) return { ok: false, motivo: 'O código não está no formato correcto. Deve começar por COFRE-.' };
      var all = b64ToBytes(code.slice(PREFIX.length));
      if (all.length !== 71 || all[0] !== 1) return { ok: false, motivo: 'O código está incompleto ou foi alterado.' };
      var p = all.subarray(0, 7), sig = all.subarray(7);
      if (!PUBLIC_KEYS.some(function (k) { return nacl.sign.detached.verify(p, sig, b64ToBytes(k)); })) return { ok: false, motivo: 'O código não é válido.' };
      var num = (p[1] << 16) | (p[2] << 8) | p[3];
      var expDays = (p[4] << 8) | p[5];
      var validade = expDays ? new Date(EPOCH + expDays * DAY) : null;
      var r = { ok: true, num: num, tipo: p[6], tipoNome: TIPOS[p[6]] || 'Licença', validade: validade };
      if (validade && (now || new Date()) > validade) { r.ok = false; r.motivo = 'A licença expirou em ' + validade.toLocaleDateString('pt-PT') + '.'; }
      return r;
    } catch (e) {
      return { ok: false, motivo: 'O código não é válido.' };
    }
  }
  return { sign: sign, verify: verify, allows: allows, PUBLIC_KEY: PUBLIC_KEY, PUBLIC_KEYS: PUBLIC_KEYS, TIPOS: TIPOS };
});
