/*
 * Alerta Phishing: motor de análise de mensagens de correio electrónico.
 * Funciona no próprio aparelho: recebe os dados da mensagem aberta e devolve os sinais de fraude encontrados.
 * Nenhuma mensagem é enviada para fora do computador.
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 */
'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AlertaPhishing = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // Sufixos com dois níveis, para identificar o domínio registado (por exemplo, exemplo.gov.pt).
  var SUFIXOS2 = ['gov.pt', 'com.pt', 'org.pt', 'edu.pt', 'net.pt', 'nome.pt', 'publ.pt', 'int.pt', 'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'com.br', 'gov.br', 'org.br', 'net.br',
    'com.es', 'org.es', 'gob.es', 'co.ao', 'gov.ao', 'co.mz', 'gov.mz', 'com.au', 'co.jp', 'com.mx', 'com.ar', 'com.tr', 'com.cn', 'co.in', 'co.za', 'gov.cv', 'com.cv'];

  // Entidades cuja identidade é mais usada em fraudes dirigidas a juristas em Portugal.
  // nome: como a entidade aparece no nome do remetente ou no assunto; dominios: os domínios oficiais; marcas: formas usadas em domínios falsos.
  var ENTIDADES = [
    { id: 'oa', nome: 'Ordem dos Advogados', re: /\bordem\s+dos\s+advogados\b|\bconselho\s+(geral|regional|superior|de\s+deontologia)\b.*\badvogados\b|\bCPAS\b|\bcaixa\s+de\s+previd[êe]ncia\s+dos\s+advogados\b/i, dominios: ['oa.pt', 'cpas.org.pt'], marcas: ['ordemdosadvogados', 'ordemadvogados', 'ordem-advogados', 'ordem-dos-advogados', 'oa-pt', 'portal-oa', 'cpas-'] },
    { id: 'osae', nome: 'Ordem dos Solicitadores e dos Agentes de Execução', re: /\bordem\s+dos\s+solicitadores\b|\bOSAE\b/i, dominios: ['osae.pt'], marcas: ['osae-', '-osae', 'ordemdossolicitadores'] },
    { id: 'notarios', nome: 'Ordem dos Notários', re: /\bordem\s+dos\s+not[áa]rios\b/i, dominios: ['notarios.pt'], semDistancia: true, marcas: ['ordemdosnotarios', 'ordem-notarios'] },
    { id: 'at', nome: 'Autoridade Tributária e Aduaneira', re: /\bautoridade\s+tribut[áa]ria\b|\bportal\s+das\s+finan[çc]as\b|\bfinan[çc]as\s*-\s*AT\b|\bAT\s*-\s*autoridade\b/i, dominios: ['portaldasfinancas.gov.pt', 'at.gov.pt', 'gov.pt'], marcas: ['portaldasfinancas', 'portal-das-financas', 'portalfinancas', 'financas-gov', 'at-gov', 'atgov'] },
    { id: 'ss', nome: 'Segurança Social', re: /\bseguran[çc]a\s+social\b/i, dominios: ['seg-social.pt', 'gov.pt'], marcas: ['seg-social', 'segsocial', 'seguranca-social', 'segurancasocial'] },
    { id: 'justica', nome: 'Ministério da Justiça, tribunais e Citius', re: /\bcitius\b|\bminist[ée]rio\s+da\s+justi[çc]a\b|\bIGFEJ\b|\btribunal\s+(judicial|administrativo|da\s+rela[çc][ãa]o|de\s+comarca)\b/i, dominios: ['mj.pt', 'tribunais.org.pt', 'justica.gov.pt', 'gov.pt', 'ministeriopublico.pt', 'csm.org.pt', 'pgdlisboa.pt'], marcas: ['citius', 'tribunais-org', 'justica-gov', 'igfej'] },
    { id: 'ctt', nome: 'CTT', re: /\bCTT\b|\bcorreios\s+de\s+portugal\b/i, dominios: ['ctt.pt', 'cttexpresso.pt'], marcas: ['ctt-', '-ctt', 'cttexpresso', 'ctt-expresso', 'cttpt'] },
    { id: 'cgd', nome: 'Caixa Geral de Depósitos', re: /\bcaixa\s+geral\s+de\s+dep[óo]sitos\b|\bcaixadirecta\b|\bCGD\b/i, dominios: ['cgd.pt'], marcas: ['caixadirecta', 'caixa-directa', 'cgd-', '-cgd', 'cgdpt'] },
    { id: 'bcp', nome: 'Millennium bcp', re: /\bmillennium\s*bcp\b|\bmillenniumbcp\b/i, dominios: ['millenniumbcp.pt'], marcas: ['millenniumbcp', 'millennium-bcp', 'milleniumbcp', 'millenium-bcp'] },
    { id: 'novobanco', nome: 'novobanco', re: /\bnovo\s*banco\b/i, dominios: ['novobanco.pt'], marcas: ['novobanco', 'novo-banco'] },
    { id: 'santander', nome: 'Santander', re: /\bsantander\b/i, dominios: ['santander.pt', 'santander.com', 'santanderconsumer.pt', 'santandertotta.pt', 'santander.co.uk', 'bancosantander.es'], marcas: ['santander'] },
    { id: 'bpi', nome: 'Banco BPI', re: /\bbanco\s+BPI\b|\bBPI\s+net\b/i, dominios: ['bancobpi.pt'], marcas: ['bancobpi', 'banco-bpi', 'bpinet', 'bpi-net'] },
    { id: 'montepio', nome: 'Banco Montepio', re: /\bmontepio\b/i, dominios: ['bancomontepio.pt', 'montepio.org', 'montepio.pt', 'montepiocredito.pt'], marcas: ['montepio'] },
    { id: 'ca', nome: 'Crédito Agrícola', re: /\bcr[ée]dito\s+agr[íi]cola\b/i, dominios: ['creditoagricola.pt'], marcas: ['creditoagricola', 'credito-agricola'] },
    { id: 'mbway', nome: 'MB WAY e SIBS', re: /\bMB\s*WAY\b|\bmultibanco\b|\bSIBS\b/i, dominios: ['mbway.pt', 'sibs.com', 'sibs.pt', 'multibanco.pt'], marcas: ['mbway', 'mb-way', 'multibanco', 'sibs-'] },
    { id: 'edp', nome: 'EDP', re: /\bEDP\b/i, dominios: ['edp.pt', 'edp.com'], marcas: ['edp-', '-edp', 'edpcomercial', 'edponline'] },
    { id: 'microsoft', nome: 'Microsoft', re: /\bmicrosoft\b|\boffice\s*365\b|\bmicrosoft\s*365\b|\boutlook\s+(team|support|suporte)\b|\bsharepoint\b|\bonedrive\b/i, dominios: ['microsoft.com', 'office.com', 'office365.com', 'microsoftonline.com', 'sharepoint.com', 'outlook.com', 'outlook.pt', 'hotmail.com', 'live.com', 'msn.com', 'onedrive.com', 'microsoft365.com', 'azure.com', 'office.net', 'sharepointonline.com', 'onmicrosoft.com', 'microsoftstore.com', 'windows.com', 'skype.com', 'bing.com', 'xbox.com', 'outlook.office.com'], marcas: ['microsoft', 'office365', 'office-365', 'outlook-', 'sharepoint', 'onedrive', 'micros0ft', 'rnicrosoft'] },
    { id: 'google', nome: 'Google', re: /\bgoogle\b|\bgmail\s+(team|support|suporte|equipa)\b/i, dominios: ['google.com', 'gmail.com', 'googlemail.com', 'google.pt', 'youtube.com', 'goo.gl', 'googleusercontent.com', 'googleapis.com', 'withgoogle.com', 'gstatic.com', 'googlegroups.com', 'google.es', 'google.co.uk', 'google.com.br', 'google.fr', 'google.de'], marcas: ['google', 'gmail-', 'g00gle', 'googIe'] },
    { id: 'paypal', nome: 'PayPal', re: /\bpaypal\b/i, dominios: ['paypal.com', 'paypal.pt', 'paypal.me'], marcas: ['paypal', 'paypa1', 'pay-pal'] },
    { id: 'docusign', nome: 'DocuSign', re: /\bdocusign\b/i, dominios: ['docusign.com', 'docusign.net', 'docusign.eu'], marcas: ['docusign', 'docu-sign'] },
    { id: 'dhl', nome: 'DHL', re: /\bDHL\b/i, dominios: ['dhl.com', 'dhl.pt', 'dhl.de'], marcas: ['dhl-', '-dhl', 'dhlexpress'] }
  ];

  var WEBMAIL = ['gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'outlook.pt', 'live.com', 'live.com.pt', 'yahoo.com', 'yahoo.com.br', 'sapo.pt', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com',
    'gmx.com', 'gmx.net', 'mail.com', 'yandex.com', 'yandex.ru', 'zoho.com', 'msn.com', 'iol.pt', 'netcabo.pt', 'mail.ru', 'tutanota.com', 'tuta.io'];
  var ENCURTADORES = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at', 'tiny.cc', 'rb.gy', 't.ly', 'lnkd.in', 's.id', 'qr.ae', 'urlz.fr', 'v.gd', 'bl.ink', 'short.io'];
  var TLD_SUSPEITOS = ['zip', 'mov', 'top', 'xyz', 'click', 'link', 'icu', 'cyou', 'cfd', 'sbs', 'rest', 'quest', 'monster', 'buzz', 'tk', 'ml', 'ga', 'cf', 'gq', 'work', 'support', 'live', 'shop', 'online', 'site', 'website', 'ru', 'su', 'cn', 'pw', 'cam', 'bond', 'lol'];
  var EXT_EXECUTAVEIS = ['exe', 'scr', 'com', 'pif', 'bat', 'cmd', 'js', 'jse', 'vbs', 'vbe', 'wsf', 'wsh', 'hta', 'ps1', 'msi', 'msix', 'jar', 'lnk', 'iso', 'img', 'vhd', 'vhdx', 'cab', 'dll', 'reg', 'appx', 'apk', 'chm', 'cpl'];
  var EXT_HTML = ['html', 'htm', 'shtml', 'xhtml', 'svg', 'mht', 'mhtml'];
  var EXT_MACROS = ['docm', 'xlsm', 'pptm', 'dotm', 'xlam', 'xlsb', 'one'];
  var EXT_ARQUIVOS = ['zip', 'rar', '7z', 'gz', 'tar', 'ace', 'arj', 'z'];
  // Serviços de envio de boletins, que reescrevem as ligações para contar os cliques: a diferença entre o texto e o destino é normal.
  var CONTADORES = ['sendgrid.net', 'list-manage.com', 'mailchimp.com', 'mcsv.net', 'e-goi.com', 'egoiapp.com', 'hubspotlinks.com', 'hubspotemail.net', 'hs-sites.com', 'mailjet.com', 'mjt.lu', 'sendinblue.com', 'brevo.com', 'sibforms.com', 'rs6.net', 'constantcontact.com', 'exct.net', 'awstrack.me', 'mandrillapp.com', 'sparkpostmail.com', 'klclick.com', 'createsend.com', 'cmail19.com', 'cmail20.com', 'activehosted.com', 'acemlnb.com', 'mailerlite.com', 'mlsend.com', 'getresponse.com', 'gr8.com', 'campaign-archive.com', 'emltrk.com', 'pstmrk.it', 'customeriomail.com', 'linkedin.com', 'substack.com', 'beehiiv.com'];
  var PARTILHA = ['sharepoint.com', 'onedrive.com', 'live.com', 'office.com', 'microsoft.com', 'google.com', 'dropbox.com', 'box.com', 'wetransfer.com', 'we.tl', 'docusign.com', 'docusign.net', 'adobe.com', 'adobesign.com', 'icloud.com'];

  function minus(s) { return String(s == null ? '' : s).toLowerCase().trim(); }
  function semAcentos(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  /** Extrai o endereço de e-mail de um texto como «Nome <a@b.pt>». */
  function endereco(s) {
    var m = String(s || '').match(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return m ? m[0].toLowerCase() : '';
  }
  function dominioDe(email) { var e = endereco(email); return e ? e.split('@')[1] : ''; }

  /** Domínio registado: de «login.cgd.pt» devolve «cgd.pt»; de «a.b.gov.pt» devolve «b.gov.pt». */
  function registado(host) {
    host = minus(host).replace(/\.$/, '');
    if (!host || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.indexOf(':') >= 0) return host;
    var p = host.split('.');
    if (p.length <= 2) return host;
    var dois = p.slice(-2).join('.');
    if (SUFIXOS2.indexOf(dois) >= 0) return p.slice(-3).join('.');
    return dois;
  }
  function pertence(host, dominio) { host = minus(host); return host === dominio || host.slice(-(dominio.length + 1)) === '.' + dominio; }
  function oficial(host, ent) { return ent.dominios.some(function (d) { return pertence(host, d); }); }

  /** Distância de edição entre duas palavras (Levenshtein). */
  function distancia(a, b) {
    if (a === b) return 0;
    var m = a.length, n = b.length, i, j;
    if (!m) return n; if (!n) return m;
    var ant = [], act = [];
    for (j = 0; j <= n; j++) ant[j] = j;
    for (i = 1; i <= m; i++) {
      act = [i];
      for (j = 1; j <= n; j++) act[j] = Math.min(ant[j] + 1, act[j - 1] + 1, ant[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      ant = act;
    }
    return act[n];
  }
  /** Desfaz as trocas de caracteres mais usadas para imitar um domínio (0 por o, 1 por l, rn por m, vv por w). */
  function semDisfarce(s) { return minus(s).replace(/0/g, 'o').replace(/[1!|]/g, 'l').replace(/3/g, 'e').replace(/5/g, 's').replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/[-_]/g, ''); }

  /** Verifica se um domínio imita o de uma entidade conhecida. Devolve a entidade imitada ou null. */
  function imita(host) {
    host = minus(host);
    if (!host) return null;
    var reg = registado(host), etiqueta = reg.split('.')[0];
    for (var i = 0; i < ENTIDADES.length; i++) {
      var ent = ENTIDADES[i];
      if (oficial(host, ent)) return null;
    }
    for (i = 0; i < ENTIDADES.length; i++) {
      ent = ENTIDADES[i];
      for (var k = 0; k < ent.marcas.length; k++) {
        var marca = ent.marcas[k];
        if (host.indexOf(marca) >= 0 || semDisfarce(host).indexOf(semDisfarce(marca)) >= 0 && semDisfarce(marca).length >= 6) return ent;
      }
      for (k = 0; k < ent.dominios.length; k++) {
        var of = ent.dominios[k];
        if (of === 'gov.pt') continue;
        var etOf = of.split('.')[0];
        if (etOf.length >= 7 && !ent.semDistancia) {
          var d = distancia(etiqueta, etOf), dd = distancia(semDisfarce(etiqueta), semDisfarce(etOf));
          if ((d > 0 && d <= (etOf.length >= 9 ? 2 : 1)) || (dd === 0 && etiqueta !== etOf)) return ent;
        }
        // o domínio oficial usado como subdomínio de outro (por exemplo, cgd.pt.acesso-seguro.com)
        if (host.indexOf(of + '.') === 0 || host.indexOf('.' + of + '.') >= 0) return ent;
      }
    }
    return null;
  }

  /** Lê um URL e devolve as suas partes; desfaz as ligações reescritas pelos filtros do correio. */
  function lerUrl(href) {
    href = String(href || '').trim();
    if (!/^https?:/i.test(href)) return null;
    try {
      var u = new URL(href), h = u.hostname.toLowerCase(), alvo;
      if (/\.safelinks\.protection\.outlook\.com$/.test(h)) alvo = u.searchParams.get('url');
      else if (h === 'www.google.com' && u.pathname === '/url') alvo = u.searchParams.get('q') || u.searchParams.get('url');
      else if (/(^|\.)urldefense\.(proofpoint\.)?com$/.test(h)) { var m = href.match(/__(https?:.*?)__;/); if (m) alvo = m[1]; else alvo = u.searchParams.get('u'); }
      if (alvo && /^https?:/i.test(alvo)) return lerUrl(alvo);
      return { href: href, host: h, reg: registado(h), protocolo: u.protocol, caminho: u.pathname + u.search, credenciais: !!(u.username || u.password) };
    } catch (e) { return null; }
  }
  /** Se o texto visível de uma ligação for um endereço, devolve o seu domínio. */
  function dominioNoTexto(t) {
    t = minus(t).replace(/\s+/g, '');
    var m = t.match(/^(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[\/:?#]|$)/);
    return m ? m[1] : '';
  }
  function extensoes(nome) { var p = minus(nome).split('.'); return p.length > 1 ? p.slice(1) : []; }

  var RE_URGENCIA = /\b(urgente|imediat[ao]|imediatamente|[úu]ltimo\s+aviso|aviso\s+final|nas\s+pr[óo]ximas\s+\d+\s+horas|dentro\s+de\s+\d+\s+horas|em\s+24\s*h(oras)?|em\s+48\s*h(oras)?|expira\s+(hoje|amanh[ãa]|em\s+breve)|ser[áa]\s+(suspens[ao]|bloquead[ao]|encerrad[ao]|desactivad[ao]|desativad[ao]|eliminad[ao]|cancelad[ao])|foi\s+(suspens[ao]|bloquead[ao]|limitad[ao])|evite\s+a\s+suspens[ãa]o|ac[çc][ãa]o\s+necess[áa]ria|action\s+required|immediately|will\s+be\s+(suspended|closed|deactivated|deleted)|final\s+notice|within\s+24\s+hours)\b/i;
  var RE_CREDENCIAIS = /\b(confirm(e|ar)\s+(os\s+seus\s+dados|a\s+sua\s+(conta|identidade|palavra-passe|senha))|valid(e|ar)\s+(a\s+sua\s+conta|os\s+seus\s+dados|o\s+seu\s+(acesso|e-?mail))|verifi(que|car)\s+a\s+sua\s+(conta|identidade)|actualiz(e|ar)\s+(os\s+seus\s+dados|a\s+sua\s+(conta|palavra-passe))|atualiz(e|ar)\s+(os\s+seus\s+dados|a\s+sua\s+(conta|palavra-passe|senha))|introduza\s+(a\s+sua\s+palavra-passe|as\s+suas\s+credenciais|o\s+c[óo]digo)|palavra-passe\s+(expir|caduc)|a\s+sua\s+senha\s+(expir|caduc)|credenciais\s+de\s+acesso|reactiv(e|ar)\s+a\s+sua\s+conta|reativ(e|ar)\s+a\s+sua\s+conta|caixa\s+de\s+correio\s+(est[áa]\s+)?(cheia|quase\s+cheia)|quota\s+de\s+(correio|armazenamento)|verify\s+your\s+(account|identity|password)|confirm\s+your\s+(account|password|identity)|password\s+(expires|will\s+expire|has\s+expired)|mailbox\s+(is\s+)?(full|almost\s+full)|sign\s+in\s+to\s+(view|keep|verify))\b/i;
  var RE_PAGAMENTO = /\b(pagamento\s+(pendente|em\s+atraso|recusado|n[ãa]o\s+efectuado|n[ãa]o\s+efetuado)|regulariz(e|ar)\s+(a\s+sua\s+situa[çc][ãa]o|o\s+pagamento|a\s+d[íi]vida)|d[íi]vida\s+(fiscal|pendente|em\s+execu[çc][ãa]o)|reembolso\s+(de\s+IRS|dispon[íi]vel|pendente|a\s+seu\s+favor)|tem\s+direito\s+a\s+um\s+reembolso|quotas?\s+em\s+atraso|taxa\s+(alfandeg[áa]ria|de\s+desalfandegamento|de\s+entrega)|encomenda\s+(retida|em\s+espera|n[ãa]o\s+entregue)|altera[çc][ãa]o\s+de\s+IBAN|novo\s+IBAN|novos\s+dados\s+banc[áa]rios|transfer[êe]ncia\s+urgente|cart[õo]es?\s+(presente|oferta)|gift\s+cards?|refund|overdue\s+(invoice|payment)|wire\s+transfer|updated\s+bank\s+details)\b/i;
  var RE_PARTILHA = /\b(partilhou\s+(um|uma|o|a)\s+(documento|ficheiro|pasta)|documento\s+(seguro|partilhado|confidencial)\s+(para|consigo|dispon[íi]vel)|ver\s+(o\s+)?documento|aceder\s+ao\s+documento|rever\s+(o\s+)?documento|nova\s+mensagem\s+de\s+voz|recebeu\s+um\s+fax|documento\s+para\s+assina(r|tura)|shared\s+a\s+(document|file|folder)\s+with\s+you|view\s+(shared\s+)?document|secure\s+document|new\s+voicemail|review\s+and\s+sign)\b/i;

  /** Interpreta os cabeçalhos técnicos da mensagem (quando o programa de correio os disponibiliza). */
  function lerCabecalhos(txt) {
    var r = { spf: '', dkim: '', dmarc: '', replyTo: '', returnPath: '' };
    if (!txt) return r;
    var t = String(txt).replace(/\r?\n[ \t]+/g, ' ');
    var linhas = t.split(/\r?\n/), ar = [];
    linhas.forEach(function (l) {
      var m = l.match(/^([A-Za-z-]+):\s*(.*)$/);
      if (!m) return;
      var k = m[1].toLowerCase(), v = m[2];
      if (k === 'authentication-results' || k === 'arc-authentication-results') ar.push(v);
      else if (k === 'reply-to' && !r.replyTo) r.replyTo = endereco(v);
      else if (k === 'return-path' && !r.returnPath) r.returnPath = endereco(v);
      else if (k === 'received-spf' && !r.spf) { var s = v.match(/^\s*(pass|fail|softfail|neutral|none|temperror|permerror)/i); if (s) r.spf = s[1].toLowerCase(); }
    });
    var a = ar.length ? ar[0] : '';
    ['spf', 'dkim', 'dmarc'].forEach(function (k) { var m = a.match(new RegExp('\\b' + k + '=([a-z]+)', 'i')); if (m) r[k] = m[1].toLowerCase(); });
    return r;
  }

  /**
   * Analisa uma mensagem.
   * msg: { deNome, deEmail, responderPara, para[], assunto, texto, ligacoes[{texto, href}], anexos[nome], cabecalhos (texto), confianca[] }
   * Devolve { nivel: 'alto' | 'medio' | 'baixo', pontos, sinais[{id, peso, titulo, detalhe}], resumo }
   */
  function analisar(msg) {
    msg = msg || {};
    var sinais = [];
    function sinal(id, peso, titulo, detalhe) { if (!sinais.some(function (s) { return s.id === id; })) sinais.push({ id: id, peso: peso, titulo: titulo, detalhe: detalhe }); }
    var deEmail = endereco(msg.deEmail), deDom = deEmail.split('@')[1] || '', deReg = registado(deDom);
    var deNome = String(msg.deNome || '').replace(/[<>"]/g, ' ').trim();
    var cab = lerCabecalhos(msg.cabecalhos);
    var responder = endereco(msg.responderPara) || cab.replyTo;
    var assunto = String(msg.assunto || ''), texto = String(msg.texto || '');
    var conf = (msg.confianca || []).map(minus);
    var deConfianca = !!deEmail && (conf.indexOf(deEmail) >= 0 || conf.indexOf(deDom) >= 0);

    // 1. Autenticação do remetente (registada pelo servidor de correio que recebeu a mensagem)
    if (cab.dmarc === 'fail') sinal('dmarc', 45, 'A mensagem falhou a verificação de autenticidade do remetente', 'O servidor de correio registou que a mensagem não passou na verificação DMARC do domínio ' + (deDom || 'indicado') + '. É o que acontece quando alguém usa um endereço que não lhe pertence.');
    if (cab.spf === 'fail' || cab.spf === 'softfail') sinal('spf', 20, 'O servidor que enviou a mensagem não está autorizado pelo domínio do remetente', 'A verificação SPF devolveu «' + cab.spf + '».');
    if (cab.dkim === 'fail') sinal('dkim', 20, 'A assinatura digital da mensagem não é válida', 'A verificação DKIM falhou: a mensagem pode ter sido alterada ou não vem de quem diz.');

    // 2. O nome do remetente invoca uma entidade, mas o endereço não é dela
    if (deEmail && !deConfianca) {
      for (var i = 0; i < ENTIDADES.length; i++) {
        var ent = ENTIDADES[i];
        if (ent.re.test(deNome) && !oficial(deDom, ent)) {
          var webmail = WEBMAIL.indexOf(deReg) >= 0 || WEBMAIL.indexOf(deDom) >= 0;
          if (ent.id === 'microsoft' && /^(microsoftexchange|postmaster|mailer-daemon)/.test(deEmail)) break; // avisos automáticos de entrega
          sinal('entidade', webmail ? 65 : 55, 'O remetente apresenta-se como «' + ent.nome + '», mas o endereço não pertence a essa entidade',
            'A mensagem vem de ' + deEmail + '. Os endereços oficiais desta entidade terminam em ' + ent.dominios.filter(function (d) { return d !== 'gov.pt'; }).slice(0, 3).join(', ') + '.' + (webmail ? ' Uma entidade oficial não escreve a partir de uma conta de correio gratuita.' : ''));
          break;
        }
      }
    }
    // 3. O domínio do remetente imita o de uma entidade conhecida
    var im = deDom ? imita(deDom) : null;
    if (im) sinal('imitacao', 60, 'O endereço do remetente imita o da entidade «' + im.nome + '»', 'O domínio ' + deDom + ' é parecido com o oficial, mas não é o mesmo. Verifique letra a letra.');

    // 4. O nome mostra um endereço e o endereço real é outro
    var noNome = endereco(deNome);
    if (noNome && deEmail && noNome !== deEmail) sinal('nome-endereco', 40, 'O nome do remetente mostra um endereço diferente do endereço real', 'O nome apresenta ' + noNome + ', mas a mensagem foi enviada de ' + deEmail + '.');

    // 5. A resposta segue para outro domínio
    if (responder && deEmail && registado(responder.split('@')[1]) !== deReg && !deConfianca) {
      var rWeb = WEBMAIL.indexOf(registado(responder.split('@')[1])) >= 0;
      sinal('responder', rWeb && WEBMAIL.indexOf(deReg) < 0 ? 30 : 20, 'A resposta a esta mensagem não vai para quem a enviou', 'A mensagem vem de ' + deEmail + ', mas uma resposta seria enviada para ' + responder + '.');
    }

    // 6. Ligações
    var ligs = (msg.ligacoes || []).slice(0, 300), hostsFora = [];
    ligs.forEach(function (l) {
      var u = lerUrl(l.href);
      if (!u) return;
      var visivel = dominioNoTexto(l.texto);
      if (visivel && registado(visivel) !== u.reg && CONTADORES.indexOf(u.reg) < 0) sinal('ligacao-diferente', 35, 'Uma ligação mostra um endereço e leva a outro', 'O texto mostra ' + visivel + ', mas a ligação abre ' + u.host + '.');
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(u.host)) sinal('ligacao-ip', 35, 'Uma ligação aponta para um endereço numérico em vez de um sítio com nome', 'A ligação abre ' + u.host + '. Os sítios legítimos usam um nome de domínio.');
      if (u.host.indexOf('xn--') >= 0) sinal('ligacao-punycode', 30, 'Uma ligação usa caracteres especiais para imitar um endereço', 'O domínio ' + u.host + ' contém caracteres que parecem letras normais e não são.');
      if (u.credenciais) sinal('ligacao-arroba', 30, 'Uma ligação esconde o destino verdadeiro atrás de um «@»', 'No endereço ' + u.href.slice(0, 80) + ', o destino real é o que está depois do «@».');
      var li = imita(u.host);
      if (li) sinal('ligacao-imitacao', 50, 'Uma ligação leva a um endereço que imita o da entidade «' + li.nome + '»', 'A ligação abre ' + u.host + ', que não é um endereço oficial.');
      if (ENCURTADORES.indexOf(u.reg) >= 0 || ENCURTADORES.indexOf(u.host) >= 0) sinal('ligacao-curta', 15, 'A mensagem usa uma ligação encurtada, que esconde o destino', 'A ligação ' + u.host + u.caminho.slice(0, 20) + ' não permite ver para onde leva.');
      var tld = u.host.split('.').pop();
      if (TLD_SUSPEITOS.indexOf(tld) >= 0 && u.reg !== deReg) sinal('ligacao-tld', 15, 'Uma ligação usa uma terminação de domínio frequente em fraudes', 'A ligação abre ' + u.host + '.');
      if (u.reg !== deReg) hostsFora.push(u);
    });

    // 7. Conteúdo
    var corpo = assunto + '\n' + texto, corpoSem = semAcentos(corpo);
    var urg = RE_URGENCIA.test(corpo) || RE_URGENCIA.test(corpoSem), cred = RE_CREDENCIAIS.test(corpo) || RE_CREDENCIAIS.test(corpoSem), pag = RE_PAGAMENTO.test(corpo) || RE_PAGAMENTO.test(corpoSem);
    if (cred) sinal('credenciais', 20, 'A mensagem pede que confirme a conta, os dados ou a palavra-passe', 'Nenhuma entidade séria pede credenciais por correio electrónico. Em caso de dúvida, entre no sítio oficial escrevendo o endereço no navegador.');
    if (pag) sinal('pagamento', 15, 'A mensagem fala de pagamentos, dívidas, reembolsos ou dados bancários', 'Confirme por outro meio, por exemplo por telefone para um número que já conhecia, antes de pagar ou de alterar um IBAN.');
    if (urg) sinal('urgencia', 15, 'A mensagem cria pressão para agir depressa', 'A urgência é a técnica mais usada para impedir que a pessoa verifique o que lhe pedem.');
    // entidade invocada no texto, com ligação para fora dos seus domínios e pedido de credenciais ou pagamento
    if ((cred || pag) && hostsFora.length) {
      for (i = 0; i < ENTIDADES.length; i++) {
        ent = ENTIDADES[i];
        if (ent.re.test(corpo) && !oficial(deDom, ent) && hostsFora.some(function (u) { return !oficial(u.host, ent); }) && !deConfianca) {
          sinal('entidade-texto', 25, 'A mensagem invoca «' + ent.nome + '», mas não vem dessa entidade nem liga aos seus endereços', 'O remetente é ' + (deEmail || 'desconhecido') + ' e as ligações abrem ' + hostsFora[0].host + '.');
          break;
        }
      }
    }
    if (RE_PARTILHA.test(corpo) || RE_PARTILHA.test(corpoSem)) {
      var fora = hostsFora.filter(function (u) { return !PARTILHA.some(function (d) { return pertence(u.host, d); }); });
      if (fora.length) sinal('partilha', 25, 'A mensagem convida a abrir um documento partilhado num endereço que não é de um serviço conhecido', 'A ligação abre ' + fora[0].host + '. É o padrão usado quando a conta de um colega foi invadida: confirme com ele por telefone antes de abrir.');
    }

    // 8. Anexos
    (msg.anexos || []).forEach(function (nome) {
      var ex = extensoes(nome), ult = ex[ex.length - 1] || '';
      if (EXT_EXECUTAVEIS.indexOf(ult) >= 0) sinal('anexo-programa', 55, 'A mensagem traz um anexo que é um programa', 'O ficheiro «' + nome + '» pode executar instruções no computador. Não o abra.');
      else if (ex.length >= 2 && /^(pdf|doc|docx|xls|xlsx|jpg|png|txt)$/.test(ex[ex.length - 2]) && (EXT_EXECUTAVEIS.indexOf(ult) >= 0 || EXT_HTML.indexOf(ult) >= 0)) sinal('anexo-duplo', 50, 'Um anexo disfarça o seu verdadeiro tipo com duas extensões', 'O ficheiro «' + nome + '» parece um documento, mas não é.');
      else if (EXT_HTML.indexOf(ult) >= 0) sinal('anexo-html', 30, 'A mensagem traz um anexo que abre uma página no navegador', 'O ficheiro «' + nome + '» é uma página. É um meio frequente de apresentar um falso ecrã de início de sessão.');
      else if (EXT_MACROS.indexOf(ult) >= 0) sinal('anexo-macros', 25, 'A mensagem traz um documento que pode conter macros', 'O ficheiro «' + nome + '» pode executar instruções ao ser aberto. Não active as macros.');
      else if (EXT_ARQUIVOS.indexOf(ult) >= 0) sinal('anexo-arquivo', 10, 'A mensagem traz um ficheiro comprimido', 'O conteúdo de «' + nome + '» não é visível sem o abrir. Confirme com o remetente o que contém.');
    });

    var pontos = sinais.reduce(function (a, s) { return a + s.peso; }, 0);
    sinais.sort(function (a, b) { return b.peso - a.peso; });
    var nivel = pontos >= 55 ? 'alto' : pontos >= 25 ? 'medio' : 'baixo';
    var resumo = nivel === 'alto' ? 'Esta mensagem tem sinais fortes de fraude. Não clique nas ligações, não abra os anexos e não responda.'
      : nivel === 'medio' ? 'Esta mensagem tem sinais que pedem cuidado. Confirme a origem por outro meio antes de clicar, abrir anexos ou responder.'
        : sinais.length ? 'Foram encontrados apenas sinais ligeiros, que por si só não indicam fraude. Mantenha a atenção habitual.'
          : 'Não foram encontrados sinais de fraude nesta mensagem. A análise não substitui a sua atenção: uma mensagem enviada de uma conta verdadeira que foi invadida pode não apresentar sinais.';
    return { nivel: nivel, pontos: pontos, sinais: sinais, resumo: resumo, remetente: { nome: deNome, email: deEmail, dominio: deDom }, autenticacao: { spf: cab.spf, dkim: cab.dkim, dmarc: cab.dmarc } };
  }

  /** Extrai as ligações de um corpo em HTML (usado no Outlook, onde o corpo é entregue como texto HTML). */
  function ligacoesDeHtml(html) {
    var r = [];
    if (typeof DOMParser === 'undefined') {
      String(html || '').replace(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi, function (_, a, b, t) { r.push({ href: (a || b || '').replace(/&amp;/g, '&'), texto: t.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim() }); });
      return r;
    }
    var d = new DOMParser().parseFromString(String(html || ''), 'text/html');
    Array.prototype.forEach.call(d.querySelectorAll('a[href]'), function (a) { r.push({ href: a.getAttribute('href'), texto: (a.textContent || '').trim() }); });
    return r;
  }

  return { analisar: analisar, lerCabecalhos: lerCabecalhos, ligacoesDeHtml: ligacoesDeHtml, registado: registado, imita: imita, lerUrl: lerUrl, endereco: endereco, ENTIDADES: ENTIDADES, VERSAO: '1.0.0' };
});
