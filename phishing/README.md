# Alerta Phishing

Suplemento para o Outlook e extensão para o Gmail e para o webmail da Ordem dos Advogados (webmail.oa.pt) que analisam a mensagem aberta e avisam quando apresenta sinais de fraude.
A análise é feita no computador de quem utiliza: nenhuma mensagem é enviada para fora dele.

- `motor.js`: motor de análise (remetente, domínios que imitam entidades, ligações, endereço de resposta, autenticação, anexos, conteúdo).
- `vista.js` e `estilo.css`: apresentação do resultado, comum às duas versões.
- `licenca.js`: verificação do código de activação (produto 14 do gerador de códigos).
- `outlook/`: painel e manifesto do suplemento do Outlook.
- `eml.js`: leitura de mensagens no formato original (MIME); usada no webmail da Ordem, que fornece o código-fonte da mensagem com os cabeçalhos.
- `gmail/extensao/`: extensão para o Chrome, o Edge e o Brave, que funciona no Gmail (`conteudo.js`) e no webmail da Ordem dos Advogados (`oa.js`, Roundcube). Depois de alterar `motor.js`, `eml.js`, `vista.js`, `licenca.js` ou `estilo.css`, copiá-los para esta pasta e refazer `instalar/alerta-phishing-gmail.zip`.
- `testes.js`: testes do motor, da leitura de mensagens (`testes-eml/`) e da licença (`node testes.js`).

Ana Marta Soares, Especialista em IA aplicada ao Direito.
