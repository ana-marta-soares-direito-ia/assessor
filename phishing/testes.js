// Alerta Phishing: testes do motor de análise e da verificação de licença. Correr com: node testes.js
'use strict';
const A = require('./motor.js');
global.nacl = undefined;
let falhas = 0, total = 0;
function caso(nome, msg, esperado, ids) {
  total++;
  const r = A.analisar(msg), tem = r.sinais.map(s => s.id);
  const ok = r.nivel === esperado && (ids || []).every(i => tem.includes(i));
  if (!ok) { falhas++; console.log('FALHA  ' + nome + ' -> ' + r.nivel + ' (' + r.pontos + ') ' + tem.join(',')); }
}
// Fraudes
caso('Ordem dos Advogados a partir de conta gratuita', { deNome: 'Ordem dos Advogados', deEmail: 'ordem.advogados.pt@gmail.com', assunto: 'Quotas em atraso', texto: 'Regularize a sua situação nas próximas 24 horas.', ligacoes: [{ texto: 'Pagar agora', href: 'https://oa-pt.pagamentos-seguros.com/q' }] }, 'alto', ['entidade', 'ligacao-imitacao']);
caso('Conselho Regional falso', { deNome: 'Conselho Regional de Lisboa da Ordem dos Advogados', deEmail: 'geral@crl-oa.org', assunto: 'Actualização da cédula', texto: 'Valide os seus dados para manter a inscrição activa.', ligacoes: [{ texto: 'portal.oa.pt', href: 'https://portal-oa.cedula-validar.com/' }] }, 'alto', ['entidade', 'ligacao-diferente']);
caso('Banco com ligação numérica', { deNome: 'CGD', deEmail: 'info@cgd-seguranca.com', assunto: 'Aviso', texto: 'A sua conta será bloqueada. Confirme os seus dados.', ligacoes: [{ texto: 'https://www.cgd.pt/login', href: 'http://185.22.11.9/cgd' }] }, 'alto', ['imitacao', 'ligacao-ip', 'ligacao-diferente']);
caso('Finanças falsas', { deNome: 'Portal das Finanças', deEmail: 'reembolso@portaldasfinancas-gov.com', assunto: 'Reembolso de IRS disponível', texto: 'Tem direito a um reembolso. Confirme os seus dados.', ligacoes: [{ texto: 'Aceder', href: 'https://portaldasfinancas-gov.com/r' }] }, 'alto', ['imitacao']);
caso('Remetente falsificado com falha de autenticação', { deNome: 'Maria Costa', deEmail: 'maria@escritorio.pt', assunto: 'Factura', texto: 'Segue a factura. Novo IBAN em anexo.', cabecalhos: 'Authentication-Results: mx.google.com; dkim=none; spf=fail smtp.mailfrom=x.ru; dmarc=fail header.from=escritorio.pt\nReply-To: maria.costa.adv@gmail.com', anexos: ['factura.pdf.html'] }, 'alto', ['dmarc', 'responder', 'anexo-duplo']);
caso('Programa em anexo', { deNome: 'Tribunal', deEmail: 'x@y.pt', assunto: 'Notificação', texto: 'Ver anexo', anexos: ['notificacao.pdf.exe'] }, 'alto', ['anexo-programa']);
caso('Microsoft falsa com caixa cheia', { deNome: 'Microsoft 365', deEmail: 'no-reply@m365-quota-alerts.com', assunto: 'A sua caixa de correio está cheia', texto: 'A sua caixa de correio está quase cheia. Valide a sua conta para evitar a suspensão.', ligacoes: [{ texto: 'Validar agora', href: 'https://login-microsoftonline.com.verify-id.xyz/' }] }, 'alto', ['entidade', 'credenciais']);
caso('Nome com endereço diferente', { deNome: 'joao.silva@silvaadvogados.pt', deEmail: 'js8842@outlook.com', assunto: 'Urgente', texto: 'Preciso de uma transferência urgente hoje.', }, 'alto', ['nome-endereco']);
caso('CTT com taxa de entrega', { deNome: 'CTT Expresso', deEmail: 'entregas@ctt-envios.online', assunto: 'Encomenda retida', texto: 'A sua encomenda retida aguarda o pagamento da taxa de entrega.', ligacoes: [{ texto: 'Pagar 1,99 €', href: 'https://ctt-envios.online/p' }] }, 'alto', ['entidade', 'pagamento']);
caso('Colega com conta invadida: documento partilhado em endereço estranho', { deNome: 'João Silva', deEmail: 'joao.silva@silvaadvogados.pt', assunto: 'Documento', texto: 'João Silva partilhou um documento seguro consigo. Ver documento', ligacoes: [{ texto: 'Ver documento', href: 'https://docs-secure-share.web.app/x' }] }, 'medio', ['partilha']);
caso('Ligação que mostra um sítio e abre outro', { deNome: 'Apoio', deEmail: 'apoio@empresa-x.pt', assunto: 'Factura', texto: 'Consulte a factura.', ligacoes: [{ texto: 'www.empresa-x.pt/factura', href: 'https://pagamentos-rapidos.net/f' }] }, 'medio', ['ligacao-diferente']);
caso('Ligação reescrita pelo filtro do Outlook que leva a imitação', { deNome: 'Banco', deEmail: 'a@b.pt', assunto: 'x', texto: 'x', ligacoes: [{ texto: 'Entrar', href: 'https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fmillenniurnbcp.pt%2Flogin&data=x' }] }, 'medio', ['ligacao-imitacao']);
// Mensagens legítimas
caso('Ordem dos Advogados verdadeira', { deNome: 'Conselho Regional de Lisboa da Ordem dos Advogados', deEmail: 'formacao@crl.oa.pt', assunto: 'Formação contínua', texto: 'Inscrições abertas.', ligacoes: [{ texto: 'Inscrever', href: 'https://crl.oa.pt/formacao' }] }, 'baixo');
caso('Colega com peça em anexo', { deNome: 'João Silva', deEmail: 'joao.silva@silvaadvogados.pt', assunto: 'Processo 123/24', texto: 'Caro colega, junto a contestação.', anexos: ['contestacao.pdf'] }, 'baixo');
caso('Boletim com contador de cliques', { deNome: 'Advocatus', deEmail: 'news@advocatus.pt', assunto: 'Newsletter', texto: 'As notícias da semana', ligacoes: [{ texto: 'www.advocatus.pt', href: 'https://advocatus.us1.list-manage.com/track/click?u=1' }] }, 'baixo');
caso('Reunião do Teams com ligação reescrita', { deNome: 'Microsoft Teams', deEmail: 'noreply@email.teams.microsoft.com', assunto: 'Reunião', texto: 'Tem uma reunião', ligacoes: [{ texto: 'Entrar', href: 'https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fteams.microsoft.com%2Fl%2Fmeetup&data=x' }] }, 'baixo');
caso('Aviso automático de entrega', { deNome: 'Microsoft Outlook', deEmail: 'MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e@escritorio.pt', assunto: 'Não entregue', texto: 'Não foi possível entregar a mensagem.' }, 'baixo');
caso('Autoridade Tributária verdadeira', { deNome: 'Autoridade Tributária e Aduaneira', deEmail: 'noreply@at.gov.pt', assunto: 'Aviso', texto: 'Consulte o Portal das Finanças.', ligacoes: [{ texto: 'www.portaldasfinancas.gov.pt', href: 'https://www.portaldasfinancas.gov.pt/' }] }, 'baixo');
caso('Citius verdadeiro', { deNome: 'Citius', deEmail: 'noreply@tribunais.org.pt', assunto: 'Notificação electrónica', texto: 'Foi disponibilizada uma notificação.', ligacoes: [{ texto: 'https://citius.tribunaisnet.mj.pt', href: 'https://citius.tribunaisnet.mj.pt/' }], cabecalhos: 'Authentication-Results: mx.google.com; dkim=pass; spf=pass; dmarc=pass' }, 'baixo');
caso('Cliente com pedido de reunião', { deNome: 'Ana Pereira', deEmail: 'ana.pereira@gmail.com', assunto: 'Reunião', texto: 'Boa tarde, podemos reunir na quinta-feira? Envio o contrato em anexo.', anexos: ['contrato.docx'] }, 'baixo');
caso('Partilha verdadeira no OneDrive', { deNome: 'Rui Matos', deEmail: 'rui@matosadvogados.pt', assunto: 'Peças', texto: 'Rui Matos partilhou uma pasta consigo.', ligacoes: [{ texto: 'Abrir', href: 'https://matosadvogados-my.sharepoint.com/:f:/g/x' }] }, 'baixo');
caso('Remetente marcado como de confiança', { deNome: 'Ordem dos Advogados', deEmail: 'boletim@parceiro-oa.pt', assunto: 'Boletim', texto: 'Notícias', confianca: ['boletim@parceiro-oa.pt'] }, 'baixo');
// Funções auxiliares
function igual(nome, a, b) { total++; if (a !== b) { falhas++; console.log('FALHA  ' + nome + ': ' + a + ' em vez de ' + b); } }
igual('domínio registado simples', A.registado('login.cgd.pt'), 'cgd.pt');
igual('domínio registado gov.pt', A.registado('www.portaldasfinancas.gov.pt'), 'portaldasfinancas.gov.pt');
igual('não imita: soaptest.com', A.imita('soaptest.com'), null);
igual('não imita: santanderconsumer.pt', A.imita('santanderconsumer.pt'), null);
igual('não imita: domínio de cliente da Microsoft', A.imita('escritorio.onmicrosoft.com'), null);
igual('não imita: notarias.pt', A.imita('notarias.pt'), null);
igual('imita: rnicrosoft.com', !!A.imita('rnicrosoft.com'), true);
igual('imita: oficial usado como subdomínio', !!A.imita('cgd.pt.acesso.com'), true);
igual('cabeçalhos: endereço de resposta', A.lerCabecalhos('From: a@b.pt\nReply-To: "X" <c@d.com>\nAuthentication-Results: mx; spf=pass; dkim=pass; dmarc=fail').replyTo, 'c@d.com');
igual('cabeçalhos: dmarc', A.lerCabecalhos('Authentication-Results: spf=pass (sender IP is 1.2.3.4)\n smtp.mailfrom=b.pt; dkim=pass; dmarc=bestguesspass action=none').dmarc, 'bestguesspass');
igual('ligações de HTML', A.ligacoesDeHtml('<p><a href="https://a.pt/x?a=1&amp;b=2">a.pt</a></p>')[0].href, 'https://a.pt/x?a=1&b=2');
// Licença
const nacl = require('/home/claude/assessor/phishing/nacl-fast.min.js');
const Mod = require('module'); const orig = Mod._load; Mod._load = function (r) { return r === 'tweetnacl' ? nacl : orig.apply(this, arguments); };
const L = require('./licenca.js');
igual('licença: vazio', L.verificar('').ok, false);
igual('licença: formato', L.verificar('COFRE-abc').motivo, 'O código não está no formato correcto. Deve começar por AMS-.');
igual('licença: alterado', L.verificar('AMS-AmYAAAEAALp3UmtP96DEoRZravIMtww42yJ6tANE18NJqd3zFz5M2BTH6IuFL2cv5bY8piVFt1T5ALznVDr_RJsHWhbg9AX').ok, false);
igual('licença: código verdadeiro de outro produto', L.verificar('AMS-AmYAAAEAALp3UmtP96DEoRZravIMtww42yJ6tANE18NJqd3zFz5M2BTH6IuFL2cv5bY8piVFt1T5ALznVDr_RJsHWhbg9AM').motivo, 'Este código é de outra ferramenta ou de um curso.');
console.log(total + ' testes, ' + falhas + ' falhas');
process.exit(falhas ? 1 : 0);
