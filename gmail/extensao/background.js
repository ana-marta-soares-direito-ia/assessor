// Assessor para Gmail: abre o painel lateral ao seleccionar o ícone da extensão ou o botão Assessor do Gmail.
'use strict';
function comportamento() {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {});
}
function abrirJanela() {
  chrome.windows.create({ url: chrome.runtime.getURL('sidepanel.html'), type: 'popup', width: 440, height: 820 });
}
chrome.runtime.onInstalled.addListener(comportamento);
chrome.runtime.onStartup.addListener(comportamento);
if (!chrome.sidePanel) chrome.action.onClicked.addListener(abrirJanela);
chrome.runtime.onMessage.addListener(function (m, s) {
  if (!m || m.tipo !== 'abrir' || !s.tab) return;
  if (chrome.sidePanel && chrome.sidePanel.open) chrome.sidePanel.open({ windowId: s.tab.windowId }).catch(abrirJanela);
  else abrirJanela();
});
