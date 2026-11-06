/*
 * Assessor de Transcrição: gravação no aparelho e transcrição integral, sem limite de duração.
 * O áudio é guardado no aparelho (IndexedDB) em partes de cerca de minuto e meio, cortadas nas pausas da fala.
 * Cada parte é transcrita pelo modelo Whisper na conta Cloudflare do utilizador ou, em alternativa, no próprio computador.
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 */
'use strict';
(function () {
  var C = window.Cofre, $ = C.$;
  var PONTE = 'https://assessor-ia.pages.dev/api/transcrever';
  var SR = 16000;                 // amostragem de trabalho
  var ALVO = 90, JMIN = 70, JMAX = 110; // duração das partes (segundos) e janela de corte
  var PECA = 1200;                // conversão de ficheiros que não são MP3, por peças de 20 minutos
  var CONC_NUVEM = 3;
  var st = { trabalhos: [], actual: null, segs: {}, ficheiros: {}, grav: null, proc: null, leitor: null };

  /* ============================================================ utilitários */
  function hms(t) {
    t = Math.max(0, Math.floor(t || 0));
    var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function duracaoTexto(t) {
    t = Math.round(t || 0);
    var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60);
    if (!h && !m) return t + (t === 1 ? ' segundo' : ' segundos');
    return (h ? h + (h === 1 ? ' hora' : ' horas') + (m ? ' e ' : '') : '') + (m ? m + (m === 1 ? ' minuto' : ' minutos') : '');
  }
  var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  function dataTexto(ms) {
    var d = new Date(ms), mm = d.getMinutes();
    return d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear() + ', ' + d.getHours() + 'h' + (mm < 10 ? '0' : '') + mm;
  }
  function novoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function chave(tid, i) { return tid + ':' + ('00000' + i).slice(-6); }
  function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function confirmar(t) { try { return window.confirm(t); } catch (e) { return true; } }
  function pedirTexto(t, v) { try { var r = window.prompt(t, v); return r && r.trim(); } catch (e) { return ''; } }
  function motor() { var r = document.querySelector('input[name=motor]:checked'); return r ? r.value : 'nuvem'; }
  function contaLigada() { var c = C.conta(); return !!(c.conta && c.token); }
  function nomeFicheiro(t) { return (t.nome || 'transcricao').replace(/[\\\/:*?"<>|,;]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'transcricao'; }

  /* ============================================================ armazenamento local */
  var BD = null;
  function abrirBD() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('assessor-transcricao', 1);
      r.onupgradeneeded = function () {
        r.result.createObjectStore('trabalhos', { keyPath: 'id' });
        r.result.createObjectStore('segmentos', { keyPath: 'k' });
        r.result.createObjectStore('audio', { keyPath: 'k' });
      };
      r.onsuccess = function () { BD = r.result; res(); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function tx(loja, modo, fn) {
    return new Promise(function (res, rej) {
      var t = BD.transaction(loja, modo), s = t.objectStore(loja), out;
      var q = fn(s); if (q) q.onsuccess = function () { out = q.result; };
      t.oncomplete = function () { res(out); }; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error || new Error('Não foi possível gravar neste aparelho (espaço insuficiente?).')); };
    });
  }
  function por(loja, obj) { return tx(loja, 'readwrite', function (s) { return s.put(obj); }); }
  function obter(loja, k) { return tx(loja, 'readonly', function (s) { return s.get(k); }); }
  function intervalo(tid) { return IDBKeyRange.bound(tid + ':', tid + ':￿'); }
  function guardarTrabalho(t) { t.alterado = Date.now(); return por('trabalhos', t); }
  function guardarSeg(s) { return por('segmentos', s); }
  function segsDe(tid) { return tx('segmentos', 'readonly', function (s) { return s.getAll(intervalo(tid)); }).then(function (l) { return (l || []).sort(function (a, b) { return a.i - b.i; }); }); }
  function apagarTudo(tid) {
    return Promise.all([
      tx('segmentos', 'readwrite', function (s) { s.delete(intervalo(tid)); }),
      tx('audio', 'readwrite', function (s) { s.delete(intervalo(tid)); }),
      tx('trabalhos', 'readwrite', function (s) { s.delete(tid); })
    ]);
  }

  /* ============================================================ arranque */
  function boot() {
    if (!window.__cofreSuportado || !C || !window.indexedDB) { $('unsupported').hidden = false; return; }
    C.iniciar({ produto: 'transcricao', nome: 'Assessor de Transcrição', revogadas: 'https://ana-marta-soares-direito-ia.github.io/assessor/revogadas.json' });
    C.showTab('gravacoes');
    bind();
    abrirBD().then(carregar).catch(function () { $('outside').hidden = false; });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
    try { var m = window.localStorage.getItem('transcricao.motor'); if (m) { var r = document.querySelector('input[name=motor][value=' + m + ']'); if (r) r.checked = true; } } catch (e) {}
    mostrarMotor();
    setInterval(function () { $('avisoConta').hidden = motor() !== 'nuvem' || contaLigada(); }, 1500);
  }
  function bind() {
    $('btnGravar').addEventListener('click', function () { if (C.licenciado()) iniciarGravacao(); });
    $('btnPausar').addEventListener('click', pausar);
    $('btnTerminar').addEventListener('click', terminarGravacao);
    $('btnContinuarGrav').addEventListener('click', continuarGravacao);
    $('ficheiro').addEventListener('change', function () { var f = $('ficheiro').files[0]; $('ficheiro').value = ''; if (f) importar(f); });
    $('ficheiroReabrir').addEventListener('change', function () { var f = $('ficheiroReabrir').files[0]; $('ficheiroReabrir').value = ''; if (f) reabrirFicheiro(f); });
    $('btnTranscrever').addEventListener('click', function () { if (st.actual) processar(st.actual); });
    $('btnParar').addEventListener('click', function () { if (st.proc) { st.proc.parar = true; acordar(); C.setStatus('trabStatus', 'A parar depois das partes em curso…', 'busy'); } });
    $('btnRenomear').addEventListener('click', renomear);
    $('btnApagar').addEventListener('click', apagar);
    $('btnWord').addEventListener('click', exportarWord);
    $('btnTxt').addEventListener('click', exportarTxt);
    $('btnMp3').addEventListener('click', exportarMp3);
    $('btnCopiar').addEventListener('click', copiar);
    $('transcricao').addEventListener('click', function (e) { var b = e.target.closest('.ts'); if (b) ouvir(parseFloat(b.dataset.t)); });
    document.querySelectorAll('input[name=motor]').forEach(function (r) { r.addEventListener('change', function () { try { window.localStorage.setItem('transcricao.motor', motor()); } catch (e) {} mostrarMotor(); }); });
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    window.addEventListener('pagehide', function () { if (st.grav && !st.grav.pausado) cortar(true); });
    window.addEventListener('online', acordar);
    window.addEventListener('beforeunload', function (e) { if (st.grav || st.proc) { e.preventDefault(); e.returnValue = ''; } });
  }
  function mostrarMotor() { $('localOpcoes').hidden = motor() !== 'local'; $('avisoConta').hidden = motor() !== 'nuvem' || contaLigada(); }

  function carregar() {
    return tx('trabalhos', 'readonly', function (s) { return s.getAll(); }).then(function (l) {
      st.trabalhos = (l || []).sort(function (a, b) { return (b.criado || 0) - (a.criado || 0); });
      var recuperar = st.trabalhos.filter(function (t) { return t.origem === 'gravacao' && t.estado === 'a gravar'; });
      return Promise.all(recuperar.map(function (t) {
        t.estado = 'gravado';
        t.nota = 'A gravação terminou de forma inesperada; foi recuperado o áudio guardado até ' + hms(t.duracao) + '.';
        return guardarTrabalho(t);
      }));
    }).then(function () { listar(); if (st.trabalhos[0]) abrir(st.trabalhos[0].id); espaco(); });
  }
  function espaco() {
    if (!navigator.storage || !navigator.storage.estimate) return;
    navigator.storage.estimate().then(function (e) {
      $('espaco').textContent = 'Espaço ocupado neste aparelho: ' + Math.round((e.usage || 0) / 1048576) + ' MB.';
    }).catch(function () {});
  }
  function estadoTexto(t) {
    var segs = st.segs[t.id];
    if (t.estado === 'a gravar') return 'A gravar';
    if (segs && segs.length) {
      var f = segs.filter(function (s) { return s.estado === 'feito'; });
      if (f.length === segs.length && (t.origem === 'gravacao' || t.planoCompleto)) return 'Transcrita';
      var seg = f.reduce(function (a, s) { return a + s.fim - s.ini; }, 0), tot = t.duracao || segs[segs.length - 1].fim;
      if (f.length) return 'Transcrita em ' + Math.max(1, Math.min(99, Math.floor(100 * seg / tot))) + '%';
    }
    return 'Por transcrever';
  }
  function listar() {
    var box = $('lista'); box.innerHTML = '';
    if (!st.trabalhos.length) { box.innerHTML = '<div class="vazio">Ainda não há gravações neste aparelho.</div>'; return; }
    st.trabalhos.forEach(function (t) {
      var b = document.createElement('button'); b.className = 'item' + (st.actual && st.actual.id === t.id ? ' activo' : '');
      b.innerHTML = '<b>' + C.esc(t.nome) + '</b><small>' + C.esc(dataTexto(t.criado) + ' · ' + (t.duracao ? hms(t.duracao) : '…') + ' · ' + estadoTexto(t)) + '</small>';
      b.addEventListener('click', function () { abrir(t.id); if (window.innerWidth < 820) $('painelTrabalho').scrollIntoView({ behavior: 'smooth' }); });
      box.appendChild(b);
    });
  }
  function trabalho(id) { return st.trabalhos.filter(function (t) { return t.id === id; })[0]; }
  function abrir(id) {
    var t = trabalho(id); if (!t) return;
    st.actual = t;
    if (st.leitor && st.leitor.tid !== id) { try { URL.revokeObjectURL(st.leitor.url); } catch (e) {} st.leitor = null; $('leitor').hidden = true; $('leitor').removeAttribute('src'); }
    var p = st.segs[id] ? Promise.resolve(st.segs[id]) : segsDe(id).then(function (l) { st.segs[id] = l; return l; });
    return p.then(function () { listar(); mostrarTrabalho(); });
  }

  /* ============================================================ apresentação do trabalho */
  function mostrarTrabalho() {
    var t = st.actual;
    $('painelVazio').hidden = !!t || !!st.grav;
    $('painelTrabalho').hidden = !t;
    if (!t) return;
    var segs = st.segs[t.id] || [];
    var feitos = segs.filter(function (s) { return s.estado === 'feito'; }).length;
    $('tNome').textContent = t.nome;
    $('tMeta').textContent = dataTexto(t.criado) + ' · ' + (t.origem === 'gravacao' ? 'Gravada neste aparelho' : 'Ficheiro ' + (t.ficheiro ? t.ficheiro.nome : '')) +
      (t.duracao ? ' · Duração: ' + duracaoTexto(t.duracao) : '') + ' · ' + estadoTexto(t);
    var aGravar = st.grav && st.grav.tid === t.id;
    var emCurso = st.proc && st.proc.tid === t.id;
    var completo = segs.length && feitos === segs.length && (t.origem === 'gravacao' || t.planoCompleto);
    var precisaFicheiro = t.origem === 'ficheiro' && !st.ficheiros[t.id] && !completo && (t.modo === 'mp3' || !t.planoCompleto);
    $('btnTranscrever').hidden = !!emCurso || completo || precisaFicheiro || (aGravar && $('optDurante').checked);
    $('btnTranscrever').textContent = feitos ? 'Continuar a transcrição' : 'Transcrever';
    $('btnParar').hidden = !emCurso;
    $('lblReabrir').hidden = !precisaFicheiro || !!emCurso;
    $('btnMp3').hidden = (t.origem !== 'gravacao' && t.modo !== 'conv') || aGravar;
    $('btnWord').disabled = $('btnTxt').disabled = $('btnCopiar').disabled = !feitos;
    if (precisaFicheiro && !emCurso) C.setStatus('trabStatus', 'Para continuar, seleccione de novo o ficheiro «' + t.ficheiro.nome + '» neste aparelho.', 'busy');
    else if (t.nota && !emCurso && !$('trabStatus').textContent) C.setStatus('trabStatus', t.nota, 'busy');
    progressoGeral();
    desenhar(true);
  }
  function progressoGeral() {
    var t = st.actual; if (!t) return;
    var segs = st.segs[t.id] || [];
    var emCurso = st.proc && st.proc.tid === t.id;
    var aGravar = st.grav && st.grav.tid === t.id;
    if (!segs.length && (!emCurso || aGravar)) { $('progresso').hidden = true; return; }
    var feitos = segs.filter(function (s) { return s.estado === 'feito'; });
    var segFeitos = feitos.reduce(function (a, s) { return a + (s.fim - s.ini); }, 0);
    var total = t.duracao || segs.reduce(function (a, s) { return Math.max(a, s.fim); }, 0) || 1;
    var completo = segs.length && feitos.length === segs.length && (t.origem === 'gravacao' ? t.estado !== 'a gravar' : t.planoCompleto);
    $('progresso').hidden = !!completo && !emCurso;
    $('barra').style.width = Math.min(100, Math.round(100 * segFeitos / total)) + '%';
    $('progTxt').textContent = 'Transcrito: ' + hms(segFeitos) + ' de ' + hms(total) + (aGravar ? ' já gravados' : '');
    var eta = '';
    if (emCurso && st.proc.inicio && st.proc.feitosSessao > 1) {
      var ritmo = (Date.now() - st.proc.inicio) / 1000 / st.proc.segSessao; // segundos de relógio por segundo de áudio
      var falta = Math.max(0, total - segFeitos) * ritmo;
      if (t.estado !== 'a gravar') eta = 'Tempo restante estimado: ' + (falta < 60 ? 'menos de um minuto' : duracaoTexto(falta));
    }
    $('progEta').textContent = eta;
  }

  var desenhoPendente = null;
  function desenhar(ja) {
    if (!ja) { if (desenhoPendente) return; desenhoPendente = setTimeout(function () { desenhoPendente = null; desenhar(true); }, 1200); return; }
    var t = st.actual; if (!t) return;
    var host = $('transcricao');
    var segs = st.segs[t.id] || [];
    var marcas = (t.interrupcoes || []).slice().sort(function (a, b) { return a.t - b.t; }), mi = 0;
    var html = [], pend = null;
    function fecharPend() { if (pend) { html.push('<p class="pend"><span class="ts" data-t="' + pend.a + '">' + hms(pend.a) + '</span>Por transcrever, de ' + hms(pend.a) + ' a ' + hms(pend.b) + '.</p>'); pend = null; } }
    segs.forEach(function (s) {
      while (mi < marcas.length && marcas[mi].t <= s.ini + 0.5) {
        fecharPend();
        html.push('<p class="marca">' + (marcas[mi].tipo === 'pausa' ? 'Pausa na gravação' : 'Gravação interrompida pelo sistema e retomada') + ' (' + hms(marcas[mi].t) + ')</p>');
        mi++;
      }
      if (s.estado !== 'feito') {
        if (pend) pend.b = s.fim; else pend = { a: s.ini, b: s.fim };
        if (s.estado === 'erro') { fecharPend(); html.push('<p class="erro-seg">Não foi possível transcrever a parte de ' + hms(s.ini) + ' a ' + hms(s.fim) + ': ' + C.esc(s.erro || '') + ' Seleccione «Continuar a transcrição» para tentar de novo.</p>'); }
        return;
      }
      fecharPend();
      paragrafos(s).forEach(function (p) { html.push('<p><button class="ts" data-t="' + p.s.toFixed(2) + '" title="Ouvir a partir deste ponto">' + hms(p.s) + '</button>' + C.esc(p.t) + '</p>'); });
    });
    fecharPend();
    if (!segs.length) html.push('<p class="pend">' + (st.grav && st.grav.tid === t.id ? 'A primeira parte da gravação fica guardada ao fim de cerca de minuto e meio.' : 'Ainda não há texto transcrito.') + '</p>');
    var fimVisivel = host.scrollHeight - host.scrollTop - host.clientHeight < 40;
    host.innerHTML = html.join('');
    if (fimVisivel && st.proc) host.scrollTop = host.scrollHeight;
  }
  // agrupa os trechos devolvidos pelo modelo em parágrafos, pelas pausas e pela extensão
  function paragrafos(s) {
    var out = [], cur = null;
    (s.partes || []).forEach(function (p) {
      if (!p.t) return;
      if (!cur || p.s - cur.e > 2.2 || cur.t.length > 650) { cur = { s: p.s, e: p.e, t: p.t }; out.push(cur); }
      else { cur.t += ' ' + p.t; cur.e = p.e; }
    });
    return out;
  }
  function textoCompleto(comHoras) {
    var t = st.actual, segs = st.segs[t.id] || [], linhas = [], pend = null;
    segs.forEach(function (s) {
      if (s.estado !== 'feito') { if (pend) pend.b = s.fim; else pend = { a: s.ini, b: s.fim }; return; }
      if (pend) { linhas.push('[Parte por transcrever: de ' + hms(pend.a) + ' a ' + hms(pend.b) + ']'); pend = null; }
      paragrafos(s).forEach(function (p) { linhas.push((comHoras ? '[' + hms(p.s) + '] ' : '') + p.t); });
    });
    if (pend) linhas.push('[Parte por transcrever: de ' + hms(pend.a) + ' a ' + hms(pend.b) + ']');
    return linhas;
  }

  /* ============================================================ gravação */
  var WORKLET = "class Captura extends AudioWorkletProcessor{constructor(){super();this.b=new Float32Array(4096);this.n=0;}process(i){var c=i[0]&&i[0][0];if(c){for(var k=0;k<c.length;k++){this.b[this.n++]=c[k];if(this.n===4096){this.port.postMessage(this.b.slice(0));this.n=0;}}}return true;}}registerProcessor('captura',Captura);";

  function codificador() {
    if (!st.cod) {
      st.cod = { w: new Worker('codificador.js'), id: 0, espera: {} };
      st.cod.w.onmessage = function (e) { var f = st.cod.espera[e.data.id]; delete st.cod.espera[e.data.id]; if (f) f(e.data.buf); };
    }
    return st.cod;
  }
  function codificar(pcm) {
    var c = codificador(), id = ++c.id;
    return new Promise(function (res) { c.espera[id] = res; c.w.postMessage({ id: id, pcm: pcm }, [pcm.buffer]); });
  }

  async function abrirMicrofone(g) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Este browser não permite gravar. Use o Chrome, o Safari ou o Edge actualizados.');
    var stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
    var AC = window.AudioContext || window.webkitAudioContext, ctx, src;
    try { ctx = new AC({ sampleRate: SR }); src = ctx.createMediaStreamSource(stream); }
    catch (e) { try { ctx && ctx.close(); } catch (x) {} ctx = new AC(); src = ctx.createMediaStreamSource(stream); }
    var mudo = ctx.createGain(); mudo.gain.value = 0; mudo.connect(ctx.destination);
    var no;
    if (ctx.audioWorklet && window.AudioWorkletNode) {
      var url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      no = new AudioWorkletNode(ctx, 'captura');
      no.port.onmessage = function (e) { receber(e.data); };
    } else {
      no = ctx.createScriptProcessor(4096, 1, 1);
      no.onaudioprocess = function (e) { receber(new Float32Array(e.inputBuffer.getChannelData(0))); };
    }
    src.connect(no); no.connect(mudo);
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) {} }
    g.stream = stream; g.ctx = ctx; g.no = no;
    g.razao = ctx.sampleRate / SR; g.rs = { soma: 0, n: 0, idx: 0, lim: g.razao };
    var pista = stream.getAudioTracks()[0];
    if (pista) pista.addEventListener('ended', function () { if (st.grav === g) interrompida(); });
    ctx.onstatechange = function () { if (st.grav === g && (ctx.state === 'interrupted' || ctx.state === 'suspended') && !g.pausado) estadoGravacao('Gravação suspensa pelo sistema. A retomar…'); };
  }
  function fecharMicrofone(g) {
    try { g.stream.getTracks().forEach(function (x) { x.stop(); }); } catch (e) {}
    try { g.no.disconnect(); } catch (e) {}
    try { g.ctx.close(); } catch (e) {}
    g.stream = g.ctx = g.no = null;
  }
  async function manterEcra(g) {
    try { if (navigator.wakeLock && document.visibilityState === 'visible') { g.lock = await navigator.wakeLock.request('screen'); } } catch (e) {}
  }

  async function iniciarGravacao() {
    if (st.grav) return;
    var t = { id: novoId(), nome: 'Gravação de ' + dataTexto(Date.now()), criado: Date.now(), origem: 'gravacao', modo: 'grav', estado: 'a gravar', duracao: 0, interrupcoes: [] };
    var g = { tid: t.id, buf: [], len: 0, i: 0, tGravado: 0, pausado: false, cadeia: Promise.resolve(), nivel: 0 };
    C.setStatus('gravStatus', 'A pedir acesso ao microfone…', 'busy');
    try { await abrirMicrofone(g); }
    catch (e) {
      C.setStatus('gravStatus', /NotAllowed|Permission/i.test(e.name + e.message) ? 'O acesso ao microfone foi recusado. Autorize o microfone nas definições do browser para este site e tente de novo.' : (e.message || String(e)), 'err');
      return;
    }
    C.setStatus('gravStatus', '');
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    st.grav = g;
    st.segs[t.id] = [];
    st.trabalhos.unshift(t);
    await guardarTrabalho(t);
    manterEcra(g);
    g.inicioRelogio = Date.now();
    g.relogio = setInterval(actualizarRelogio, 250);
    $('painelGravacao').hidden = false; $('painelVazio').hidden = true;
    $('btnGravar').disabled = true; $('ficheiro').disabled = true;
    $('btnPausar').textContent = 'Pausar'; $('btnPausar').hidden = false; $('btnTerminar').hidden = false; $('btnContinuarGrav').hidden = true;
    estadoGravacao('A gravar');
    await abrir(t.id);
    try { $('painelGravacao').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
    if ($('optDurante').checked) processar(t, true);
  }
  function estadoGravacao(txt, parado) {
    $('gravEstado').textContent = txt;
    $('recPonto').classList.toggle('parado', !!parado);
  }
  function actualizarRelogio() {
    var g = st.grav; if (!g) return;
    $('relogio').textContent = hms(g.tGravado + g.len / SR);
    $('nivel').style.width = Math.min(100, Math.round(g.nivel * 260)) + '%';
    g.nivel *= 0.85;
    if (g.ctx && g.ctx.state !== 'running' && !g.pausado && document.visibilityState === 'visible') { g.ctx.resume().then(function () { if (g.ctx && g.ctx.state === 'running') estadoGravacao('A gravar'); }).catch(function () {}); }
  }
  function receber(x) {
    var g = st.grav; if (!g || g.pausado) return;
    var y;
    if (Math.abs(g.razao - 1) < 1e-6) y = x;
    else {
      // reamostragem para 16 kHz por média em janela (suficiente para a voz)
      var rs = g.rs, out = new Float32Array(Math.ceil(x.length / g.razao) + 2), n = 0;
      for (var i = 0; i < x.length; i++) {
        rs.soma += x[i]; rs.n++; rs.idx++;
        if (rs.idx >= rs.lim) { out[n++] = rs.soma / rs.n; rs.soma = 0; rs.n = 0; rs.lim += g.razao; }
      }
      y = out.subarray(0, n);
    }
    var e = 0; for (var j = 0; j < y.length; j++) e += y[j] * y[j];
    g.nivel = Math.max(g.nivel, Math.sqrt(e / Math.max(1, y.length)));
    g.buf.push(y); g.len += y.length;
    if (g.len >= JMAX * SR) cortar(false);
  }
  function juntar(lista, total) { var a = new Float32Array(total), p = 0; lista.forEach(function (b) { a.set(b, p); p += b.length; }); return a; }
  // ponto mais silencioso (janela de 0,3 s) entre as amostras a e b
  function silencio(x, a, b) {
    var w = Math.round(0.3 * SR), passo = Math.round(0.05 * SR);
    a = Math.max(0, a); b = Math.min(x.length, b);
    if (b - a <= w) return Math.round((a + b) / 2);
    var pre = new Float64Array(b - a + 1);
    for (var i = a; i < b; i++) pre[i - a + 1] = pre[i - a] + x[i] * x[i];
    var ens = [], melhor = Infinity;
    for (var k = 0; k + w <= b - a; k += passo) { var en = pre[k + w] - pre[k]; ens.push(en); if (en < melhor) melhor = en; }
    // escolhe o meio do trecho silencioso mais longo (e não a sua orla, junto ao recomeço da fala)
    var lim = Math.max(melhor * 4, 1e-7 * w), runIni = -1, bestIni = 0, bestLen = 0;
    for (var j = 0; j <= ens.length; j++) {
      if (j < ens.length && ens[j] <= lim) { if (runIni < 0) runIni = j; }
      else if (runIni >= 0) { if (j - runIni > bestLen) { bestLen = j - runIni; bestIni = runIni; } runIni = -1; }
    }
    return Math.round(a + (bestIni + (bestLen - 1) / 2) * passo + w / 2);
  }
  // fecha a parte em curso: final = tudo o que está no tampão; caso contrário, corta na pausa mais próxima
  function cortar(final) {
    var g = st.grav; if (!g || !g.len) return;
    var tudo = juntar(g.buf, g.len), parte, resto;
    if (final) { parte = tudo; resto = new Float32Array(0); }
    else { var c = silencio(tudo, JMIN * SR, JMAX * SR); parte = tudo.slice(0, c); resto = tudo.slice(c); }
    g.buf = resto.length ? [resto] : []; g.len = resto.length;
    if (parte.length < SR * 0.4) { g.tGravado += parte.length / SR; return; }
    var i = g.i++, ini = g.tGravado, fim = ini + parte.length / SR;
    g.tGravado = fim;
    var t = trabalho(g.tid);
    g.cadeia = g.cadeia.then(function () { return codificar(parte); }).then(function (buf) {
      var s = { k: chave(g.tid, i), tid: g.tid, i: i, ini: ini, fim: fim, fonte: 'seg', durMp3: quadrosMp3(buf) * 576 / SR, estado: 'pendente' };
      return por('audio', { k: s.k, buf: buf }).then(function () { return guardarSeg(s); }).then(function () {
        (st.segs[g.tid] = st.segs[g.tid] || []).push(s);
        t.duracao = fim;
        return guardarTrabalho(t);
      });
    }).then(function () {
      if (st.actual && st.actual.id === g.tid) { mostrarTrabalho(); }
      listar(); acordar();
    }).catch(function (e) { estadoGravacao('Atenção: ' + ((e && e.message) || 'não foi possível guardar o áudio neste aparelho.')); });
  }
  function pausar() {
    var g = st.grav; if (!g) return;
    if (!g.pausado) {
      cortar(true); g.pausado = true;
      var t = trabalho(g.tid); t.interrupcoes.push({ t: g.tGravado, tipo: 'pausa' }); guardarTrabalho(t);
      $('btnPausar').textContent = 'Retomar'; estadoGravacao('Em pausa', true);
    } else {
      g.pausado = false; $('btnPausar').textContent = 'Pausar'; estadoGravacao('A gravar');
      if (g.ctx && g.ctx.state !== 'running') g.ctx.resume().catch(function () {});
    }
  }
  function interrompida() {
    var g = st.grav; if (!g || g.interrompida) return;
    cortar(true);
    g.interrompida = true;
    fecharMicrofone(g);
    estadoGravacao('Gravação interrompida pelo sistema', true);
    $('btnPausar').hidden = true; $('btnContinuarGrav').hidden = false;
    $('gravDica').textContent = 'O áudio gravado até ' + hms(g.tGravado) + ' está guardado. Seleccione «Continuar a gravar» para prosseguir na mesma gravação, ou «Terminar a gravação».';
  }
  async function continuarGravacao() {
    var g = st.grav; if (!g) return;
    try { await abrirMicrofone(g); } catch (e) { estadoGravacao('Não foi possível reabrir o microfone: ' + (e.message || e), true); return; }
    var t = trabalho(g.tid); t.interrupcoes.push({ t: g.tGravado, tipo: 'interrupcao' }); guardarTrabalho(t);
    g.interrompida = false; g.pausado = false;
    manterEcra(g);
    $('btnPausar').hidden = false; $('btnPausar').textContent = 'Pausar'; $('btnContinuarGrav').hidden = true;
    $('gravDica').textContent = 'Mantenha a aplicação aberta e o ecrã ligado; para gravações longas, ligue o carregador. O áudio é guardado neste aparelho a cada minuto e meio.';
    estadoGravacao('A gravar');
  }
  async function terminarGravacao() {
    var g = st.grav; if (!g) return;
    $('btnTerminar').disabled = true;
    if (!g.pausado) cortar(true);
    g.pausado = true;
    fecharMicrofone(g);
    clearInterval(g.relogio);
    try { if (g.lock) g.lock.release(); } catch (e) {}
    estadoGravacao('A guardar…', true);
    await g.cadeia;
    var t = trabalho(g.tid);
    t.estado = 'gravado'; t.duracao = g.tGravado;
    await guardarTrabalho(t);
    st.grav = null;
    $('painelGravacao').hidden = true; $('btnTerminar').disabled = false;
    $('btnGravar').disabled = false; $('ficheiro').disabled = false;
    await abrir(t.id);
    espaco();
    if (st.proc && st.proc.tid === t.id) acordar();
    else if (motor() === 'nuvem' ? contaLigada() : true) processar(t);
    else C.setStatus('trabStatus', 'Gravação guardada. Ligue a sua conta Cloudflare no separador «Conta de IA» e seleccione «Transcrever».', 'busy');
  }
  function aoMudarVisibilidade() {
    var g = st.grav;
    if (!g) return;
    if (document.visibilityState === 'hidden') { if (!g.pausado && !g.interrompida) cortar(true); }
    else {
      manterEcra(g);
      if (g.ctx && g.ctx.state !== 'running' && !g.pausado) g.ctx.resume().catch(function () {});
      var pista = g.stream && g.stream.getAudioTracks()[0];
      if (!g.interrompida && (!pista || pista.readyState === 'ended')) interrompida();
    }
  }

  /* ============================================================ MP3: leitura dos quadros */
  var BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  var TAXAS = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  function cabecalho(b, o) {
    if (b[o] !== 0xFF || (b[o + 1] & 0xE0) !== 0xE0) return null;
    var ver = (b[o + 1] >> 3) & 3, cam = (b[o + 1] >> 1) & 3;
    if (ver === 1 || cam !== 1) return null;
    var bri = (b[o + 2] >> 4) & 15, sri = (b[o + 2] >> 2) & 3, pad = (b[o + 2] >> 1) & 1;
    if (bri === 0 || bri === 15 || sri === 3) return null;
    var sr = TAXAS[ver][sri], br = (ver === 3 ? BR1 : BR2)[bri] * 1000;
    return { len: Math.floor((ver === 3 ? 144 : 72) * br / sr) + pad, spf: ver === 3 ? 1152 : 576, sr: sr };
  }
  function quadrosMp3(buf) { var b = new Uint8Array(buf), n = 0, o = 0; while (o + 4 <= b.length) { var h = cabecalho(b, o); if (h) { n++; o += h.len; } else o++; } return n; }
  // percorre o ficheiro por blocos, sem o carregar todo na memória
  async function lerQuadros(blob, aoProgresso) {
    var tam = blob.size, cap = 1 << 16, off = new Float64Array(cap), tt = new Float64Array(cap), n = 0, t = 0, pos = 0;
    var ini = new Uint8Array(await blob.slice(0, 10).arrayBuffer());
    if (ini[0] === 0x49 && ini[1] === 0x44 && ini[2] === 0x33) pos = 10 + ((ini[6] & 127) << 21 | (ini[7] & 127) << 14 | (ini[8] & 127) << 7 | (ini[9] & 127)) + ((ini[5] & 16) ? 10 : 0);
    var BLOCO = 4 << 20;
    while (pos < tam - 4) {
      var fimBloco = Math.min(tam, pos + BLOCO + 8192);
      var b = new Uint8Array(await blob.slice(pos, fimBloco).arrayBuffer());
      var lim = fimBloco >= tam ? b.length - 4 : BLOCO, o = 0;
      while (o < lim) {
        var h = cabecalho(b, o);
        if (h && (o + h.len + 4 > b.length || cabecalho(b, o + h.len))) {
          if (n + 1 >= cap) { cap *= 2; var a1 = new Float64Array(cap); a1.set(off); off = a1; var a2 = new Float64Array(cap); a2.set(tt); tt = a2; }
          off[n] = pos + o; tt[n] = t; n++; t += h.spf / h.sr; o += h.len;
        } else o++;
      }
      if (o === 0) o = 1;
      pos += o;
      if (aoProgresso) aoProgresso(Math.min(1, pos / tam));
    }
    off[n] = Math.min(tam, n ? off[n - 1] + (pos - off[n - 1]) : tam); tt[n] = t;
    // o primeiro quadro pode ser apenas de informação (Xing, Info, VBRI), com a duração do ficheiro inteiro: é ignorado
    if (n > 1) {
      var q0 = new Uint8Array(await blob.slice(off[0], off[1]).arrayBuffer()), s0 = '';
      for (var z = 0; z < q0.length; z++) s0 += String.fromCharCode(q0[z]);
      if (/Xing|Info|VBRI/.test(s0)) { off = off.subarray(1); var d0 = tt[1]; tt = tt.subarray(1).map(function (v) { return v - d0; }); n--; t -= d0; }
    }
    return { off: off, t: tt, n: n, dur: t };
  }
  function indice(q, tempo) { var a = 0, b = q.n; while (a < b) { var m = (a + b) >> 1; if (q.t[m] < tempo) a = m + 1; else b = m; } return a; }
  function decodificar(buf) {
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var ctx = new OAC(1, SR, SR);
    return new Promise(function (res, rej) {
      var p = ctx.decodeAudioData(buf, function (ab) {
        var n = ab.numberOfChannels, x = ab.getChannelData(0);
        if (n > 1) { var y = new Float32Array(x.length); for (var c = 0; c < n; c++) { var d = ab.getChannelData(c); for (var i = 0; i < y.length; i++) y[i] += d[i] / n; } x = y; }
        res(x);
      }, function (e) { rej(e || new Error('Não foi possível ler o áudio.')); });
      if (p && p.catch) p.catch(function () {});
    });
  }
  // divide um MP3 em partes de cerca de 90 s, cortadas na pausa mais silenciosa entre os 70 e os 110 s
  async function segmentarMp3(blob, q, base, desdeQuadro, aoSegmento, parar) {
    var a = desdeQuadro || 0;
    while (a < q.n && !parar()) {
      var S = q.t[a], b;
      if (q.dur - S <= JMAX + 5) b = q.n;
      else {
        var fa = indice(q, S + JMIN), fb = indice(q, S + JMAX), corte = null;
        try {
          var x = await decodificar(await blob.slice(q.off[fa], q.off[fb]).arrayBuffer());
          corte = q.t[fa] + silencio(x, 0, x.length) / SR;
        } catch (e) { corte = null; }
        b = indice(q, corte == null ? S + ALVO : corte);
        if (b <= a) b = indice(q, S + ALVO);
      }
      await aoSegmento({ ini: base + S, fim: base + q.t[b], b0: q.off[a], b1: q.off[b], qa: a, qb: b, durMp3: q.t[b] - S });
      a = b;
    }
  }

  /* ============================================================ ficheiros carregados */
  async function importar(file) {
    if (!C.licenciado()) return;
    var ehMp3 = /\.mp3$/i.test(file.name) || file.type === 'audio/mpeg';
    if (ehMp3) {
      var amostra = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer()), ok = 0;
      for (var o = 0; o < amostra.length - 4 && ok < 3; o++) { var h = cabecalho(amostra, o); if (h && cabecalho(amostra, o + h.len)) ok++; }
      ehMp3 = ok > 0;
    }
    var t = { id: novoId(), nome: file.name.replace(/\.[^.]+$/, ''), criado: Date.now(), origem: 'ficheiro', modo: ehMp3 ? 'mp3' : 'conv',
      ficheiro: { nome: file.name, tamanho: file.size, data: file.lastModified }, estado: 'carregado', duracao: 0, planoCompleto: false, pecas: [] };
    st.ficheiros[t.id] = file; st.segs[t.id] = [];
    st.trabalhos.unshift(t);
    await guardarTrabalho(t);
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    await abrir(t.id);
    if (motor() === 'nuvem' && !contaLigada()) { C.setStatus('trabStatus', 'Ligue a sua conta Cloudflare no separador «Conta de IA» e seleccione «Transcrever».', 'busy'); return; }
    processar(t);
  }
  function reabrirFicheiro(file) {
    var t = st.actual; if (!t || !t.ficheiro) return;
    if (file.size !== t.ficheiro.tamanho) { C.setStatus('trabStatus', 'Este ficheiro não é o mesmo («' + t.ficheiro.nome + '»): o tamanho é diferente.', 'err'); return; }
    st.ficheiros[t.id] = file;
    C.setStatus('trabStatus', '');
    mostrarTrabalho();
    processar(t);
  }

  // planeamento das partes de um ficheiro carregado (retoma onde ficou)
  async function planear(t, proc) {
    var segs = st.segs[t.id], file = st.ficheiros[t.id];
    var parar = function () { return proc.parar; };
    async function novo(base, s, extra) {
      var i = segs.length;
      var seg = Object.assign({ k: chave(t.id, i), tid: t.id, i: i, estado: 'pendente' }, s, extra);
      seg.ini = s.ini; seg.fim = s.fim;
      await guardarSeg(seg); segs.push(seg); acordar();
    }
    if (t.modo === 'mp3') {
      proc.fase = 'A analisar o ficheiro MP3…';
      var q = await lerQuadros(file, function (f) { proc.fase = 'A analisar o ficheiro MP3: ' + Math.round(f * 100) + '%'; progressoProc(); });
      if (!q.n) throw new Error('Não foram encontrados dados de áudio MP3 neste ficheiro.');
      t.duracao = q.dur; await guardarTrabalho(t);
      var ult = segs[segs.length - 1];
      proc.fase = '';
      await segmentarMp3(file, q, 0, ult ? ult.qb : 0, function (s) { return novo(0, s, { fonte: 'ficheiro' }); }, parar);
    } else {
      proc.fase = 'A preparar a leitura do ficheiro…'; progressoProc();
      var dec = await import('./decode.js');
      var m = await dec.openMedia(file);
      t.duracao = m.duration; await guardarTrabalho(t);
      var nPecas = Math.ceil(m.duration / PECA);
      // as partes da última peça incompleta são planeadas de novo
      var feitas = t.pecasPlaneadas || 0;
      if (segs.some(function (s) { return s.p >= feitas; })) { segs.splice(0); var todos = await segsDe(t.id); todos.filter(function (s) { return s.p < feitas; }).forEach(function (s) { segs.push(s); }); }
      for (var k = feitas; k < nPecas && !proc.parar; k++) {
        var ini = k * PECA, dur = Math.min(PECA, m.duration - ini);
        proc.fase = 'A converter o ficheiro: ' + hms(ini) + ' de ' + hms(m.duration); progressoProc();
        var bytes = await dec.convertPiece(m.path, ini, dur);
        await por('audio', { k: chave(t.id, 0) + ':p' + k, buf: bytes.buffer });
        var blob = new Blob([bytes], { type: 'audio/mpeg' });
        var q2 = await lerQuadros(blob);
        await segmentarMp3(blob, q2, ini, 0, function (s) { s.fim = Math.min(s.fim, ini + dur); s.ini = Math.min(s.ini, s.fim); return novo(ini, s, { fonte: 'peca', p: k }); }, function () { return false; });
        t.pecasPlaneadas = k + 1; (t.pecas = t.pecas || [])[k] = { ini: ini, durMp3: q2.dur }; await guardarTrabalho(t);
      }
      proc.fase = '';
    }
    if (!proc.parar) { t.planoCompleto = true; await guardarTrabalho(t); }
  }
  var pecasCache = {};
  async function audioDaParte(s) {
    if (s.fonte === 'seg') { var r = await obter('audio', s.k); if (!r) throw new Error('o áudio desta parte não foi encontrado neste aparelho'); return r.buf; }
    if (s.fonte === 'ficheiro') { var f = st.ficheiros[s.tid]; if (!f) throw new Error('seleccione de novo o ficheiro'); return f.slice(s.b0, s.b1).arrayBuffer(); }
    var kp = chave(s.tid, 0) + ':p' + s.p;
    if (!pecasCache[kp]) { var rp = await obter('audio', kp); if (!rp) throw new Error('a conversão desta parte não foi encontrada'); pecasCache = {}; pecasCache[kp] = rp.buf; }
    return pecasCache[kp].slice(s.b0, s.b1);
  }

  /* ============================================================ transcrição */
  function acordar() { if (st.proc && st.proc.acordar) { var f = st.proc.acordar; st.proc.acordar = null; f(); } }
  function esperar(ms) { return new Promise(function (r) { st.proc.acordar = r; setTimeout(function () { if (st.proc && st.proc.acordar === r) st.proc.acordar = null; r(); }, ms || 4000); }); }
  function progressoProc() {
    var p = st.proc; if (!p || !st.actual || st.actual.id !== p.tid) return;
    if (p.fase) C.setStatus('trabStatus', p.fase, 'busy');
    progressoGeral();
  }

  async function processar(t, duranteGravacao) {
    if (st.proc) { if (st.proc.tid !== t.id) C.setStatus('trabStatus', 'Já está em curso a transcrição de outra gravação. Aguarde que termine ou pare-a.', 'err'); return; }
    var m = motor();
    if (m === 'nuvem' && !contaLigada()) { C.setStatus('trabStatus', 'Ligue primeiro a sua conta Cloudflare gratuita no separador «Conta de IA».', 'err'); return; }
    var proc = st.proc = { tid: t.id, parar: false, motor: m, emVoo: 0, inicio: Date.now(), feitosSessao: 0, segSessao: 0, erroFatal: null, fase: '' };
    var segs = st.segs[t.id];
    segs.forEach(function (s) { if (s.estado === 'erro') { s.estado = 'pendente'; s.erro = null; } });
    mostrarTrabalho();
    C.setStatus('trabStatus', duranteGravacao ? 'A transcrição acompanha a gravação: cada parte é transcrita logo que fica guardada.' : 'A transcrever…', 'busy');
    var planeador = Promise.resolve();
    if (t.origem === 'ficheiro' && !t.planoCompleto) {
      planeador = planear(t, proc).catch(function (e) { proc.erroFatal = 'Não foi possível ler o ficheiro: ' + ((e && e.message) || e); proc.parar = true; acordar(); });
    }
    var planeando = true; planeador.then(function () { planeando = false; acordar(); });
    if (m === 'local') {
      try { await prepararLocal(proc); }
      catch (e) { proc.erroFatal = 'Não foi possível preparar a transcrição neste computador: ' + ((e && e.message) || e); proc.parar = true; }
    }
    function proxima() {
      for (var i = 0; i < segs.length; i++) { var s = segs[i]; if (s.estado === 'pendente' && !s.emVoo) return s; }
      return null;
    }
    function ativo() { return planeando || (st.grav && st.grav.tid === t.id); }
    async function trabalhador() {
      while (!proc.parar) {
        var s = proxima();
        if (!s) { if (!ativo() && !proc.emVoo) break; if (!ativo() && !segs.some(function (x) { return x.estado === 'pendente'; })) break; await esperar(); continue; }
        s.emVoo = true; proc.emVoo++;
        try {
          await transcreverParte(s, proc);
          s.estado = 'feito'; s.erro = null;
          proc.feitosSessao++; proc.segSessao += s.fim - s.ini;
          await guardarSeg(limpo(s));
        } catch (e) {
          var cod = e && e.codigo;
          if (cod === 'limite' || cod === 'credenciais' || cod === 'sem-conta') { proc.erroFatal = e.message; proc.parar = true; }
          else if (cod === 'rede') { proc.aviso = e.message; s.emVoo = false; proc.emVoo--; await dormir(15000); continue; }
          else { s.estado = 'erro'; s.erro = (e && e.message) || String(e); await guardarSeg(limpo(s)); }
        }
        s.emVoo = false; proc.emVoo--;
        proc.aviso = null;
        if (st.actual && st.actual.id === t.id) { desenhar(); progressoGeral(); if (!proc.fase) C.setStatus('trabStatus', estadoProc(t, proc), 'busy'); }
        listar();
      }
    }
    var n = m === 'nuvem' ? CONC_NUVEM : 1, lista = [];
    for (var k = 0; k < n; k++) lista.push(trabalhador());
    await Promise.all(lista);
    proc.parar = true; await planeador;
    st.proc = null;
    var feitos = segs.filter(function (s) { return s.estado === 'feito'; }).length, erros = segs.filter(function (s) { return s.estado === 'erro'; }).length;
    var msg, tipo = 'ok';
    if (proc.erroFatal) { msg = proc.erroFatal; tipo = 'err'; }
    else if (erros) { msg = 'Transcrição concluída, com ' + C.plural(erros, 'parte', 'partes') + ' por transcrever. Seleccione «Continuar a transcrição» para tentar de novo.'; tipo = 'err'; }
    else if (feitos === segs.length && (t.origem === 'gravacao' ? t.estado !== 'a gravar' : t.planoCompleto)) msg = 'Transcrição concluída: ' + duracaoTexto(t.duracao) + ' de áudio. Reveja o texto antes de o utilizar.';
    else msg = 'Transcrição interrompida. Seleccione «Continuar a transcrição» para prosseguir.';
    if (st.actual && st.actual.id === t.id) { mostrarTrabalho(); C.setStatus('trabStatus', msg, tipo); }
    listar(); espaco();
  }
  function estadoProc(t, proc) {
    if (proc.aviso) return proc.aviso;
    if (st.grav && st.grav.tid === t.id) return 'A transcrição acompanha a gravação: cada parte é transcrita logo que fica guardada.';
    return proc.motor === 'local' ? 'A transcrever neste computador. Mantenha esta janela aberta.' : 'A transcrever na sua conta Cloudflare. Mantenha esta janela aberta.';
  }
  function limpo(s) { var o = {}; Object.keys(s).forEach(function (k) { if (k !== 'emVoo') o[k] = s[k]; }); return o; }

  async function transcreverParte(s, proc) {
    var buf = await audioDaParte(s);
    var segs = st.segs[s.tid], ant = segs[s.i - 1];
    var contexto = ant && ant.estado === 'feito' ? (ant.partes || []).map(function (p) { return p.t; }).join(' ').slice(-220) : '';
    var partes = proc.motor === 'local' ? await transcreverLocal(buf, proc) : await transcreverNuvem(buf, contexto);
    s.partes = filtrar(partes).map(function (p) { return { s: +(s.ini + Math.max(0, p.s)).toFixed(2), e: +(s.ini + Math.max(0, p.e)).toFixed(2), t: C.grafia(p.t, true) }; });
  }
  var ALUCINACOES = /^(legendas?\s+(pela|por|da|de)\b.*|.*amara\.org.*|obrigad[oa]s?\s+por\s+(assistir|ver(em)?|terem?\s+assistido)\.?|inscreva-se.*|subscreva.*|♪+|\.+|-+)$/i;
  function repeticoes(t) {
    var out = t.replace(/\s+/g, ' ').trim();
    for (var n = 1; n <= 6; n++) out = out.replace(new RegExp('((?:\\S+\\s+){' + (n - 1) + '}\\S+)(?:\\s+\\1){3,}', 'gi'), '$1');
    return out;
  }
  function filtrar(partes) {
    return (partes || []).map(function (p) { return { s: p.s || 0, e: p.e || p.s || 0, t: repeticoes(String(p.t || '')) }; })
      .filter(function (p) { return p.t && !ALUCINACOES.test(p.t.trim()); });
  }

  function b64(buf) {
    var u = new Uint8Array(buf), s = '', P = 0x8000;
    for (var i = 0; i < u.length; i += P) s += String.fromCharCode.apply(null, u.subarray(i, i + P));
    return btoa(s);
  }
  function wav(x) {
    var n = x.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) { var y = Math.max(-1, Math.min(1, x[i])); v.setInt16(44 + i * 2, y < 0 ? y * 32768 : y * 32767, true); }
    return b;
  }
  function erro(msg, codigo) { var e = new Error(msg); e.codigo = codigo; return e; }
  async function pedirNuvem(audioB64, contexto) {
    var c = C.conta();
    if (!c.conta || !c.token) throw erro('Ligue primeiro a sua conta Cloudflare gratuita no separador «Conta de IA».', 'sem-conta');
    var prompt = 'Transcrição integral, em português europeu, de uma audiência, reunião ou diligência jurídica.' + (contexto ? ' ' + contexto : '');
    var corpo = '{"audio":"' + audioB64 + '","task":"transcribe","language":"pt","vad_filter":true,"condition_on_previous_text":false,"initial_prompt":' + JSON.stringify(prompt) + '}';
    var r, j;
    try {
      r = await fetch(PONTE, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cf-conta': c.conta, 'x-cf-token': c.token }, body: corpo });
    } catch (e) { throw erro('Sem ligação à internet. A transcrição continua quando a ligação voltar.', 'rede'); }
    try { j = await r.json(); } catch (e) { j = {}; }
    if (r.ok && j && Array.isArray(j.segmentos)) return j.segmentos;
    if (j.erro === 'credenciais') throw erro('A Cloudflare recusou o identificador da conta ou o token. Verifique-os no separador «Conta de IA».', 'credenciais');
    if (j.erro === 'limite') throw erro('Foi atingida a quota gratuita diária da sua conta Cloudflare (cerca de três horas e meia de áudio). O que já foi transcrito está guardado: a transcrição pode continuar a partir da meia-noite (hora de Lisboa no Inverno; 1h00 no Verão), seleccionando «Continuar a transcrição», ou de imediato, escolhendo «Neste computador, sem envio».', 'limite');
    if (j.erro === 'sem-conta') throw erro('Ligue primeiro a sua conta Cloudflare gratuita no separador «Conta de IA».', 'sem-conta');
    if (r.status >= 500 && r.status !== 502 || r.status === 0 || r.status === 408) throw erro('O serviço de IA está temporariamente indisponível. A tentar de novo…', 'rede');
    throw erro('o serviço de IA não aceitou esta parte (' + (j.detalhe || r.status) + ')', j.erro || 'modelo');
  }
  async function transcreverNuvem(buf, contexto) {
    var tentativas = 0;
    while (true) {
      try { return await pedirNuvem(b64(buf), contexto); }
      catch (e) {
        if (e.codigo === 'modelo' && !buf.__wav) {
          // alguns MP3 não são aceites tal como estão: envia a parte descodificada, em WAV
          var x = await decodificar(buf.slice(0)); var w = wav(x); w.__wav = true; buf = w; continue;
        }
        if (e.codigo === 'rede' && tentativas++ < 2) { await dormir(4000 * tentativas); continue; }
        throw e;
      }
    }
  }

  /* -------------------------------------------- transcrição neste computador */
  async function detectarGPU() {
    if (navigator.gpu) { try { var a = await navigator.gpu.requestAdapter(); if (a) return { device: 'webgpu', fp16: a.features.has('shader-f16') }; } catch (e) {} }
    return { device: 'wasm', fp16: false };
  }
  function configModelo(g) {
    var q = $('qualidade').value;
    if (g.device === 'webgpu') {
      if (q === 'max') return { model: 'onnx-community/whisper-large-v3-turbo', dtype: { encoder_model: 'q4', decoder_model_merged: 'q4' }, size: '760 MB' };
      return { model: 'onnx-community/whisper-small', dtype: { encoder_model: g.fp16 ? 'fp16' : 'fp32', decoder_model_merged: 'q4' }, size: g.fp16 ? '410 MB' : '590 MB' };
    }
    if (q === 'max') return { model: 'onnx-community/whisper-small', dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' }, size: '250 MB' };
    return { model: 'onnx-community/whisper-base', dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' }, size: '80 MB' };
  }
  function chamar(w, msg, aoProgresso) {
    return new Promise(function (res, rej) {
      w.onmessage = function (e) { var d = e.data; if (d.type === 'load-progress') { if (aoProgresso) aoProgresso(d); return; } if (d.type === 'error') rej(new Error(d.message)); else res(d); };
      w.postMessage(msg, msg.audio ? [msg.audio.buffer] : []);
    });
  }
  async function prepararLocal(proc) {
    var g = st.gpu || (st.gpu = await detectarGPU());
    var cfg = configModelo(g), k = cfg.model + JSON.stringify(cfg.dtype);
    if (st.local && st.local.k === k) { proc.local = st.local; return; }
    if (st.local) { try { st.local.w.terminate(); } catch (e) {} }
    var w = new Worker('asr-worker.js', { type: 'module' });
    proc.fase = 'A preparar o modelo de transcrição (na primeira utilização é descarregado, cerca de ' + cfg.size + ', e fica guardado neste aparelho)…'; progressoProc();
    await chamar(w, { type: 'load', config: { model: cfg.model, dtype: cfg.dtype, device: g.device, speakers: false } }, function (d) {
      proc.fase = 'A descarregar o modelo de transcrição: ' + Math.round(d.loaded / 1e6) + ' de ' + (d.total ? Math.round(d.total / 1e6) : '?') + ' MB'; progressoProc();
    });
    proc.fase = '';
    st.local = proc.local = { w: w, k: k };
  }
  async function transcreverLocal(buf, proc) {
    var x = await decodificar(buf.slice(0));
    var r = await chamar(proc.local.w, { type: 'chunk', id: 1, audio: x, offset: 0, prevSpeaker: null });
    return (r.segs || []).map(function (p) { return { s: p.start, e: p.end, t: p.text }; });
  }

  /* ============================================================ ouvir */
  async function prepararLeitor() {
    var t = st.actual, segs = st.segs[t.id] || [];
    if (st.leitor && st.leitor.tid === t.id && st.leitor.n === segs.length) return st.leitor;
    var url, mapa = [];
    if (t.origem === 'ficheiro' && t.modo === 'mp3') {
      var f = st.ficheiros[t.id]; if (!f) throw new Error('Para ouvir, seleccione de novo o ficheiro «' + t.ficheiro.nome + '».');
      url = URL.createObjectURL(f); mapa = null;
    } else if (t.origem === 'gravacao') {
      var partes = [], acum = 0;
      for (var i = 0; i < segs.length; i++) { var r = await obter('audio', segs[i].k); if (!r) continue; partes.push(r.buf); mapa.push({ ini: segs[i].ini, fim: segs[i].fim, leitor: acum }); acum += segs[i].durMp3 || (segs[i].fim - segs[i].ini); }
      url = URL.createObjectURL(new Blob(partes, { type: 'audio/mpeg' }));
    } else {
      var ps = [], ac = 0;
      for (var k = 0; k < (t.pecasPlaneadas || 0); k++) { var rp = await obter('audio', chave(t.id, 0) + ':p' + k); if (!rp) continue; ps.push(rp.buf); mapa.push({ ini: k * PECA, fim: (k + 1) * PECA, leitor: ac }); ac += (t.pecas && t.pecas[k] ? t.pecas[k].durMp3 : PECA); }
      url = URL.createObjectURL(new Blob(ps, { type: 'audio/mpeg' }));
    }
    if (st.leitor) { try { URL.revokeObjectURL(st.leitor.url); } catch (e) {} }
    st.leitor = { tid: t.id, n: segs.length, url: url, mapa: mapa };
    $('leitor').src = url; $('leitor').hidden = false;
    return st.leitor;
  }
  async function ouvir(tempo) {
    try {
      var l = await prepararLeitor(), pos = tempo;
      if (l.mapa) { for (var i = l.mapa.length - 1; i >= 0; i--) { if (tempo >= l.mapa[i].ini - 0.01) { pos = l.mapa[i].leitor + (tempo - l.mapa[i].ini); break; } } }
      var a = $('leitor');
      var ir = function () { try { a.currentTime = Math.max(0, pos - 0.3); } catch (e) {} a.play().catch(function () {}); };
      if (a.readyState >= 1) ir(); else { a.addEventListener('loadedmetadata', ir, { once: true }); a.load(); }
    } catch (e) { C.setStatus('trabStatus', e.message, 'err'); }
  }

  /* ============================================================ exportação e gestão */
  function exportarWord() {
    var t = st.actual; if (!t) return;
    var paras = [
      { text: t.nome, bold: true, size: 15, after: 60 },
      { text: dataTexto(t.criado) + (t.duracao ? '. Duração: ' + duracaoTexto(t.duracao) + '.' : ''), size: 10, color: '5C544F', after: 60 },
      { text: 'Transcrição automática, a rever antes de ser utilizada. A indicação entre parênteses rectos corresponde ao tempo decorrido desde o início da gravação.', size: 10, italic: true, color: '5C544F', after: 240 }
    ];
    textoCompleto(true).forEach(function (l) { paras.push({ text: l, size: 11, after: 140 }); });
    paras.push({ text: 'Ana Marta Soares, Especialista em IA aplicada ao Direito', size: 8, color: '8A817A', after: 0 });
    var bytes = window.DocxUtil.buildDocx(paras);
    C.descarregar(nomeFicheiro(t) + '.docx', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  }
  function exportarTxt() {
    var t = st.actual; if (!t) return;
    var txt = t.nome + '\n' + dataTexto(t.criado) + (t.duracao ? '. Duração: ' + duracaoTexto(t.duracao) + '.' : '') + '\n\n' + textoCompleto(true).join('\n\n') + '\n';
    C.descarregar(nomeFicheiro(t) + '.txt', new Blob([txt], { type: 'text/plain;charset=utf-8' }));
  }
  async function exportarMp3() {
    var t = st.actual; if (!t) return;
    try {
      var l = await prepararLeitor();
      var blob = await fetch(l.url).then(function (r) { return r.blob(); });
      C.descarregar(nomeFicheiro(t) + '.mp3', blob);
    } catch (e) { C.setStatus('trabStatus', e.message, 'err'); }
  }
  function copiar() {
    var txt = textoCompleto(true).join('\n\n');
    var ok = function () { C.setStatus('trabStatus', 'Transcrição copiada.', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok).catch(function () { manual(txt); ok(); });
    else { manual(txt); ok(); }
  }
  function manual(txt) { var a = document.createElement('textarea'); a.value = txt; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e) {} a.remove(); }
  function renomear() {
    var t = st.actual; if (!t) return;
    var n = pedirTexto('Nome da gravação (por exemplo, o processo e a diligência):', t.nome); if (!n) return;
    t.nome = n; guardarTrabalho(t).then(function () { listar(); mostrarTrabalho(); });
  }
  function apagar() {
    var t = st.actual; if (!t) return;
    if (st.grav && st.grav.tid === t.id) { C.setStatus('trabStatus', 'Termine primeiro a gravação.', 'err'); return; }
    if (st.proc && st.proc.tid === t.id) { C.setStatus('trabStatus', 'Pare primeiro a transcrição.', 'err'); return; }
    if (!confirmar('Apagar «' + t.nome + '», o áudio e a transcrição, deste aparelho?')) return;
    apagarTudo(t.id).then(function () {
      st.trabalhos = st.trabalhos.filter(function (x) { return x.id !== t.id; });
      delete st.segs[t.id]; delete st.ficheiros[t.id];
      st.actual = null; C.setStatus('trabStatus', '');
      if (st.trabalhos[0]) abrir(st.trabalhos[0].id); else { listar(); mostrarTrabalho(); }
      espaco();
    });
  }

  window.__transcricao = { st: st, lerQuadros: lerQuadros, segmentarMp3: segmentarMp3, silencio: silencio, filtrar: filtrar, quadrosMp3: quadrosMp3 };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
