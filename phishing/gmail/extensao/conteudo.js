/*
 * Alerta Phishing para Gmail: lê a mensagem aberta na página do Gmail, analisa-a no computador e mostra o resultado por cima da mensagem.
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 */
'use strict';
(function () {
  if (window.__alertaPhishing) return; window.__alertaPhishing = true;
  var estado = { codigo: '', confianca: [] }, cabecalhos = {}, pendente = null;
  function texto(el) { return el ? (el.innerText || el.textContent || '').trim() : ''; }
  function licenciado() { return LicencaAP.verificar(estado.codigo).ok; }

  function carregar(cb) {
    try { chrome.storage.local.get(['codigo', 'confianca'], function (v) { estado.codigo = (v && v.codigo) || ''; estado.confianca = (v && v.confianca) || []; cb(); }); }
    catch (e) { cb(); }
  }
  /** Chave de sessão do Gmail, necessária para pedir o original da mensagem. */
  function chaveSessao() {
    var m = document.documentElement.innerHTML.match(/[?&;]ik=([0-9a-f]{8,12})\b/) || document.documentElement.innerHTML.match(/"ik"\s*:\s*"([0-9a-f]{8,12})"/);
    return m ? m[1] : '';
  }
  /** Tenta obter os cabeçalhos técnicos da mensagem (endereço de resposta e verificações de autenticidade). Se o Gmail não os der, a análise prossegue sem eles. */
  function obterCabecalhos(id) {
    if (!id) return Promise.resolve('');
    if (cabecalhos[id] != null) return Promise.resolve(cabecalhos[id]);
    var ik = chaveSessao(), base = location.origin + location.pathname;
    if (!ik) { cabecalhos[id] = ''; return Promise.resolve(''); }
    var url = base + '?ik=' + ik + '&view=om&permmsgid=msg-f:' + (function () { try { return BigInt('0x' + id).toString(); } catch (e) { return id; } })();
    return fetch(url, { credentials: 'include' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (h) {
      var m = h.match(/<pre[^>]*id="raw_message_text"[^>]*>([\s\S]*?)<\/pre>/);
      var bruto = m ? m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&') : '';
      var fim = bruto.search(/\r?\n\r?\n/);
      cabecalhos[id] = fim > 0 ? bruto.slice(0, fim) : '';
      return cabecalhos[id];
    }).catch(function () { cabecalhos[id] = ''; return ''; });
  }
  function lerMensagem(m) {
    var g = m.querySelector('span.gD'), h = document.querySelector('h2.hP');
    var corpos = m.querySelectorAll('div.a3s'), ligs = [], anexos = [];
    Array.prototype.forEach.call(corpos, function (c) {
      Array.prototype.forEach.call(c.querySelectorAll('a[href]'), function (a) { ligs.push({ href: a.getAttribute('href'), texto: texto(a) }); });
    });
    Array.prototype.forEach.call(m.querySelectorAll('[download_url]'), function (el) {
      var d = el.getAttribute('download_url') || '', i1 = d.indexOf(':'), i2 = d.indexOf(':', i1 + 1);
      if (i1 >= 0 && i2 >= 0) anexos.push(d.slice(i1 + 1, i2));
    });
    Array.prototype.forEach.call(m.querySelectorAll('span.aV3'), function (el) { var n = texto(el); if (n && anexos.indexOf(n) < 0) anexos.push(n); });
    var idEl = m.matches('[data-legacy-message-id]') ? m : m.querySelector('[data-legacy-message-id]');
    return {
      id: idEl ? idEl.getAttribute('data-legacy-message-id') : '',
      deNome: g ? (g.getAttribute('name') || texto(g)) : '', deEmail: g ? (g.getAttribute('email') || '') : '',
      assunto: texto(h), texto: Array.prototype.map.call(corpos, texto).join('\n').slice(0, 20000), ligacoes: ligs, anexos: anexos, confianca: estado.confianca
    };
  }
  function faixa(m) {
    var f = m.querySelector(':scope .ap-gmail');
    if (f) return f;
    var corpo = m.querySelector('div.a3s'); if (!corpo) return null;
    var alvo = corpo.closest('.ii') || corpo;
    f = document.createElement('div'); f.className = 'ap-gmail';
    alvo.parentNode.insertBefore(f, alvo);
    return f;
  }
  function confiar(email) {
    if (estado.confianca.indexOf(email) < 0) estado.confianca.push(email);
    try { chrome.storage.local.set({ confianca: estado.confianca }); } catch (e) {}
    verificar(true);
  }
  function tratar(m, forcar) {
    var corpo = m.querySelector('div.a3s'); if (!corpo || !corpo.offsetParent) return;
    var g = m.querySelector('span.gD');
    var marca = (g ? g.getAttribute('email') : '') + '|' + texto(corpo).length + '|' + (licenciado() ? 1 : 0) + '|' + estado.confianca.length;
    var f = faixa(m); if (!f) return;
    if (!forcar && f.getAttribute('data-ap') === marca) return;
    f.setAttribute('data-ap', marca);
    if (!licenciado()) {
      f.textContent = '';
      var p = document.createElement('div'); p.className = 'ap-pedir';
      var s = document.createElement('span'); s.textContent = 'Alerta Phishing: active a licença para analisar as mensagens.';
      var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Activar';
      b.addEventListener('click', function () { try { chrome.runtime.sendMessage({ tipo: 'opcoes' }); } catch (e) {} });
      p.appendChild(s); p.appendChild(b); f.appendChild(p);
      return;
    }
    var msg = lerMensagem(m);
    VistaAP.desenhar(f, AlertaPhishing.analisar(msg), { confiar: confiar });
    obterCabecalhos(msg.id).then(function (c) {
      if (!c || f.getAttribute('data-ap') !== marca) return;
      msg.cabecalhos = c;
      VistaAP.desenhar(f, AlertaPhishing.analisar(msg), { confiar: confiar });
    });
  }
  function verificar(forcar) {
    var main = document.querySelector('[role="main"]') || document;
    Array.prototype.forEach.call(main.querySelectorAll('div.adn'), function (m) { try { tratar(m, forcar === true); } catch (e) {} });
  }
  function agendar() { if (pendente) return; pendente = setTimeout(function () { pendente = null; verificar(false); }, 500); }

  carregar(function () {
    verificar(false);
    new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true });
    try {
      chrome.storage.onChanged.addListener(function (c) {
        if (c.codigo) estado.codigo = c.codigo.newValue || '';
        if (c.confianca) estado.confianca = c.confianca.newValue || [];
        verificar(true);
      });
    } catch (e) {}
  });
})();
