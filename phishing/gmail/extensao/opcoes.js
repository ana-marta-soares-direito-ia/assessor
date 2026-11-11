// Alerta Phishing para Gmail: activação da licença e gestão dos remetentes de confiança.
'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function desenhar(v) {
    var r = LicencaAP.verificar(v.codigo || ''), l = v.confianca || [];
    $('activar').hidden = r.ok; $('activo').hidden = !r.ok;
    if (r.ok) $('txtActivo').textContent = r.validade ? 'Válida até ' + r.validade.toLocaleDateString('pt-PT') + '.' : 'Sem prazo de validade.';
    var ul = $('listaConf'); ul.textContent = ''; $('confianca').hidden = !l.length;
    l.forEach(function (e) {
      var li = document.createElement('li'), s = document.createElement('span'), b = document.createElement('button');
      s.textContent = e; b.className = 'sec'; b.type = 'button'; b.textContent = 'Retirar';
      b.addEventListener('click', function () { chrome.storage.local.set({ confianca: l.filter(function (x) { return x !== e; }) }, ler); });
      li.appendChild(s); li.appendChild(b); ul.appendChild(li);
    });
  }
  function ler() { chrome.storage.local.get(['codigo', 'confianca'], desenhar); }
  $('btnActivar').addEventListener('click', function () {
    var r = LicencaAP.verificar($('codigo').value);
    if (!r.ok) { $('estadoLic').textContent = r.motivo; return; }
    $('estadoLic').textContent = '';
    chrome.storage.local.set({ codigo: r.codigo }, ler);
  });
  $('btnSair').addEventListener('click', function () { chrome.storage.local.remove('codigo', ler); });
  ler();
})();
