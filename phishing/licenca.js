/*
 * Alerta Phishing: verificação do código de activação.
 * Os códigos são assinados com uma chave privada que só a titular detém; aqui verifica-se a assinatura com a chave pública.
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 */
'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('tweetnacl'));
  else root.LicencaAP = factory(root.nacl);
})(typeof self !== 'undefined' ? self : this, function (nacl) {
  var CHAVE_PUBLICA = 'TLM86qs0nSMPSATt+4K2NpOkhTEhrmZ13zPcUanB89E=';
  var PREFIXO = 'AMS-', PRODUTO = 14, EPOCH = Date.UTC(2026, 0, 1), DIA = 86400000;
  function b64(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  /** Verifica um código. Devolve {ok, validade, motivo}. */
  function verificar(codigo, agora) {
    try {
      codigo = String(codigo || '').replace(/\s+/g, '');
      if (!codigo) return { ok: false, motivo: 'Cole o código de activação que recebeu.' };
      if (codigo.indexOf(PREFIXO) !== 0) return { ok: false, motivo: 'O código não está no formato correcto. Deve começar por AMS-.' };
      var t = b64(codigo.slice(PREFIXO.length));
      if (t.length !== 71 || t[0] !== 2) return { ok: false, motivo: 'O código está incompleto ou foi alterado.' };
      var p = t.subarray(0, 7), sig = t.subarray(7);
      if (!nacl.sign.detached.verify(p, sig, b64(CHAVE_PUBLICA))) return { ok: false, motivo: 'O código não é válido.' };
      if (p[1] !== PRODUTO) return { ok: false, motivo: 'Este código é de outra ferramenta ou de um curso.' };
      var dias = (p[5] << 8) | p[6], validade = dias ? new Date(EPOCH + dias * DIA) : null;
      if (validade && (agora || new Date()) > validade) return { ok: false, motivo: 'A licença expirou em ' + validade.toLocaleDateString('pt-PT') + '.' };
      return { ok: true, codigo: codigo, validade: validade };
    } catch (e) { return { ok: false, motivo: 'O código não é válido.' }; }
  }
  return { verificar: verificar, PRODUTO: PRODUTO };
});
