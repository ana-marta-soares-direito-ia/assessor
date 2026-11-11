# Alerta Phishing

Suplemento para o Outlook e extensão para o Gmail que analisam a mensagem aberta e avisam quando apresenta sinais de fraude.
A análise é feita no computador de quem utiliza: nenhuma mensagem é enviada para fora dele.

- `motor.js`: motor de análise (remetente, domínios que imitam entidades, ligações, endereço de resposta, autenticação, anexos, conteúdo).
- `vista.js` e `estilo.css`: apresentação do resultado, comum às duas versões.
- `licenca.js`: verificação do código de activação (produto 14 do gerador de códigos).
- `outlook/`: painel e manifesto do suplemento do Outlook.
- `gmail/extensao/`: extensão para o Chrome, o Edge e o Brave. Depois de alterar `motor.js`, `vista.js`, `licenca.js` ou `estilo.css`, copiá-los para esta pasta e refazer `instalar/alerta-phishing-gmail.zip`.
- `testes.js`: testes do motor e da licença (`node testes.js`).

Ana Marta Soares, Especialista em IA aplicada ao Direito.
