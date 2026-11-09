/*
 * Cofre de Anonimização para Word: motor local de detecção e substituição.
 * Ana Marta Soares, Especialista em IA aplicada ao Direito.
 * Todo o processamento ocorre no computador do utilizador. Este ficheiro não
 * efectua qualquer comunicação de rede.
 */
'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AnonEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  /* ---------------------------------------------------------------- util */
  function norm(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  function wordSet(str) {
    var s = new Set();
    str.split(/[\s,]+/).forEach(function (w) { if (w) s.add(norm(w)); });
    return s;
  }
  function phraseSet(str) {
    var s = new Set();
    str.split('|').forEach(function (w) { w = w.trim(); if (w) s.add(norm(w)); });
    return s;
  }

  /* ------------------------------------------------------------- tipos */
  var TYPES = {
    PESSOA:          { label: 'PESSOA',          name: 'Pessoas singulares',                       priority: 4 },
    ENTIDADE:        { label: 'ENTIDADE',        name: 'Sociedades e outras pessoas colectivas',   priority: 5 },
    NIF:             { label: 'NIF',             name: 'Números de identificação fiscal',          priority: 8 },
    NIPC:            { label: 'NIPC',            name: 'Números de pessoa colectiva',              priority: 8 },
    CC:              { label: 'CC',              name: 'Cartão de cidadão e bilhete de identidade', priority: 9 },
    NISS:            { label: 'NISS',            name: 'Números de segurança social',              priority: 9 },
    PASSAPORTE:      { label: 'PASSAPORTE',      name: 'Passaportes',                              priority: 9 },
    CEDULA:          { label: 'CEDULA',          name: 'Cédulas profissionais',                    priority: 9 },
    IBAN:            { label: 'IBAN',            name: 'IBAN e NIB',                               priority: 10 },
    EMAIL:           { label: 'EMAIL',           name: 'Endereços de correio electrónico',         priority: 10 },
    TELEFONE:        { label: 'TELEFONE',        name: 'Números de telefone',                      priority: 7 },
    MORADA:          { label: 'MORADA',          name: 'Moradas',                                  priority: 6 },
    CODIGO_POSTAL:   { label: 'CODIGO_POSTAL',   name: 'Códigos postais e localidades',            priority: 6 },
    MATRICULA:       { label: 'MATRICULA',       name: 'Matrículas de veículos',                   priority: 7 },
    DATA_NASCIMENTO: { label: 'DATA_NASCIMENTO', name: 'Datas de nascimento',                      priority: 8 },
    PROCESSO:        { label: 'PROCESSO',        name: 'Números de processo',                      priority: 8 },
    IMOVEL:          { label: 'PREDIO',          name: 'Identificação de prédios (matriz e registo)', priority: 8 },
    TERMO:           { label: 'TERMO',           name: 'Termos acrescentados manualmente',         priority: 11 }
  };
  var TYPE_ORDER = ['PESSOA', 'ENTIDADE', 'NIF', 'NIPC', 'CC', 'NISS', 'PASSAPORTE', 'CEDULA', 'IBAN',
    'EMAIL', 'TELEFONE', 'MORADA', 'CODIGO_POSTAL', 'MATRICULA', 'DATA_NASCIMENTO', 'PROCESSO', 'IMOVEL', 'TERMO'];

  /* ---------------------------------------------------------- léxicos */
  var FIRST = wordSet(
    'Abel Abílio Adão Adelino Adolfo Adriano Afonso Agostinho Aires Albano Alberto Albino Alcides Alexandre Alexandrino Alfredo Álvaro Amadeu Amândio Américo Amílcar Anacleto Anselmo António Antônio Arlindo Armando Armindo Arnaldo Artur Augusto Aurélio Baltazar Bartolomeu Belmiro Benjamim Benedito Bento Bernardino Bernardo Brás Bruno Caetano Cândido Carlos Casimiro Celestino César Cipriano Cláudio Constantino Cristiano Cristóvão Custódio Daniel Dário David Davide Delfim Diamantino Diogo Dinis Domingos Duarte Edgar Edmundo Eduardo Elias Elísio Emanuel Emídio Emílio Ernesto Estêvão Eugénio Eurico Evaristo Fabiano Fábio Fausto Feliciano Felisberto Félix Fernando Filipe Firmino Flávio Florentino Francisco Frederico Gabriel Gaspar Gervásio Gilberto Gonçalo Gregório Guilherme Gustavo Heitor Hélder Hélio Henrique Herculano Hermínio Hernâni Horácio Hugo Humberto Inácio Isaac Isaías Ismael Ivo Jacinto Jaime Jerónimo Joaquim Joel Jorge José Josué João Juliano Júlio Justino Lauro Leandro Leonardo Leonel Leopoldo Lino Lourenço Lucas Luciano Lúcio Luís Luiz Manuel Marcelo Marcelino Marco Marcos Mário Martim Mateus Matias Mauro Maximiliano Miguel Moisés Nélson Nelson Nicolau Norberto Nuno Octávio Olavo Orlando Óscar Osvaldo Pascoal Patrício Paulo Pedro Quirino Raimundo Rafael Raul Reinaldo Renato Ricardo Roberto Rodolfo Rodrigo Rogério Rolando Romeu Ronaldo Rúben Rui Salomão Samuel Sandro Sebastião Sérgio Severino Silvestre Silvino Simão Teodoro Tiago Timóteo Tomás Tomé Tristão Ulisses Valdemar Valentim Valter Walter Vasco Venâncio Vicente Victor Vítor Vitorino Wilson Xavier Zacarias Zeferino ' +
    'Enzo Kevin Edson Elton Igor Ivan Jairo Kléber Wagner Wellington Cristian Christian Michael John Peter Paul Thomas James William Robert Richard Hans Pierre Jean Ahmed Mohamed Mohammed Ali Yuri Dmitri Andrei Sergei Alex Max ' +
    'Ada Adelaide Adélia Adriana Ágata Albertina Alda Alexandra Alice Aline Alzira Amália Amélia Ana Anabela Andreia Ângela Antónia Arminda Aurora Bárbara Beatriz Benedita Berta Bianca Branca Bruna Camila Cândida Carla Carlota Carmen Carminda Carolina Cassilda Catarina Cecília Célia Celeste Clara Clarisse Cláudia Constança Cristina Custódia Daniela Débora Deolinda Diana Dina Dora Doroteia Dulce Edite Elisa Elisabete Elsa Elvira Emília Ermelinda Estela Ester Eugénia Eva Fabiana Fernanda Filipa Filomena Flávia Florbela Francisca Gabriela Gisela Glória Graciete Guilhermina Helena Hélia Henriqueta Hermínia Hortense Idalina Inês Irene Isabel Isaura Iolanda Ivone Jaqueline Jéssica Joana Joaquina Josefa Josefina Judite Júlia Juliana Kátia Larissa Laura Leonor Lara Leopoldina Letícia Lídia Lília Liliana Lina Lúcia Luísa Luiza Luciana Lurdes Madalena Mafalda Manuela Marcela Margarida Maria Mariana Marina Marisa Marta Matilde Mélanie Michelle Mónica Natália Natércia Nádia Noémia Noémi Odete Olga Olinda Olívia Palmira Patrícia Paula Priscila Raquel Rebeca Regina Rita Rosália Rosana Rute Sabrina Salomé Sandra Sara Silvana Sílvia Simone Sofia Sónia Susana Tânia Teresa Tatiana Telma Thaís Valentina Vanda Vanessa Vera Verónica Virgínia Vitória Viviana Yara Zélia Zulmira Nathalie Sophie Anne Marie Julia Emma Kelly Cátia Catia Daniele Rosa Glória'
  );
  // nomes próprios que coincidem com palavras correntes: não iniciam, por si, um nome
  var NOSTART = wordSet('Glória Graça Luz Dores Conceição Rosário Fé Vitória Branca Clara Rosa Salvador Santiago Marco');

  var SURN = wordSet(
    'Silva Santos Ferreira Pereira Oliveira Costa Rodrigues Martins Jesus Sousa Fernandes Gonçalves Gomes Lopes Marques Alves Almeida Ribeiro Pinto Carvalho Teixeira Moreira Correia Mendes Nunes Soares Vieira Monteiro Cardoso Rocha Neves Coelho Cruz Cunha Pires Ramos Reis Simões Antunes Matos Fonseca Machado Araújo Barbosa Tavares Lourenço Castro Figueiredo Azevedo Freitas Henriques Lima Miranda Batista Baptista Faria Brito Magalhães Melo Mello Morais Moura Nascimento Pinheiro Sá Sampaio Valente Vaz Xavier Abreu Amaral Andrade Barros Borges Branco Brandão Cabral Campos Carneiro Carreira Coutinho Couto Dias Duarte Esteves Farinha Franco Garcia Guerra Guerreiro Leal Leite Loureiro Macedo Maia Marinho Matias Medeiros Menezes Meneses Mota Noronha Nogueira Paiva Patrício Paixão Pacheco Quintas Queirós Rebelo Resende Santana Seabra Seixas Serrano Silveira Simão Tomé Torres Trindade Valadares Vasconcelos Veloso Viana Vidal Viegas Calado Salgado Sequeira Sobral Lobo Fontes Cordeiro Gaspar Galvão Godinho Gouveia Guimarães Jardim Lacerda Lemos Lucas Mesquita Moniz Mourão Neto Novais Pimentel Portela Prates Quaresma Rato Raposo Ventura Vilela Bastos Bettencourt Botelho Brás Bravo Caldeira Camacho Canelas Carmo Carrilho Casimiro Catarino Cerqueira Cid Dantas Domingues Estrela Falcão Feijó Félix Fialho Frade Frazão Freire Gama Grilo Inácio Janeiro Jordão Justino Leitão Louro Madeira Malheiro Mateus Medina Mendonça Moita Morgado Nobre Pais Peixoto Pestana Prata Proença Rego Sardinha Seco Sena Serra Sobreira Sottomayor Teles Toscano Vale Varela Vasques Vicente Ferraz Ramalho Rangel Ruivo Sarmento Sobrinho Fidalgo Fragoso Lamas Lança Madureira Magro Mata Pedrosa Penha Pena Pombo Quintela Relvas Salvado Semedo Tomás Vitorino Albuquerque Alvarenga Assunção Ávila Barreto Barroso Belo Bento Bezerra Cabrita Caetano Campelo Canhoto Castelo Cavaco Chaves Damas Delgado Dinis Diniz Eusébio Feio Figueira Filipe Flores Furtado Gil Graça Guedes Honorato Jacinto Laranjeira Lago Lino Malta Marçal Martinho Meira Messias Miguel Mira Natário Pardal Pedro Pegado Pimenta Quintino Rafael Romão Saldanha Salvador Sanches Serafim Soeiro Rosa Luz Rosário Conceição Paz Calado Amorim Aragão Arruda Barata Beirão Bessa Cabaço Calhau Capela Carrasco Carriço Coimbra Cortez Crespo Durão Espírito Fragata Frias Gago Garrido Gaio Gonzaga Gusmão Horta Jorge Lameiras Leão Lucena Lustosa Machado Maltez Mansos Marcelino Matoso Mexia Milheiro Mourato Neiva Ornelas Osório Palma Pato Pimentão Pinho Pinheiro Pontes Quental Rebocho Ribas Roque Rua Russo Salazar Santiago Sardo Seara Severino Taborda Tojal Valadas Valério Valverde Varejão Veiga Xisto Zagalo Antão Bernardes Brandão Carmona Coito Cotrim Fernandez Ferro Fortes Gameiro Gouveia Grácio Infante Lagos Lobato Mano Morgado Mascarenhas Nóbrega Oleiro Penedo Pessoa Pinto Pitta Raimundo Rezende Rijo Rolo Rufino Sá Santo Seixas Sotto Tenreiro Vargas Vila Vilaça Vinhas Ximenes'
  );
  ['porto', 'evora', 'sintra', 'lisboa', 'braga', 'coimbra'].forEach(function (w) { SURN.delete(w); });

  var TITLES = wordSet(
    'Sr Sra Srª Senhor Senhora Dr Dra Drª Doutor Doutora Eng Engª Engenheiro Engenheira Arq Arqª Arquitecto Arquiteto Arquitecta Arquiteta Prof Profª Professor Professora D Dª Dona Exmo Exma Exmª Exmos Exmas Ilmo Ilma Excelentíssimo Excelentíssima Mestre Coronel Major Capitão Tenente Alferes Sargento Cabo General Brigadeiro Almirante Comandante Comodoro Padre Pe Frei Irmã Madre'
  );
  var ROLES = wordSet(
    'Autor Autora Autores Autoras Ré Réu Rés Réus Requerente Requerentes Requerido Requerida Requeridos Requeridas Exequente Executado Executada Executados Arguido Arguida Arguidos Testemunha Testemunhas Recorrente Recorrido Recorrida Embargante Embargado Embargada Assistente Ofendido Ofendida Interveniente Menor Cliente Trabalhador Trabalhadora Senhorio Senhoria Arrendatário Arrendatária Inquilino Inquilina Comprador Compradora Vendedor Vendedora Mutuante Mutuário Mutuária Promitente Outorgante Outorgantes Primeiro Segundo Terceiro Primeira Segunda Terceira Herdeiro Herdeira Cônjuge Falecido Falecida Inventariado Inventariada Insolvente Credor Credora Devedor Devedora Fiador Fiadora Participante Denunciante Denunciado Denunciada Lesado Lesada Sinistrado Sinistrada Segurado Segurada Tomador Beneficiário Beneficiária Presidente Juiz Juíza Juízes Procurador Procuradora Ministro Ministra Director Directora Diretor Diretora Secretário Secretária Vereador Vereadora Bastonário Bastonária Deputado Deputada Provedor Provedora Inspector Inspectora Inspetor Inspetora Agente Comissário Notário Notária Conservador Conservadora Advogado Advogada Advogados Solicitador Solicitadora Mandatário Mandatária Mandatários Administrador Administradora Gerente Gerentes Sócio Sócia Chefe Meritíssimo Meritíssima Venerando Veneranda Colendo Mmo Mma Ilustre Caro Cara Prezado Prezada Querido Querida'
  );
  var LEAD_STOP = wordSet(
    'A O As Os Ao Aos À Às No Na Nos Nas Pelo Pela Pelos Pelas Um Uma Este Esta Estes Estas Esse Essa Aquele Aquela Cujo Cuja Que Se Em Com Por Para Entre Sobre Contra Mas Assim Ainda Também Depois Antes Quando Porque Pois Logo Então Também Nem Ou Já Até Desde Segundo Conforme Atento Atenta Visto Vista Termos Nestes Nesses Neste Nesse Nesta Nessa Dado Dada Face Sendo Tendo Mais Menos Muito Cada Todos Todas Tal Tais Sua Seu Suas Seus Sr Sra Exmo Exma Doc Docs Documento Anexo Assinado Assinatura Junta Juntam Requer Requerem Vem Vêm Nota Data Local Lugar Hoje Ex Exa Excelência Mui Digníssimo Digníssima Douto Douta Sociedade Empresa Firma Entidade Denominada Denominado Designada Designado'
  );
  var BLOCK = wordSet(
    'Tribunal Tribunais Juízo Juízos Supremo Ministério Câmara Junta Assembleia Conservatória Cartório Hospital Centro Escola Universidade Faculdade Instituto Direcção Direção Autoridade Agência Banco Caixa Código Lei Leis Decreto Portaria Regulamento Artigo Artigos Estado República Região Município Freguesia Concelho Comarca Distrito Igreja Santa Santo São Nossa Rua Avenida Praça Largo Travessa Estrada Alameda Polícia Guarda Serviço Serviços Secretaria Gabinete Conselho Comissão Ordem Associação Fundação Federação Sindicato Partido Governo Europa União Portugal Lisboa Porto Coimbra Braga Faro Setúbal Aveiro Leiria Madeira Açores Constituição Directiva Diretiva Regulamento Acórdão Sentença Despacho Petição Contestação Réplica Recurso Processo Proc Exmo Exma Senhoria Excelência Plataforma Programa Plano Projecto Projeto Fundo Agrupamento Tesouraria Finanças Autoridade Segurança Social Inspecção Inspeção Comando Esquadra Posto Quartel Paróquia Casa Palácio Museu Teatro Parque Jardim Mercado Edifício Torre Bloco Loja Sala Piso Andar'
  );
  var PLACES = phraseSet(
    'Castelo Branco|Viana do Castelo|Viana do Alentejo|Figueira da Foz|Figueira de Castelo Rodrigo|Paços de Ferreira|Ferreira do Zêzere|Ferreira do Alentejo|Santiago do Cacém|Miranda do Douro|Miranda do Corvo|Oliveira de Azeméis|Oliveira do Bairro|Oliveira do Hospital|Oliveira de Frades|Castelo de Vide|Castelo de Paiva|Marco de Canaveses|Póvoa de Varzim|Póvoa de Lanhoso|Vila Franca de Xira|Vila Nova de Gaia|Torres Vedras|Torres Novas|Santa Maria da Feira|São João da Madeira|Martim Moniz|Vasco da Gama|Afonso Henriques|Fernando Pessoa|Gil Vicente|Duarte Pacheco|Costa da Caparica|Vila Real|Fontes Pereira de Melo|Sá da Bandeira|Gomes Freire|Alves Redol|Rodrigues Sampaio|Almeida Garrett|Lourenço Marques|Serra da Estrela|Campo de Ourique|Ribeira Grande|Salvador da Bahia|Rio de Janeiro|Belo Horizonte|Porto Alegre|Mira Sintra|Pinhal Novo|Mafra|Ponte de Lima|Ponte da Barca|Arcos de Valdevez|Lagoa|Sobral de Monte Agraço|Salvaterra de Magos|Marinha Grande|Alcácer do Sal|Reguengos de Monsaraz|Montemor-o-Novo|Montemor-o-Velho|Vendas Novas|Vila do Conde|Moura|Serpa|Barreiro|Seixal|Almada|Amadora|Odivelas|Loures|Cascais|Oeiras|Sintra'
  );
  var CONN = wordSet('de da do dos das e del van von der den di du la le y');
  var MONTHS = wordSet('Janeiro Fevereiro Março Abril Maio Junho Julho Agosto Setembro Outubro Novembro Dezembro');

  /* ----------------------------------------------------- validadores */
  function nifValid(d) {
    if (!/^\d{9}$/.test(d) || d[0] === '0') return false;
    var sum = 0;
    for (var i = 0; i < 8; i++) sum += (+d[i]) * (9 - i);
    var c = 11 - (sum % 11);
    if (c >= 10) c = 0;
    return c === +d[8];
  }
  function nissValid(d) {
    if (!/^[12]\d{10}$/.test(d)) return false;
    var w = [29, 23, 19, 17, 13, 11, 7, 5, 3, 2], sum = 0;
    for (var i = 0; i < 10; i++) sum += (+d[i]) * w[i];
    return (9 - (sum % 10)) === +d[10];
  }
  function mod97(str) {
    var r = 0;
    for (var i = 0; i < str.length; i++) {
      var ch = str[i], v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
      for (var j = 0; j < v.length; j++) r = (r * 10 + (+v[j])) % 97;
    }
    return r;
  }
  function ibanValid(s) {
    s = s.replace(/[\s.]/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
    return mod97(s.slice(4) + s.slice(0, 4)) === 1;
  }
  function nibValid(s) {
    s = s.replace(/\D/g, '');
    if (s.length !== 21) return false;
    return mod97(s) === 1 || (98 - mod97(s.slice(0, 19) + '00')) === +s.slice(19);
  }

  /* -------------------------------------------- expressões regulares */
  var UC = 'A-ZÀ-ÖØ-Þ';
  var LET = 'A-Za-zÀ-ÖØ-öø-ÿ';

  var RE_EMAIL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
  var RE_IBAN = /(?<![A-Za-z0-9])([A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,3})?)(?![A-Za-z0-9])/g;
  var RE_NIB = /(?<!\d[ .]?)(\d{4}[ .]?\d{4}[ .]?\d{11}[ .]?\d{2})(?![ .]?\d)/g;
  var RE_NUM9 = /(?<![\d+])(?<!\d[ .])((?:\+|00)351[ ]?)?([1-9](?:[ .]?\d){8})(?![ .]?\d)/g;
  var RE_NISS = /(?<![\d+])(?<!\d[ .])([12](?:[ .]?\d){10})(?![ .]?\d)/g;
  var RE_CC = /(?<![A-Za-z0-9])(\d{8}[ ]?\d[ ]?[A-Z0-9]{2}\d)(?![A-Za-z0-9])/g;
  var RE_IDCTX = new RegExp('(?:bilhete de identidade|cart[ãa]o de cidad[ãa]o|identifica[çc][ãa]o civil|documento de identifica[çc][ãa]o|(?<![' + LET + '])B\\.?\\s?I\\.?|(?<![' + LET + '])C\\.\\s?C\\.|(?<![' + LET + '])CC)\\s*(?:n\\.?\\s*[º°o]\\.?|n[º°]|n[úu]mero)?\\s*[:.]?\\s*(\\d{6,9}(?:[ ]?\\d(?:[ ]?[A-Z0-9]{2}\\d)?)?)(?![A-Za-z0-9])', 'gi');
  var RE_PASS = /passaporte\s*(?:n\.?\s*[º°o]\.?|n[º°]|n[úu]mero)?\s*[:.]?\s*([A-Z]{1,2}\d{6,8}|\d{8,9})(?![A-Za-z0-9])/gi;
  var RE_CED1 = /c[ée]dula(?:\s+profissional)?\s*(?:n\.?\s*[º°o]\.?|n[º°]|n[úu]mero)?\s*[:.]?\s*(\d{2,6}\s?[A-Za-z]?(?:-[A-Za-z])?)(?![A-Za-z0-9])/gi;
  var RE_CED2 = /(?<![A-Za-z])C\.?\s?P\.?\s*(?:n\.?\s*[º°o]\.?|n[º°])\s*[:.]?\s*(\d{2,6}\s?[A-Za-z]?(?:-[A-Za-z])?)(?![A-Za-z0-9])/g;
  var RE_MATR = /(?<![A-Za-z0-9])(?:[A-Z]{2}-\d{2}-\d{2}|\d{2}-[A-Z]{2}-\d{2}|\d{2}-\d{2}-[A-Z]{2}|[A-Z]{2}-\d{2}-[A-Z]{2})(?![A-Za-z0-9])/g;
  var RE_PROC1 = /(?<![\dA-Za-z\/])(\d{1,7}\/\d{2}\.\d{1,2}[A-Z]{1,5}[A-Z0-9]{0,6}(?:[.\-][A-Z0-9]+)*)/g;
  var RE_PROC2 = /(?:processo|proc\.|NUIPC|inqu[ée]rito)\s*(?:n\.?\s*[º°o]\.?|n[º°]|n[úu]mero)?\s*[:.]?\s*(\d[\dA-Za-z\/.\-]*[\dA-Za-z])/gi;
  var RE_DNASC = /(?:nascid[oa]s?\s+(?:em|a|no dia|aos)|nasceu\s+(?:em|a|no dia|aos)|data de nascimento)\s*[:,]?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{1,2}(?:\.?º)?\s+de\s+[A-Za-zçÇ]+\s+de\s+\d{4})/gi;
  var RE_IMOVEL = /(?:artigo matricial|art\.?\s*matricial|matriz predial[^.;]{0,80}?sob o artigo|inscrit[oa]s?\s+na\s+(?:respe(?:c)?tiva\s+)?matriz[^.;]{0,80}?sob o artigo|descrit[oa]s?\s+na\s+Conservat[óo]ria[^;]{0,140}?sob o n\.?\s*[º°o]\.?|sob a ficha n\.?\s*[º°o]\.?)\s*(?:n\.?\s*[º°o]\.?)?\s*([A-Z]?-?\d[\dA-Z\/\-]*)/gi;
  var RE_POSTAL = new RegExp('(?<!\\d)(\\d{4}-\\d{3})(?!\\d)((?:[ ]+(?:[' + UC + '][' + LET + '\'’\\-]*|d[aeo]s?|e))*)', 'g');

  var KW = 'Rua|R\\.|Avenida|Av\\.|Avª|Travessa|Trav\\.|Tv\\.|Largo|Lg\\.|Praça|Pç\\.|Praceta|Estrada|Estr\\.|Alameda|Calçada|Beco|Bairro|Urbanização|Urb\\.|Quinta|Lugar|Caminho|Rotunda|Azinhaga|Escadinhas|Pátio|Vila';
  var AW = '(?:(?:Eng|Dr|Dra|Prof|Gen|Cap|Sto|Sta|S|D|Cons|Alm|Cel|Pe|Fr|Mq|Gal|Com|Cmdt|Av|Pr)\\.|[' + UC + '0-9](?:[' + LET + '0-9\'’ºª\\-]|\\.(?=[' + LET + 'ºª]))*|d[aeo]s?|e|d[\'’][' + LET + ']+)';
  var DOOR = '(?:,?\\s*(?:n\\.?\\s*[º°o]\\.?|n[º°]|n[úu]mero|lote|lt\\.?)\\s*\\d+[A-Za-z]?|,\\s*\\d{1,5}[A-Za-z]?(?![\\d\/]|[.,]\\d))?';
  var FLOOR = '(?:,?\\s*(?:\\d+\\.?\\s*[º°ª](?:\\s*andar)?|[rR]\\/[cC]|rés-do-chão|cave)(?:\\s*,?\\s*(?:[Ee]sq\\.?|[Ee]squerd[oa]|[Dd]to\\.?|[Dd]t\\.?|[Dd]ireit[oa]|[Ff]rente|[Tt]r[áa]s|[A-Z](?![' + LET + '])))?)?';
  var RE_ADDR = new RegExp('(?<![' + LET + '])(?:' + KW + ')\\s+' + AW + '(?:\\s+' + AW + '){0,9}' + DOOR + FLOOR, 'g');

  var EW1 = '(?:[' + UC + '0-9](?:[' + LET + '0-9\'’&\\-]|\\.(?=[' + LET + ']))*)';
  var EW = '(?:' + EW1 + '|&|d[aeo]s?|e|[–\\-])';
  var FORM = '(?:Unipessoal,?\\s*L(?:da|DA)\\.?|UNIPESSOAL,?\\s*LDA\\.?|SGPS,?\\s*S\\.?\\s?A\\.?|L(?:da|DA)\\.?|Limitada|LIMITADA|S\\.\\s?A\\.?|SA|C\\.?R\\.?L\\.?|CRL|Sociedade de Advogados,?\\s*(?:SP,?\\s*)?R\\.?\\s?L\\.?|SOCIEDADE DE ADVOGADOS,?\\s*(?:SP,?\\s*)?R\\.?\\s?L\\.?|SP,?\\s*RL|S\\.?P\\.?,?\\s*R\\.?L\\.?|E\\.?\\s?P\\.?E\\.?|IPSS)';
  var RE_ENT = new RegExp('(?<![' + LET + '0-9])(' + EW1 + '(?:\\s+' + EW + '){0,9})\\s*,?\\s*' + FORM + '(?![' + LET + '])', 'g');

  var RE_TOK = new RegExp('[' + LET + ']+(?:[\'’][' + LET + ']+)*(?:-[' + LET + ']+)*', 'g');

  /* ------------------------------------------------ detecção por tipo */
  function push(out, type, text, start, end, extra) {
    if (end <= start) return;
    var m = { type: type, start: start, end: end, text: text.slice(start, end) };
    if (extra) for (var k in extra) m[k] = extra[k];
    out.push(m);
  }
  // valores curtos ou genéricos (números de artigo, datas) só são substituídos
  // no contexto em que foram detectados, para não atingir outras ocorrências
  function pushCtx(out, type, text, s, e, mStart) {
    var val = text.slice(s, e);
    var digits = val.replace(/\D/g, '').length;
    var need = type === 'IMOVEL' || type === 'DATA_NASCIMENTO' || val.length < 5 ||
      (/^[\d\s.\-\/]+$/.test(val) && digits < 7);
    var extra = null;
    if (need) {
      var ps = Math.max(mStart, s - 24);
      if (ps > mStart && !/\s/.test(text[ps - 1])) {
        var sp = text.indexOf(' ', ps);
        ps = (sp >= 0 && sp < s) ? sp + 1 : s;
      }
      var pre = text.slice(ps, s);
      if (!pre.trim()) pre = text.slice(Math.max(mStart, s - 24), s);
      extra = { prefix: pre };
    }
    push(out, type, text, s, e, extra);
  }
  function groupSpan(m, g) {
    var full = m[0], grp = m[g];
    if (grp == null) return null;
    var off = full.lastIndexOf(grp);
    return [m.index + off, m.index + off + grp.length];
  }
  function each(re, text, fn) {
    re.lastIndex = 0;
    var m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      fn(m);
    }
  }
  function trimTrail(text, s, e) {
    // remove pontuação, espaços e conectores no fim de um segmento
    var changed = true;
    while (changed && e > s) {
      changed = false;
      var seg = text.slice(s, e);
      var r = seg.replace(/[\s,;:]+$/, '');
      if (r.length !== seg.length) { e = s + r.length; changed = true; continue; }
      var mm = r.match(/(?:^|\s)(de|da|do|dos|das|e|DE|DA|DO|DOS|DAS|E|&|–|-)$/);
      if (mm) { e = s + r.length - mm[1].length; changed = true; }
    }
    return e;
  }
  function ctxBefore(text, s, n) { return norm(text.slice(Math.max(0, s - (n || 45)), s)); }
  function lastIdx(str, words) {
    var best = -1;
    words.forEach(function (w) { var i = str.lastIndexOf(w); if (i > best) best = i; });
    return best;
  }

  function detectPatterns(text, out) {
    each(RE_EMAIL, text, function (m) { push(out, 'EMAIL', text, m.index, m.index + m[0].length); });

    each(RE_IBAN, text, function (m) {
      var sp = groupSpan(m, 1), cand = text.slice(sp[0], sp[1]);
      // tenta o candidato completo e, se falhar, versões encurtadas
      for (var e = cand.length; e >= 15; e--) {
        var c = cand.slice(0, e);
        if (/\s$/.test(c)) continue;
        if (ibanValid(c)) { push(out, 'IBAN', text, sp[0], sp[0] + e); return; }
      }
      var cx = ctxBefore(text, sp[0], 25);
      if (/iban/.test(cx) && /^PT\d{2}/.test(cand)) push(out, 'IBAN', text, sp[0], sp[1]);
    });
    each(RE_NIB, text, function (m) {
      var sp = groupSpan(m, 1);
      var cx = ctxBefore(text, sp[0], 30);
      if (nibValid(m[1]) || /nib|conta|iban/.test(cx)) push(out, 'IBAN', text, sp[0], sp[1]);
    });

    each(RE_NISS, text, function (m) {
      var sp = groupSpan(m, 1), d = m[1].replace(/\D/g, '');
      var cx = ctxBefore(text, sp[0], 50);
      if (nissValid(d) || /niss|seguranca social|beneficiario/.test(cx)) push(out, 'NISS', text, sp[0], sp[1]);
    });

    each(RE_NUM9, text, function (m) {
      var s = m.index, e = m.index + m[0].length;
      var d = m[2].replace(/\D/g, '');
      var after = text.slice(e, e + 14), before = text.slice(Math.max(0, s - 3), s);
      if (/^\s*(,\d|€|eur|euros?\b)/i.test(after) || /€\s*$/.test(before)) return;
      var cx = ctxBefore(text, s, 45);
      var iF = lastIdx(cx, ['nif', 'nipc', 'contribuinte', 'fiscal', 'colectiva', 'coletiva']);
      var iT = lastIdx(cx, ['tel', 'contacto', 'fax', 'movel', 'tlm', 'tlf']);
      var type = null;
      if (m[1]) type = 'TELEFONE';
      else if (iF > iT) type = /^[56]/.test(d) ? 'NIPC' : 'NIF';
      else if (iT > iF && /^[29]/.test(d)) type = 'TELEFONE';
      else if (nifValid(d)) type = /^[56]/.test(d) ? 'NIPC' : 'NIF';
      else if (/^[29]/.test(d) && /^\S+$/.test(m[2].replace(/ /g, '')) ) type = 'TELEFONE';
      if (type) push(out, type, text, s, e);
    });

    each(RE_CC, text, function (m) {
      var sp = groupSpan(m, 1), v = m[1].replace(/\s/g, '');
      var cx = ctxBefore(text, sp[0], 50);
      if (/[A-Z]/.test(v.slice(9, 11)) || /cidadao|identificacao|\bcc\b|c\.c\./.test(cx)) push(out, 'CC', text, sp[0], sp[1]);
    });
    each(RE_IDCTX, text, function (m) {
      var sp = groupSpan(m, 1);
      if (sp) pushCtx(out, 'CC', text, sp[0], sp[1], m.index);
    });
    each(RE_PASS, text, function (m) { var sp = groupSpan(m, 1); pushCtx(out, 'PASSAPORTE', text, sp[0], sp[1], m.index); });
    each(RE_CED1, text, function (m) { var sp = groupSpan(m, 1); pushCtx(out, 'CEDULA', text, sp[0], trimTrail(text, sp[0], sp[1]), m.index); });
    each(RE_CED2, text, function (m) { var sp = groupSpan(m, 1); pushCtx(out, 'CEDULA', text, sp[0], trimTrail(text, sp[0], sp[1]), m.index); });
    each(RE_MATR, text, function (m) { push(out, 'MATRICULA', text, m.index, m.index + m[0].length); });
    each(RE_PROC1, text, function (m) { var sp = groupSpan(m, 1); push(out, 'PROCESSO', text, sp[0], sp[1]); });
    each(RE_PROC2, text, function (m) {
      var sp = groupSpan(m, 1), v = m[1];
      if (/^\d{1,4}$/.test(v) && !/\//.test(v)) {
        // números curtos só com indicação expressa de "n.º"
        if (!/n\.?\s*[º°o]|nº|número/i.test(m[0])) return;
      }
      var e = sp[1];
      while (e > sp[0] && /[.\-\/]/.test(text[e - 1])) e--;
      pushCtx(out, 'PROCESSO', text, sp[0], e, m.index);
    });
    each(RE_DNASC, text, function (m) { var sp = groupSpan(m, 1); pushCtx(out, 'DATA_NASCIMENTO', text, sp[0], sp[1], m.index); });
    each(RE_IMOVEL, text, function (m) {
      var sp = groupSpan(m, 1), e = sp[1];
      while (e > sp[0] && /[.\-\/]/.test(text[e - 1])) e--;
      pushCtx(out, 'IMOVEL', text, sp[0], e, m.index);
    });
    each(RE_POSTAL, text, function (m) {
      var s = m.index, e = trimTrail(text, s, m.index + m[0].length);
      push(out, 'CODIGO_POSTAL', text, s, e);
    });
    each(RE_ADDR, text, function (m) {
      var s = m.index, e = trimTrail(text, s, m.index + m[0].length);
      var seg = text.slice(s, e);
      // exige pelo menos uma palavra com conteúdo depois do tipo de via
      var rest = seg.replace(new RegExp('^(?:' + KW + ')\\s+'), '');
      if (!new RegExp('[' + UC + '0-9]').test(rest)) return;
      // "Vila" só é via quando seguida de nome e número de porta (evita topónimos)
      if (/^Vila\s/.test(seg) && !/\d/.test(seg)) return;
      if (/^Lugar\s/.test(seg) && /^Lugar\s+e\b/.test(seg)) return;
      push(out, 'MORADA', text, s, e);
    });
    each(RE_ENT, text, function (m) {
      var s = m.index, e = m.index + m[0].length;
      // retira palavras iniciais que não integram a firma
      var head = m[1];
      var toks = head.split(/\s+/), skip = 0;
      while (skip < toks.length - 1 && (LEAD_STOP.has(norm(toks[skip])) || ROLES.has(norm(toks[skip])) || TITLES.has(norm(toks[skip])) || CONN.has(norm(toks[skip])))) skip++;
      if (skip > 0) {
        var cut = 0;
        for (var i = 0; i < skip; i++) {
          var idx = head.indexOf(toks[i], cut);
          cut = idx + toks[i].length;
        }
        var rem = head.slice(cut);
        s = s + cut + (rem.length - rem.replace(/^\s+/, '').length);
      }
      if (!new RegExp('^[' + UC + '0-9]').test(text.slice(s, e))) return;
      push(out, 'ENTIDADE', text, s, e);
    });
  }

  /* ------------------------------------------------ nomes de pessoas */
  function isUpperTok(t) { return t.length >= 2 && t === t.toUpperCase() && t !== t.toLowerCase(); }
  function isCapTok(t) {
    if (t.length < 2) return false;
    if (!new RegExp('^[' + UC + ']').test(t)) return false;
    return true;
  }
  function detectPersons(text, out) {
    var toks = [], m;
    RE_TOK.lastIndex = 0;
    while ((m = RE_TOK.exec(text)) !== null) toks.push({ t: m[0], s: m.index, e: m.index + m[0].length });
    if (!toks.length) return;
    function gap(i) { return text.slice(toks[i].e, toks[i + 1].s); }
    function spaceGap(i) { return /^[  ]+$/.test(gap(i)); }
    // mudança de linha dentro do mesmo bloco (PDF) ou quebra de linha manual (Word): só continua o nome se a palavra seguinte for nome próprio ou apelido
    function lineGap(i) {
      if (!/^[ \u00a0]*[\n\u000b][ \u00a0]*$/.test(gap(i)) || i + 1 >= toks.length) return false;
      var nx = norm(toks[i + 1].t);
      return (FIRST.has(nx) || SURN.has(nx)) && !BLOCK.has(nx) && !MONTHS.has(nx);
    }
    function isInitial(i) {
      var t = toks[i].t;
      return t.length === 1 && new RegExp('^[' + UC + ']$').test(t) && i + 1 < toks.length && /^\.[  ]+$/.test(gap(i));
    }
    function capLike(i) { return isCapTok(toks[i].t) || isInitial(i); }

    var i = 0;
    while (i < toks.length) {
      if (!capLike(i)) { i++; continue; }
      var j = i, last = i;
      while (j + 1 < toks.length) {
        var ok = spaceGap(j) || isInitial(j) || lineGap(j);
        if (!ok) break;
        if (capLike(j + 1)) { j++; last = j; continue; }
        var nt = toks[j + 1].t;
        if (CONN.has(norm(nt)) && j + 2 < toks.length && spaceGap(j + 1) && capLike(j + 2)) {
          // "e" seguido de novo nome próprio separa duas pessoas
          if (norm(nt) === 'e') {
            var nn = norm(toks[j + 2].t);
            if (FIRST.has(nn) && !SURN.has(nn)) break;
          }
          j += 2; last = j; continue;
        }
        break;
      }
      evaluateRun(i, last);
      i = last + 1;
    }

    function evaluateRun(a, b) {
      var hasTitle = false;
      // título imediatamente anterior ("Dr. João", "Sr. Silva")
      if (a > 0) {
        var g = text.slice(toks[a - 1].e, toks[a].s);
        if (/^\.?[  ]+$/.test(g) && TITLES.has(norm(toks[a - 1].t)) && (g.indexOf('.') < 0 || toks[a - 1].t.length <= 4)) hasTitle = true; // título por extenso seguido de ponto é fim de frase
        if (/^ª?\.?[  ]+$/.test(g) && /^(Dr|Eng|Sr|Arq|Prof|Exm|D)$/.test(toks[a - 1].t)) hasTitle = true;
      }
      // retira títulos, funções processuais e palavras de início de frase
      while (a <= b) {
        var n = norm(toks[a].t);
        if (TITLES.has(n)) { hasTitle = true; a++; continue; }
        if (ROLES.has(n) || LEAD_STOP.has(n) || CONN.has(n)) { a++; continue; }
        if (isInitial(a) && n === 'd' && a + 1 <= b) { hasTitle = true; a++; continue; }
        break;
      }
      while (b >= a && (ROLES.has(norm(toks[b].t)) || CONN.has(norm(toks[b].t)))) b--;
      if (a > b) return;
      // mudança de caixa ("HABITAÇÃO Entre MARIA", "MENDES Ao"): a palavra em caixa normal que não é nome separa as partes
      for (var q = a + 1; q <= b; q++) {
        var tp = toks[q - 1].t, tq = toks[q].t;
        if (isInitial(q - 1) || isInitial(q) || isUpperTok(tp) === isUpperTok(tq)) continue;
        var tc = norm(isUpperTok(tp) ? tq : tp);
        if (!FIRST.has(tc) && !SURN.has(tc) && !CONN.has(tc)) { evaluateRun(a, q - 1); evaluateRun(q, b); return; }
      }
      var first = norm(toks[a].t);
      if (BLOCK.has(first) || MONTHS.has(first)) { if (a < b) evaluateRun(a + 1, b); return; }
      var content = [], initials = 0;
      for (var k = a; k <= b; k++) {
        var nk = norm(toks[k].t);
        if (CONN.has(nk) && !isCapTok(toks[k].t)) continue;
        if (CONN.has(nk) && isUpperTok(toks[k].t) && k !== a && k !== b) continue;
        if (isInitial(k)) { initials++; continue; }
        // palavra que não pode integrar um nome (topónimo, mês, via): avalia separadamente o que está antes e depois
        if (BLOCK.has(nk) || MONTHS.has(nk)) { evaluateRun(a, k - 1); if (k < b) evaluateRun(k + 1, b); return; }
        // título a meio ("... Soares Exmo. Senhor Juiz"): fecha o nome anterior e recomeça no título
        if (k > a && TITLES.has(nk)) { evaluateRun(a, k - 1); evaluateRun(k, b); return; }
        content.push(nk);
      }
      if (!content.length) return;
      var startsInitial = isInitial(a);
      var firstC = content[0];
      var isPerson = false;
      if (!startsInitial && FIRST.has(firstC) && !NOSTART.has(firstC) && content.length >= 2) isPerson = true;
      else if (hasTitle) isPerson = true;
      else if (!startsInitial && content.length >= 2 && content.every(function (c) { return FIRST.has(c) || SURN.has(c); }) && content.some(function (c) { return SURN.has(c); }) && (FIRST.has(firstC) || SURN.has(firstC))) isPerson = true;
      else if (startsInitial && toks[a].t !== 'S' && SURN.has(content[content.length - 1])) isPerson = true;
      if (!isPerson) {
        // sequência de nomes próprios e apelidos dentro de um título em maiúsculas ("CONTRATO ... ENTRE MARIA HELENA COSTA")
        var w0 = -1;
        for (var r = a; r <= b + 1; r++) {
          var nr = r <= b ? norm(toks[r].t) : '';
          var nome = r <= b && !isInitial(r) && !BLOCK.has(nr) && (FIRST.has(nr) || SURN.has(nr) || (CONN.has(nr) && w0 >= 0));
          if (nome) { if (w0 < 0) w0 = r; continue; }
          if (w0 >= 0) {
            var w1 = r - 1; while (w1 > w0 && CONN.has(norm(toks[w1].t))) w1--;
            if ((w0 > a || w1 < b) && w1 > w0) evaluateRun(w0, w1);
            w0 = -1;
          }
        }
        return;
      }
      var s = toks[a].s, e = toks[b].e;
      var surface = text.slice(s, e);
      if (PLACES.has(norm(surface))) return;
      if (content.length === 1 && content[0].length < 3) return;
      out.push({ type: 'PESSOA', start: s, end: e, text: surface, content: content, hasTitle: hasTitle });
    }
  }

  /* ------------------------------------------ resolução de sobreposições */
  function resolve(ms) {
    ms.sort(function (x, y) {
      var px = TYPES[x.type].priority, py = TYPES[y.type].priority;
      if (py !== px) return py - px;
      var lx = x.end - x.start, ly = y.end - y.start;
      if (ly !== lx) return ly - lx;
      return x.start - y.start;
    });
    var acc = [];
    ms.forEach(function (m) {
      for (var i = 0; i < acc.length; i++) if (m.start < acc[i].end && acc[i].start < m.end) return;
      acc.push(m);
    });
    acc.sort(function (x, y) { return x.start - y.start; });
    return acc;
  }

  function detectParagraph(text) {
    var out = [];
    if (!text || !text.trim()) return out;
    // os padrões lêem as mudanças de linha como espaços (mesmo comprimento, mesmas posições)
    detectPatterns(text.replace(/[\n\u000b]/g, ' '), out);
    detectPersons(text, out);
    return resolve(out);
  }

  /* --------------------------------------------------- agregação */
  function keyFor(m) {
    var t = m.type;
    if (['NIF', 'NIPC', 'CC', 'NISS', 'IBAN', 'TELEFONE', 'PASSAPORTE', 'CEDULA', 'MATRICULA'].indexOf(t) >= 0)
      return t + '|' + norm(m.text).replace(/[^a-z0-9]/g, '').replace(/^(00351|351)(?=\d{9}$)/, '');
    return t + '|' + norm(m.text).replace(/[.,;:]/g, '').replace(/\s+/g, ' ').trim();
  }
  function titleCase(s) {
    return s.toLowerCase().replace(new RegExp('(^|[\\s\\-\'’])([' + LET + '])', 'g'), function (_, p, c) { return p + c.toUpperCase(); })
      .replace(/(\s)(De|Da|Do|Dos|Das|E)(?=\s)/g, function (_, p, c) { return p + c.toLowerCase(); });
  }

  /**
   * Analisa um conjunto de parágrafos.
   * @param {string[]} paragraphs
   * @param {object} opts { types: {TIPO:true/false} }
   * @returns {{entities: Array}}
   */
  function analyze(paragraphs, opts) {
    opts = opts || {};
    var enabled = opts.types || {};
    var entities = [], byKey = new Map(), pos = 0;
    var persons = [];

    paragraphs.forEach(function (p, pi) {
      detectParagraph(p).forEach(function (m) {
        m.order = pos++;
        if (enabled[m.type] === false) return;
        if (m.type === 'PESSOA') { persons.push(m); return; }
        addMention(keyFor(m), m.type, m);
      });
    });

    // pessoas: agrupa por primeiro e último elemento do nome
    var multi = persons.filter(function (m) { return m.content.length >= 2; });
    var single = persons.filter(function (m) { return m.content.length === 1; });
    // os nomes mais completos primeiro, para que as formas abreviadas se lhes associem
    multi.sort(function (x, y) { return y.content.length - x.content.length || x.order - y.order; });
    multi.forEach(function (m) {
      var key = 'PESSOA|' + m.content[0] + '|' + m.content[m.content.length - 1];
      if (!byKey.has(key)) {
        var cands = entities.filter(function (en) {
          return en.type === 'PESSOA' && en._tokens && en._tokens[0] === m.content[0] && isSubseq(m.content, en._tokens);
        });
        if (cands.length === 1) { addMention(cands[0].key, 'PESSOA', m); return; }
      }
      addMention(key, 'PESSOA', m);
    });
    single.forEach(function (m) {
      var tok = m.content[0];
      var byLast = entities.filter(function (en) { return en.type === 'PESSOA' && en._last === tok; });
      var byFirst = entities.filter(function (en) { return en.type === 'PESSOA' && en._first === tok; });
      var target = byLast.length === 1 ? byLast[0] : (byLast.length === 0 && byFirst.length === 1 ? byFirst[0] : null);
      if (target) addMention(target.key, 'PESSOA', m);
      else addMention('PESSOA|' + tok, 'PESSOA', m);
    });

    function addMention(key, type, m) {
      var en = byKey.get(key);
      if (!en) {
        en = { id: 'e' + (entities.length + 1), key: key, type: type, variants: new Map(), units: new Map(), count: 0, firstOrder: m.order, selected: true };
        if (type === 'PESSOA' && m.content) { en._first = m.content[0]; en._last = m.content[m.content.length - 1]; en._tokens = m.content; }
        byKey.set(key, en);
        entities.push(en);
      }
      en.count++;
      en.firstOrder = Math.min(en.firstOrder, m.order);
      en.variants.set(m.text, (en.variants.get(m.text) || 0) + 1);
      var pre = m.prefix || '';
      en.units.set(pre + m.text, { prefix: pre, text: m.text });
    }

    entities.forEach(function (en) { en.canonical = canonicalOf(en).replace(/\s+/g, ' '); });
    entities.sort(function (a, b) {
      var ta = TYPE_ORDER.indexOf(a.type), tb = TYPE_ORDER.indexOf(b.type);
      if (ta !== tb) return ta - tb;
      return a.firstOrder - b.firstOrder;
    });
    numberLabels(entities, opts.existingLabels);
    return { entities: entities };
  }

  function isSubseq(a, b) {
    var j = 0;
    for (var i = 0; i < b.length && j < a.length; i++) if (b[i] === a[j]) j++;
    return j === a.length;
  }

  /** Etiquetas já presentes no texto (para continuar a numeração). */
  function existingLabels(paragraphs) {
    var max = {};
    paragraphs.forEach(function (p) {
      var re = /\[([A-Z_]+?)_(\d+)\]/g, m;
      while ((m = re.exec(p)) !== null) max[m[1]] = Math.max(max[m[1]] || 0, +m[2]);
    });
    return max;
  }

  function canonicalOf(en) {
    var vs = Array.from(en.variants.keys());
    if (en.type === 'PESSOA') {
      vs.sort(function (a, b) {
        var wa = a.split(/\s+/).length, wb = b.split(/\s+/).length;
        if (wb !== wa) return wb - wa;
        var ua = isUpperTok(a.replace(/[^A-Za-zÀ-ÿ]/g, '')) ? 1 : 0, ub = isUpperTok(b.replace(/[^A-Za-zÀ-ÿ]/g, '')) ? 1 : 0;
        return ua - ub;
      });
      var c = vs[0];
      if (isUpperTok(c.replace(/[^A-Za-zÀ-ÿ]/g, ''))) c = titleCase(c);
      return c;
    }
    vs.sort(function (a, b) { return en.variants.get(b) - en.variants.get(a) || b.length - a.length; });
    return vs[0];
  }

  function numberLabels(entities, existing) {
    var counters = {};
    if (existing) for (var k in existing) counters[k] = existing[k];
    var ordered = entities.slice().sort(function (a, b) { return a.firstOrder - b.firstOrder; });
    ordered.forEach(function (en) {
      var base = TYPES[en.type].label;
      counters[base] = (counters[base] || 0) + 1;
      en.label = '[' + base + '_' + counters[base] + ']';
    });
  }

  /** Acrescenta um termo indicado pelo utilizador. */
  function addManual(entities, term, type) {
    term = String(term || '').trim();
    if (!term) return null;
    type = type && TYPES[type] ? type : 'TERMO';
    var existing = entities.filter(function (en) { return en.variants.has(term); })[0];
    if (existing) { existing.selected = true; return existing; }
    var base = TYPES[type].label;
    var n = entities.filter(function (en) { return TYPES[en.type].label === base; }).length + 1;
    var labels = new Set(entities.map(function (en) { return en.label; }));
    while (labels.has('[' + base + '_' + n + ']')) n++;
    var en = { id: 'm' + Date.now() + Math.floor(Math.random() * 1000), key: 'MANUAL|' + norm(term), type: type, variants: new Map([[term, 0]]), units: new Map([[term, { prefix: '', text: term }]]),
      count: 0, firstOrder: 1e9, selected: true, manual: true, canonical: term, label: '[' + base + '_' + n + ']' };
    entities.push(en);
    return en;
  }

  /* ---------------------------------------------- plano de substituição */
  var REDACT = '████████';
  function isWordy(v) { return new RegExp('^[' + LET + '0-9]+$').test(v); }

  /**
   * Constrói níveis de substituição: dentro de cada nível nenhuma variante
   * contém outra; os níveis são aplicados por ordem (das mais longas às mais curtas).
   */
  function unitsOf(en) {
    if (en.units && en.units.size) return Array.from(en.units.values());
    return Array.from(en.variants.keys()).map(function (v) { return { prefix: '', text: v }; });
  }
  function buildPlan(entities, opts) {
    opts = opts || {};
    var redact = opts.style === 'redact';
    var items = [];
    entities.forEach(function (en) {
      if (!en.selected) return;
      unitsOf(en).forEach(function (u) {
        var v = u.prefix + u.text;
        if (!v || !v.trim()) return;
        items.push({
          search: v,
          replacement: u.prefix + (opts.style === 'x' ? 'XXXXX' : redact ? REDACT : en.label),
          matchCase: !en.manual,
          wholeWord: isWordy(v),
          entityId: en.id
        });
      });
    });
    items.sort(function (a, b) { return b.search.length - a.search.length; });
    var level = new Map();
    items.forEach(function (it, i) {
      var lv = 0, ls = it.search.toLowerCase();
      for (var j = 0; j < i; j++) {
        var other = items[j];
        if (other.search.length > it.search.length && other.search.toLowerCase().indexOf(ls) >= 0)
          lv = Math.max(lv, level.get(j) + 1);
      }
      level.set(i, lv);
      it.level = lv;
    });
    var levels = [];
    items.forEach(function (it) { (levels[it.level] = levels[it.level] || []).push(it); });
    return levels.filter(Boolean);
  }

  /** Simula, sobre texto simples, a pesquisa e substituição feita no Word. */
  function wordSearch(text, needle, matchCase, wholeWord) {
    // a mudança de linha e o espaço inquebrável valem como espaço (mesmo comprimento, mesmas posições)
    var sp = function (x) { return x.replace(/[\n\u000b\u00a0]/g, ' '); };
    var res = [], h = sp(matchCase ? text : text.toLowerCase()), n = sp(matchCase ? needle : needle.toLowerCase());
    var isW = new RegExp('[' + LET + '0-9_]');
    var i = 0;
    while ((i = h.indexOf(n, i)) >= 0) {
      var ok = true;
      if (wholeWord) {
        if (i > 0 && isW.test(text[i - 1])) ok = false;
        if (i + n.length < text.length && isW.test(text[i + n.length])) ok = false;
      }
      if (ok) { res.push(i); i += n.length; } else i++;
    }
    return res;
  }
  function applyToText(text, plan) {
    plan.forEach(function (lv) {
      lv.forEach(function (it) {
        var idx = wordSearch(text, it.search, it.matchCase, it.wholeWord);
        for (var k = idx.length - 1; k >= 0; k--) text = text.slice(0, idx[k]) + it.replacement + text.slice(idx[k] + it.search.length);
      });
    });
    return text;
  }

  /* ------------------------------------------ tabela de correspondências */
  function buildTable(entities, meta) {
    meta = meta || {};
    var lines = [];
    lines.push('TABELA DE CORRESPONDÊNCIAS');
    if (meta.document) lines.push('Documento: ' + meta.document);
    lines.push('Data: ' + (meta.date || new Date().toLocaleString('pt-PT')));
    lines.push('Esta tabela contém dados pessoais. Deve ser conservada separadamente do documento pseudonimizado e não deve ser transmitida a terceiros nem a sistemas de inteligência artificial.');
    lines.push('');
    entities.filter(function (en) { return en.selected; })
      .slice().sort(function (a, b) { return a.label.localeCompare(b.label, 'pt', { numeric: true }); })
      .forEach(function (en) { lines.push(en.label + ' = ' + en.canonical); });
    lines.push('');
    lines.push('Cofre de Anonimização para Word | Ana Marta Soares, Especialista em IA aplicada ao Direito');
    return lines.join('\n');
  }
  function parseTable(text) {
    var map = [];
    String(text || '').split(/\r?\n|\r/).forEach(function (line) {
      var m = line.match(/^\s*\[([A-Z_]+_\d+)\]\s*(?:=|\t|:)\s*(.+?)\s*$/);
      if (m) map.push({ label: '[' + m[1] + ']', bare: m[1], original: m[2] });
    });
    // etiquetas mais longas primeiro (PESSOA_10 antes de PESSOA_1)
    map.sort(function (a, b) { return b.bare.length - a.bare.length; });
    return map;
  }
  function revertText(text, map) {
    map.forEach(function (r) {
      var idx = wordSearch(text, r.label, true, false);
      for (var k = idx.length - 1; k >= 0; k--) text = text.slice(0, idx[k]) + r.original + text.slice(idx[k] + r.label.length);
    });
    map.forEach(function (r) {
      var idx = wordSearch(text, r.bare, true, true);
      for (var k = idx.length - 1; k >= 0; k--) text = text.slice(0, idx[k]) + r.original + text.slice(idx[k] + r.bare.length);
    });
    return text;
  }

  return {
    TYPES: TYPES, TYPE_ORDER: TYPE_ORDER, REDACT: REDACT,
    analyze: analyze, existingLabels: existingLabels, detectParagraph: detectParagraph, addManual: addManual,
    buildPlan: buildPlan, unitsOf: unitsOf, applyToText: applyToText, wordSearch: wordSearch,
    buildTable: buildTable, parseTable: parseTable, revertText: revertText,
    nifValid: nifValid, nissValid: nissValid, ibanValid: ibanValid, norm: norm, isWordy: isWordy
  };
});
