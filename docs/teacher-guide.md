# Guia do professor — Edukors Graph Editor

Este guia mostra como criar um curso no Edukors Graph Editor, do primeiro passo até o arquivo pronto para publicar. Você não precisa escrever JSON: tudo se faz no mapa e no inspetor.

## 1. A ideia em uma frase

Um curso é um **grafo**. Cada **nó** é um passo que o estudante vê ou faz (um texto, um quiz, um formulário) ou uma avaliação que a IA faz por trás. Cada **seta** (edge) diz qual passo vem depois, e pode ter uma **condição**: "se acertou 70% ou mais, vá para cá; senão, para lá".

## 2. Instalar e abrir

**No Mac** (Apple Silicon ou Intel, macOS 11 ou mais recente):

1. Baixe o [`Edukors-Graph-Editor-mac.dmg`](https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-mac.dmg), abra-o e arraste o app para a pasta **Aplicativos**.
2. Abra o app. Na primeira vez, o macOS pergunta se deseja abrir um app baixado da Internet: clique em **Abrir**.

**No Windows** (10 ou 11, 64 bits):

1. Abra a página do editor na Microsoft Store, [Edukors Graph Editor](https://apps.microsoft.com/detail/9N0N0P3GVRCK), e clique em **Obter** (se o app da Microsoft Store abrir, clique em **Obter** nele também). Sem aviso e sem senha de administrador.
2. O editor fica no menu Iniciar. As versões novas chegam pela Microsoft Store, como as de qualquer app instalado por ela.

Sem a Microsoft Store (alguns computadores de escola a têm desligada), use o instalador:

1. Baixe o [`Edukors-Graph-Editor-windows.exe`](https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-windows.exe). Se o navegador disser que o arquivo não é baixado com frequência, abra o menu **…** ao lado dele e escolha **Manter** (no Edge, também **Mostrar mais → Manter assim mesmo**).
2. Abra o arquivo baixado. Esse instalador não tem assinatura digital, por isso o Windows mostra **O Windows protegeu o computador**. Clique em **Mais informações** e depois em **Executar assim mesmo**.
3. O instalador não pede senha de administrador; em seguida o editor abre e fica no menu Iniciar.

Se o Windows disser que **bloqueou** o instalador, sem o botão *Executar assim mesmo*, o computador tem o **Controle Inteligente de Aplicativos** ligado ou uma regra da escola que só aceita programas assinados. Instale pela Microsoft Store ou fale com quem cuida do computador.

**No Linux** (64 bits, x64):

- No **Ubuntu, Debian, Mint** e derivados, baixe o [`Edukors-Graph-Editor-linux.deb`](https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-linux.deb) e abra-o com dois cliques (ou rode `sudo apt install ./Edukors-Graph-Editor-linux.deb` na pasta em que ele está). A instalação pede a sua senha; depois, o editor fica no menu de aplicativos.
- Em **outras distribuições**, baixe o [`Edukors-Graph-Editor-linux.AppImage`](https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-linux.AppImage), marque-o como executável (botão direito → **Propriedades → Permissões → Permitir executar como programa**, ou `chmod +x` no terminal) e abra-o. Ele roda sem instalar, de onde estiver.

**Versões novas.** Quando sai uma versão nova, o editor mostra um aviso, "A versão … está disponível.", com o botão **Baixar**: ele abre a página de download, e você instala a versão nova como instalou a primeira. O editor não se atualiza sozinho. Na Microsoft Store, quem atualiza é a própria Store.

**Em todos os sistemas**, na primeira vez, o editor mostra os **Termos de uso** (a licença MIT, explicada): é preciso clicar em **Aceitar** para continuar (**Recusar e sair** fecha o editor). Eles ficam depois em **Ajuda → Termos de uso**. A versão do editor aparece na barra de baixo da janela e no alto da **Ajuda**. A partir daí você pode criar um **Novo** curso ou **Abrir** um arquivo. Para ver como um curso é montado, baixe os [cursos de exemplo](https://github.com/mgarlabx/edukors_graph/blob/main/samples/samples.README.md) (*Cats of the World*, oito arquivos `.egf`, cada um explicado) e abra-os no editor; eles também rodam, cada um com um vídeo curto, em [edukors.org/graph](https://edukors.org/graph/).

### Os arquivos do curso: `.egrx` e `.egf`

- O editor salva o curso num arquivo **`.egrx`**: um pacote com o curso, a arrumação do mapa e as conversas com o assistente de IA sobre ele. É o arquivo de trabalho.
- Um curso **`.egf`** (ou um `.json` antigo) também abre no editor, com **Abrir**, **Recentes** ou dois cliques. Ele abre como um curso **ainda não salvo**: ao salvar, o editor pede um nome e uma pasta para o `.egrx`. O arquivo `.egf` original nunca é alterado por **Salvar**.
- O `.egf` continua sendo o arquivo que se publica (seção 11): para gerá-lo, use **Exportar**.
- Depois de instalado, um `.egrx` ou um `.egf` abre no editor com dois cliques.

### Vindo da versão 2.20

Na primeira vez que esta versão abre, ela traz da 2.20, uma vez só, o que já estava lá: as configurações do editor, as configurações e as skills do assistente de IA, os termos já aceitos, os **Recentes** que ainda existem, o idioma e o tema. A chave da OpenRouter não vem junto: cole-a de novo em **Configurações → IA no preview** (seção 9). Os dados da 2.20 ficam onde estavam.

Ao abrir um `.egf`, as conversas que a 2.20 guardou sobre aquele arquivo entram no histórico do assistente daquele curso.

A versão 2.20 não abre arquivos `.egrx`. Para levar um curso de volta para ela, use **Exportar → Curso (.egf)**.

## 3. A tela

| Parte                                   | O que faz                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Barra de cima**                 | Da esquerda para a direita: o logotipo (abre edukors.org); **Arquivo** (Novo, Abrir, Recentes, Salvar, Exportar, Mostrar na pasta); as vistas **Mapa / EGF / Preview / Preview com mapa**; Desfazer e Refazer; Recortar, Copiar, Colar, Duplicar e Excluir; **Inserir nó**, **Enquadrar o grafo** e **Problemas**; **Configurações** e **Ajuda**. Na ponta direita, os botões da **Barra lateral** (o inspetor) e do **Assistente de IA**. |
| **Abas de curso** (logo abaixo)   | Um curso aberto por aba; o ＋ cria um curso novo.                                                                                                                                                                                                                                              |
| **Mapa** (centro)                 | Os passos e as setas. Arraste os passos para organizá-los, ou arraste o título de uma seção para mover a seção inteira; ⇧⌘L organiza tudo automaticamente.                                                                                                                              |
| **Inspetor** (barra lateral, à esquerda) | O conteúdo do que estiver selecionado. O título, o tipo e o id ficam fixos no alto; abaixo, o passo se divide em duas partes: *Dados gerais* (identificação, saídas e extras) e a parte do tipo (o conteúdo, as perguntas, o julgamento…). Começa fechado; o botão **Barra lateral**, na ponta direita da barra de cima, abre e fecha. A borda dele se arrasta para mudar a largura. Sem nada selecionado, mostra as informações do curso. |
| **Assistente de IA** (à direita)  | O painel do assistente (seção 12). Abre e fecha pelo seu botão, independente do inspetor: os dois podem ficar abertos juntos.                                                                                                                                                                    |

Sem nenhum curso aberto, a barra mostra só Novo, Abrir, Recentes, Configurações e Ajuda.

### Configurações e Ajuda

**Configurações** (⚙, ou ⌘,) tem três partes:

- **Interface**: o **Idioma da interface** (os textos do editor; o idioma do curso não muda), o **Tema** (Sistema, Claro ou Escuro) e o **Tamanho da fonte**, de 80% a 200% (também com ⇧⌘+ e ⇧⌘−). Em chinês e em hindi, os textos próprios do editor e este guia aparecem em inglês.
- **Assistente de IA**: as contas e as opções do assistente (seção 12).
- **IA no preview**: a chave da OpenRouter e os modelos do Preview (seção 9).

A **Ajuda** tem três abas: **Guia rápido**, **Guia completo** (este guia) e **Termos de uso**.

### Vários cursos ao mesmo tempo

Cada curso que você abre ou cria ganha uma **aba de curso**, logo abaixo da barra de cima. Clique numa aba para trocar de curso: cada um guarda o seu desfazer, a seleção, a posição do mapa e o Preview. A aba indica quando há alterações não salvas; o ✕ fecha a aba e, se houver algo a salvar, o editor pergunta antes. Abrir um arquivo que já está aberto só mostra a aba dele.

Se o editor fechar de repente com alterações não salvas, na próxima abertura ele oferece **Recuperar** ou **Descartar** esses cursos. Um curso recuperado abre como "… (recuperado)", ainda sem salvar; o arquivo original não é tocado.

Para **levar passos de um curso para outro**: selecione os passos no mapa, tecle ⌘C, troque de aba, clique no mapa e tecle ⌘V. Os passos chegam com ids novos, perto do centro da tela e na mesma arrumação; as setas entre eles vêm junto. As referências de um para o outro passam a apontar para as cópias: uma *Nota (IA)* copiada com o seu formulário avalia o formulário copiado. Os textos chegam nos idiomas do curso de destino; se faltar o idioma principal dele, o texto original vai para esse idioma, para você traduzir ali mesmo.

Também dá para colar no mapa um passo copiado da aba **EGF** (o objeto inteiro do passo, de `{` a `}`).

## 4. Os tipos de passo

**O que o estudante vê**

| Tipo         | Para quê                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| Texto        | Uma lição escrita em markdown (títulos, listas, negrito, imagens, fórmulas).                                   |
| HTML         | Uma página interativa pronta (simulações, gráficos).                                                           |
| Texto com IA | A IA escreve o texto na hora, para aquele estudante (por exemplo, um reforço sobre o que ele errou).              |
| HTML com IA  | A IA monta uma página para aquele estudante.                                                                      |
| Quiz         | Perguntas objetivas, cada uma com uma opção correta.                                                             |
| Formulário  | Campos para o estudante preencher; com instruções e um campo de texto longo vira uma **tarefa de escrita**. |
| Sim/não     | Uma pergunta de sim ou não, que costuma abrir um caminho mais longo ou mais curto.                                |

**O que a IA decide, sem o estudante parar** (aparecem como losangos)

| Tipo               | Para quê                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Escolha (IA)       | A IA escolhe uma opção de uma lista que você escreveu (por exemplo: "reforço", "normal", "avançado").          |
| Nota (IA)          | A IA situa o trabalho do estudante numa escala de níveis que você escreveu; com pontos, vira uma nota de 0 a 100. |
| Probabilidade (IA) | A IA responde a uma pergunta de sim ou não com a probabilidade do sim.                                             |

## 5. Criar um curso, passo a passo

1. **Novo curso.** Clique em **Novo** na barra de cima (ou no ＋ ao lado das abas de curso). Com nada selecionado, preencha no inspetor o título, o autor e, se quiser, a descrição.
2. **Adicione passos.** Clique em **Inserir nó** na barra de cima e escolha *Texto*: o passo novo aparece abaixo do que estiver selecionado e já vem selecionado. Escreva o título no inspetor. O conteúdo aparece ali só para leitura: clique no ✎ (ou no próprio texto) para abri-lo no editor de conteúdo.
3. **Ligue os passos.** Puxe do círculo embaixo de um passo até outro. Isso cria uma seta.
4. **Marque o início.** O primeiro passo do curso tem o selo ▶. Para mudar, marque "Este é o nó de início do curso" no passo desejado.
5. **Salve** com ⌘S (ou **Salvar**). Na primeira vez, o editor pede o nome e a pasta; ele grava um arquivo só, `meu-curso.egrx`, com o curso, a arrumação do mapa e as conversas com o assistente. **Salvar como** (⇧⌘S) grava uma cópia com outro nome. Mover um passo no mapa também é uma alteração: a aba do curso indica que há algo a salvar até você salvar.

### O editor de conteúdo

O conteúdo de um passo *Texto* (markdown) ou *HTML*, e o prompt de um passo *Texto com IA* ou *HTML com IA*, não se editam no inspetor: lá aparecem só para leitura, e o ✎ ao lado do nome do campo (ou um clique no texto) abre o editor, que ocupa a área de trabalho, entre o inspetor e o assistente de IA.

- **Raw** mostra o texto como ele é escrito; **View**, como o estudante o vê.
- A barra tem os comandos principais: título, negrito, itálico, lista com marcadores, lista numerada, link e imagem (no HTML, também parágrafo). Eles agem sobre o trecho selecionado; ⌘B, ⌘I e ⌘K aplicam negrito, itálico e link.
- O prompt se escreve em markdown, com a mesma barra, mais a lista **Inserir {{STORAGE: …}}**; digitar `{{` abre a lista de chaves ali mesmo, no ponto do cursor.
- O ícone na ponta direita da barra liga e desliga a quebra das linhas longas.
- Num curso com vários idiomas, o seletor no alto troca o idioma do texto.
- O ✦ no alto abre e fecha o **assistente de IA** ao lado do texto. Ele sabe qual texto você tem aberto e em qual idioma: peça "deixe este texto mais curto", "acrescente um exemplo aqui", "traduza isto para o espanhol", e o que ele escrever aparece na caixa (⌘Z desfaz).
- O que você digita vai para o curso na hora: **Concluir** (ou Esc) fecha o editor sem perder nada, e ⌘Z desfaz.

## 6. Caminhos diferentes para estudantes diferentes

Quando um passo tem mais de uma seta saindo, o estudante segue **a primeira cuja condição vale**. As setas são numeradas nessa ordem.

1. Clique numa seta para ver o **editor de condições**.
2. Escolha a **chave** (o que o estudante produziu, como `q1.percent`, a porcentagem de acertos do quiz `q1`), o **operador** (≥, <, =…) e o **valor**. O editor mostra a escala de cada chave (0–100, 0–1, sim/não…).
3. Junte condições com **E** (todas valem) ou **OU** (ao menos uma vale).
4. Toda vez que há condições, deixe **uma seta sem condição por último**: é o "caso contrário". Uma seta nova criada depois dela já entra antes, com uma condição para você ajustar.
5. Para mudar a ordem, use ↑ ↓ na lista "Edges que saem deste nó".

**Cuidados que o editor lembra:**

- Depois de um passo da IA (losango), sempre deve haver uma seta sem condição: se a IA não conseguir julgar, o estudante sai por ela.
- A nota de um passo *Nota (IA)* vai de 0 até o número de níveis menos um (por exemplo, de 0 a 2) e não é inteira. Para comparar com uma nota de 0 a 100, dê **pontos** aos níveis e use `s1.percent`.
- Evite "igual a" em números produzidos pela IA; use ≥ ou <.

## 7. Uma tarefa de escrita avaliada pela IA

O padrão é **Formulário → Nota (IA) → Texto com IA**:

1. **Formulário** com *instruções* (o enunciado: o que escrever, quantas palavras, o que será avaliado) e um campo *Texto longo*, com mínimo e máximo de palavras.
2. **Nota (IA)**. No **state**, escreva a tarefa e insira o texto do estudante com `{{STORAGE: f1.texto}}` (digite `{{` e escolha a chave na lista). Em cada **pergunta**, diga o que avaliar e o que ignorar ("Avalie as evidências. Não avalie ortografia."), e descreva os níveis do mais fraco ao mais forte.
3. **Texto com IA** com **"Escrito a partir do julgamento"** apontando para a Nota. O prompt diz só *como* escrever o comentário (tom, tamanho, o que elogiar); a nota já está decidida.
4. Setas: Nota → comentário com a condição `s1.percent ≥ 0` (quer dizer "houve julgamento"), e Nota → próximo passo sem condição.

O inspetor da Nota mostra as instruções do formulário ao lado do state e avisa se você mudou um e esqueceu o outro.

## 8. Encontrar e corrigir problemas

O botão **Problemas** na barra de cima (ou ⇧⌘M) abre e fecha o painel de problemas, embaixo do mapa, com os erros e os avisos do curso; clique num item para ir até o passo ou a seta. Os passos com problema também ganham um selo vermelho ou laranja no mapa.

- **Erros** impedem o curso de funcionar (uma seta para um passo que não existe, um quiz sem resposta correta).
- **Avisos** são conselhos (um texto muito curto, uma tradução que falta). O curso funciona, mas vale a pena ler.

O editor aplica as mesmas regras que o player usa para conferir um curso antes de importá-lo.

## 9. Testar como o estudante (Preview)

Na vista **Preview** você faz o curso como o estudante, com a IA de verdade.

1. Em **Configurações → IA no preview**, cole a sua **Chave da OpenRouter** e clique em **Guardar chave**. Ela fica guardada cifrada pelo próprio sistema e nunca é mostrada à página do editor; **Apagar** a remove. Na mesma seção ficam os modelos de **Geração** e de **Julgamento**, com os mesmos valores do player.
2. Os textos com IA são gerados na hora; as notas e escolhas da IA são feitas como no servidor, com o mesmo modelo e os mesmos limites.
3. Ao lado de **Recomeçar**, **Exibindo** mostra o id do passo na tela, também quando o estudante revê um passo anterior. Clique nele para ir a esse passo no mapa; o preview continua de onde estava.
4. O botão na ponta direita da barra do preview abre e fecha o painel **Chamadas, estado, trajeto e console** (ele começa fechado):
   - **Chamadas**: cada chamada à IA, com modelo, tokens, custo e tempo. Clique para ver o que foi enviado e a resposta.
   - **Estado**: tudo o que o estudante já produziu.
   - **Caminho**: cada passo, a seta tomada e a condição que a decidiu; o caminho também aparece em verde no mapa. Use **Voltar ao nó** para testar outro ramo sem refazer tudo.
   - **Console**: o que o curso escreve no console do navegador e os erros que ele não trata, também os de uma página HTML, cada linha com a hora e o passo de onde veio. Use para entender por que uma simulação não funciona.
5. Se você editar o curso com o preview aberto, clique em **Aplicar alterações** para recarregar mantendo o estudante onde está.
6. Os links de um passo abrem no navegador do seu computador, e o preview continua onde estava.
7. A vista **Preview com mapa** (⇧⌘P) é o mesmo preview com o mapa do curso ao lado, como o estudante o vê na plataforma: o mapa marca os passos já feitos e o caminho percorrido, e acompanha o passo atual. As setas na divisa entre as duas metades ampliam uma delas. Trocar entre as duas vistas não reinicia o estudante.

Sem chave, o preview funciona em modo reduzido: os textos com IA mostram "tentar de novo" e as avaliações da IA viram um painel em que você mesmo escolhe o resultado.

Para testar só uma avaliação, use **Testar julgamento** no inspetor da Nota/Escolha/Probabilidade: digite um texto de exemplo, veja o que a IA responde, as chaves que seriam gravadas e para onde o estudante iria.

## 10. Vários idiomas

- **Idiomas do curso…** (no inspetor do curso): adicione idiomas (`pt`, `en`, `es`, `pt-BR`…). O idioma de origem é sempre o primeiro.
- O inspetor mostra e edita todos os textos num só idioma, escolhido na barra **Idioma dos textos**, logo abaixo do título do passo. É também o idioma dos títulos no mapa: trocar num troca no outro. Um ponto laranja marca o idioma em que algum texto do passo ainda está vazio, e cada campo traz ao lado do nome a etiqueta do idioma que está mostrando.
- No Preview, o idioma do estudante se escolhe no próprio player.

## 11. Publicar

Use **Exportar**, na barra de cima. A tela de exportação oferece dois formatos:

- **Curso (.egf)**: o curso como está, para o player, o plugin Moodle e a galeria.
- **Player (HTML)**: um arquivo HTML que roda o curso sozinho, sem servidor (as avaliações da IA viram o painel manual).

O arquivo é gravado ao lado do `.egrx`, com o mesmo nome (por exemplo, `meu-curso.egf`). Um curso ainda sem arquivo é salvo antes. Se já existir um arquivo com esse nome, o editor avisa, e ele só é substituído depois de **Substituir**. Exportar nunca altera o `.egrx`.

- Para publicar no Edukors, exporte o **Curso (.egf)**, envie o arquivo `meu-curso.egf` para o seu Google Drive e inscreva-o na seção "Galeria".
- Se preferir, envie o arquivo para o seu provedor de preferência.

## 12. O assistente de IA

O botão **Assistente de IA**, na ponta direita da barra de cima, abre o painel do assistente na ponta direita da janela, ao lado do mapa; clique de novo (ou no ✕ do painel) para fechá-lo. O assistente trabalha no curso da conversa: lê os passos, escreve, liga setas, traduz, valida, corrige e organiza o mapa. Com o editor de conteúdo aberto, o ✦ do alto dele traz o assistente para o lado do texto, para trabalhar naquele texto (seção 5).

**Antes de usar.** O assistente responde com uma conta sua no **Claude Code** (Anthropic) ou no **Codex** (OpenAI), programas que você instala no seu computador. Em **Configurações → Assistente de IA**:

1. Em **Contas**, clique no ＋ (**Adicionar conta**), escolha o **Serviço de IA** (ao lado de cada um aparece se o programa está instalado), dê um **Nome da conta** e clique em **Adicionar e entrar**. A entrada acontece na página do serviço, no navegador. Se o programa não estiver instalado, a tela mostra o **Guia oficial** e o comando de instalação para o seu sistema (**Copiar comando**); depois de instalar, clique em **Verificar de novo**. O editor não instala nada sozinho.
2. Marque, à esquerda da conta, a que o editor vai usar. As contas valem para todos os apps EDUKORS do computador; trocar a conta começa uma conversa nova.

Abaixo das contas, valem só para este editor:

- **Instruções**: um texto que o assistente lê em toda conversa nova. Use-o para o que vale sempre: o público ("meus alunos são do 9º ano"), o tom ("informal, frases curtas"), hábitos de montagem ("termine cada seção com um quiz de 3 perguntas").
- **Servidores MCP**: ligam o assistente a outros serviços. O ＋ pede um **Nome** e o **Endereço (URL)** do servidor. Servidores que pedem login pela web não funcionam aqui.
- **Skills**: pacotes de instruções (uma pasta com um arquivo `SKILL.md`) que ensinam o assistente a fazer uma tarefa de um certo jeito. O ＋ adiciona uma skill a partir de um arquivo ZIP; a lixeira a exclui.

**Como pedir.** Escreva no campo de baixo e envie. Exemplos:

- "Revise o curso e corrija os erros de validação."
- "Crie um quiz de 3 perguntas sobre o passo selecionado."
- "Monte uma tarefa de escrita avaliada pela IA depois do sm3, com comentário."
- "Traduza os textos que faltam para o espanhol."
- "Crie um curso curto sobre frações para o 6º ano." (ele cria o curso numa aba nova)

Cada pedido leva junto o estado do curso na tela, com as alterações ainda não salvas, e o que estiver selecionado no mapa. Por isso, "este passo" quer dizer o passo selecionado.

**O ＋ do campo** oferece: **Adicionar arquivos** (anexar arquivos ao pedido), **Skills** e **Servidores MCP** (para pedir que ele use um deles neste pedido) e **Buscar na web** (ligado ou desligado).

**Os três modos** (no botão de modo, ao lado do modelo):

| Modo                          | O que acontece                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Revisar antes de aplicar** | O padrão. Cada alteração no curso espera num cartão, com **Detalhes**; clique em **Aprovar** ou **Recusar**.                                    |
| **Aplicar alterações**   | O assistente altera o curso na hora.                                                                                                 |
| **Planejar**            | O assistente lê o curso e propõe um plano, sem mudar nada. Para executar o plano, escolha outro modo e peça.                          |

Em qualquer modo, **cada alteração do assistente é um passo do desfazer**: ⌘Z desfaz a última. Quando ele quer usar um dos seus servidores MCP, pergunta antes: **Permitir**, **Permitir sempre** (nesta conversa) ou **Recusar**. O assistente não salva o arquivo do curso: salve você, com ⌘S, quando estiver contente.

**Perguntas do assistente.** Quando o pedido tem mais de um caminho (o ano escolar, o tamanho, os idiomas), o assistente pergunta num cartão com opções; escolha uma ou escreva outra resposta.

**Modelo e esforço.** No botão do modelo, ao lado do enviar, você escolhe entre os modelos que o serviço oferece e, quando o modelo permite, o **esforço**: mais esforço, respostas mais cuidadosas e mais lentas. A escolha fica guardada para cada conta.

**Uso da conta.** Abaixo do campo, uma barra mostra quanto da janela de uso da sua conta (**Limite da sessão**) já foi usado e quando ela renova. É o uso da sua conta no serviço, não do editor.

**Conversas.** As conversas são do curso: ficam guardadas dentro do `.egrx` quando você salva (por isso uma conversa nova também conta como alteração não salva). No alto do painel, **Conversas** abre o histórico do curso, por dia, com busca; clique numa para continuar. **Nova conversa** começa outra; a lixeira exclui uma conversa.

**Parar.** Enquanto o assistente trabalha, o botão de enviar vira **Parar**. As alterações já feitas ficam e podem ser desfeitas.

## 13. Atalhos

No Windows e no Linux, ⌘ e ⌃ correspondem a Ctrl, ⌥ a Alt e ⇧ a Shift.

| Atalho                  | Ação                                                         |
| ----------------------- | -------------------------------------------------------------- |
| ⌘S / ⇧⌘S             | Salvar / salvar como                                           |
| ⌘W                     | Fechar a aba do curso                                          |
| ⌃⇥ / ⌃⇧⇥           | Próxima aba de curso / anterior                               |
| ⌘Z / ⇧⌘Z             | Desfazer / refazer                                    |
| ⌫                      | Excluir o que estiver selecionado no mapa                      |
| ⌘D                     | Duplicar os passos selecionados                                |
| ⌘X / ⌘C / ⌘V         | Recortar, copiar e colar passos (de uma aba de curso para outra também) |
| ⌘A                     | Selecionar todos os passos                            |
| ⌘0                     | Enquadrar o grafo                                              |
| ⇧⌘L                   | Organizar automaticamente                                      |
| ⇧⌘M                   | Abrir / fechar o painel de problemas                           |
| ⌘M / ⌘E / ⌘P         | Vista Mapa / EGF / Preview                                     |
| ⇧⌘P                   | Vista Preview com mapa                                         |
| ⌘,                     | Configurações                                         |
| ⇧⌘+ / ⇧⌘−           | Aumentar / diminuir o tamanho da fonte                         |
| ⌘B / ⌘I / ⌘K         | Negrito / itálico / link, no editor de conteúdo                |
| Esc                     | Limpar a seleção                                             |
