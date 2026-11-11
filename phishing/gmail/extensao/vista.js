/*
 * Alerta Phishing: apresentação do resultado da análise (comum ao Outlook e ao Gmail).
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 */
'use strict';
(function (root) {
  var TITULOS = { alto: 'Sinais fortes de fraude', medio: 'Mensagem a verificar', baixo: 'Sem sinais de fraude encontrados' };
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  /**
   * Desenha o resultado dentro de «alvo». opcoes: { confiar(email), aberto }
   */
  function desenhar(alvo, r, opcoes) {
    opcoes = opcoes || {};
    alvo.textContent = '';
    var caixa = el('section', 'ap-res ap-' + r.nivel);
    caixa.setAttribute('role', r.nivel === 'baixo' ? 'status' : 'alert');
    var topo = el('div', 'ap-topo');
    topo.appendChild(el('span', 'ap-marca', r.nivel === 'alto' ? '!' : r.nivel === 'medio' ? '?' : '✓'));
    var tt = el('div', 'ap-tt');
    tt.appendChild(el('strong', null, r.nivel === 'baixo' && r.sinais.length ? 'Sem sinais fortes de fraude' : TITULOS[r.nivel]));
    tt.appendChild(el('span', 'ap-de', r.remetente.email ? 'Remetente: ' + r.remetente.email : 'Remetente não identificado'));
    topo.appendChild(tt);
    caixa.appendChild(topo);
    caixa.appendChild(el('p', 'ap-resumo', r.resumo));
    if (r.sinais.length) {
      var d = el('details', 'ap-det');
      if (opcoes.aberto || r.nivel !== 'baixo') d.open = true;
      var lig = r.nivel === 'baixo' ? ' ligeiro' : '';
      d.appendChild(el('summary', null, r.sinais.length === 1 ? 'Ver o sinal' + lig + ' encontrado' : 'Ver os ' + r.sinais.length + ' sinais' + (lig ? ' ligeiros' : '') + ' encontrados'));
      var ul = el('ul', 'ap-sinais');
      r.sinais.forEach(function (s) {
        var li = el('li', s.peso >= 40 ? 'ap-grave' : '');
        li.appendChild(el('b', null, s.titulo));
        li.appendChild(el('span', null, s.detalhe));
        ul.appendChild(li);
      });
      d.appendChild(ul);
      caixa.appendChild(d);
    }
    if (r.nivel !== 'baixo') {
      var q = el('div', 'ap-fazer');
      q.appendChild(el('b', null, 'O que fazer'));
      var ol = el('ul');
      ['Não clique nas ligações nem abra os anexos.', 'Se a mensagem parece vir de um colega ou de uma entidade, confirme por telefone, usando um número que já conhecia.', 'Denuncie a mensagem como phishing no seu programa de correio e elimine-a.'].forEach(function (t) { ol.appendChild(el('li', null, t)); });
      q.appendChild(ol);
      caixa.appendChild(q);
      if (opcoes.confiar && r.remetente.email) {
        var b = el('button', 'ap-btn', 'Conheço este remetente e confio nele');
        b.type = 'button';
        b.addEventListener('click', function () { opcoes.confiar(r.remetente.email); });
        caixa.appendChild(b);
      }
    }
    caixa.appendChild(el('p', 'ap-nota', 'Alerta Phishing analisa a mensagem neste aparelho e não a envia para lado nenhum. É um apoio à sua atenção e não a substitui.'));
    alvo.appendChild(caixa);
    return caixa;
  }
  root.VistaAP = { desenhar: desenhar, TITULOS: TITULOS };
})(typeof self !== 'undefined' ? self : this);
