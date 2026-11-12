// Alerta Phishing (Gmail e webmail da Ordem dos Advogados): abre a página de activação depois da instalação e a pedido da faixa apresentada no Gmail.
'use strict';
chrome.runtime.onInstalled.addListener(function (d) { if (d.reason === 'install') chrome.runtime.openOptionsPage(); });
chrome.runtime.onMessage.addListener(function (m) { if (m && m.tipo === 'opcoes') chrome.runtime.openOptionsPage(); });
