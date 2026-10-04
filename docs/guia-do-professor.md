# Guia do professor — Edukors Graph Editor

Este guia mostra como criar um curso no Edukors Graph Editor, do primeiro passo até o arquivo pronto para publicar. Você não precisa escrever JSON: tudo se faz no grafo e no painel à direita.

## 1. A ideia em uma frase

Um curso é um **grafo**. Cada **nó** é um passo que o estudante vê ou faz (um texto, um quiz, um formulário) ou uma avaliação que a IA faz por trás. Cada **seta** (edge) diz qual passo vem depois, e pode ter uma **condição**: "se acertou 70% ou mais, vá para cá; senão, para lá".

## 2. Instalar e abrir

1. Abra o arquivo `Edukors Graph Editor.dmg` e arraste o app para a pasta **Aplicativos**.
2. Na primeira vez, se o macOS avisar que o app não foi verificado, clique com o botão direito no app e escolha **Abrir**.
3. Na tela inicial você pode criar um **Novo curso**, **Abrir** um arquivo `.egf` ou abrir um dos **Exemplos** (*World Cats*), que são uma ótima forma de ver como um curso é montado.

Dica: depois de instalado, um curso `.egf` abre no editor com duplo clique. Um curso `.json` antigo vira `.egf` trocando a extensão do arquivo (o conteúdo é o mesmo).

## 3. A tela

| Parte | O que faz |
| --- | --- |
| **Grafo** (centro) | Os passos e as setas. Arraste os passos para organizá-los, ou arraste o título de uma seção para mover a seção inteira; use ⊞ para organizar tudo automaticamente. |
| **Inspetor** (direita) | O conteúdo do que estiver selecionado. Começa fechado ao abrir um arquivo e abre ao clicar num passo ou numa seta; o ícone de barra lateral (⌥⌘0) abre e fecha, e a borda esquerda dela se arrasta para mudar a largura — no Preview, o mesmo ícone abre e fecha o painel de chamadas, estado e caminho. Sem nada selecionado, mostra as informações do curso. |
| **Barra de cima** | Salvar, o ＋ que **insere** passos (os dez tipos, também no menu **Inserir**), desfazer, as abas **Grafo / JSON / Preview**, o idioma do grafo, o selo de **problemas** e, na ponta direita, o **agente de IA** ✦. |
| **Abas de curso** (logo abaixo) | Um curso aberto por aba; ＋ cria um curso novo. |

### Vários cursos ao mesmo tempo

Cada curso que você abre ou cria ganha uma **aba de curso**, logo abaixo da barra de cima. Clique numa aba para trocar de curso: cada um guarda o seu desfazer, a seleção, a posição do grafo e o Preview. O ponto ● na aba indica alterações não salvas; o ✕ fecha a aba e, se houver algo a salvar, o editor pergunta antes. Abrir um arquivo que já está aberto só mostra a aba dele. Para reordenar, arraste as abas.

Para **levar passos de um curso para outro**: selecione os passos no grafo, tecle ⌘C, troque de aba, clique no grafo e tecle ⌘V. Os passos chegam com ids novos, perto do centro da tela e na mesma arrumação; as setas entre eles vêm junto. As referências de um para o outro passam a apontar para as cópias: uma *Nota (IA)* copiada com o seu formulário avalia o formulário copiado. Os textos chegam nos idiomas do curso de destino; se faltar o idioma principal dele, o texto original vai para esse idioma, para você traduzir ali mesmo.

Também dá para colar no grafo um passo copiado da aba **JSON** (o objeto inteiro do passo, de `{` a `}`).

## 4. Os tipos de passo

**O que o estudante vê**

| Tipo | Para quê |
| --- | --- |
| Texto | Uma lição escrita em markdown (títulos, listas, negrito, imagens, fórmulas). |
| HTML | Uma página interativa pronta (simulações, gráficos). |
| Texto com IA | A IA escreve o texto na hora, para aquele estudante (por exemplo, um reforço sobre o que ele errou). |
| HTML com IA | A IA monta uma página para aquele estudante. |
| Quiz | Perguntas objetivas, cada uma com uma opção correta. |
| Formulário | Campos para o estudante preencher; com instruções e um campo de texto longo vira uma **tarefa de escrita**. |
| Sim/não | Uma pergunta de sim ou não, que costuma abrir um caminho mais longo ou mais curto. |

**O que a IA decide, sem o estudante parar** (aparecem como losangos)

| Tipo | Para quê |
| --- | --- |
| Escolha (IA) | A IA escolhe uma opção de uma lista que você escreveu (por exemplo: "reforço", "normal", "avançado"). |
| Nota (IA) | A IA situa o trabalho do estudante numa escala de níveis que você escreveu; com pontos, vira uma nota de 0 a 100. |
| Probabilidade (IA) | A IA responde a uma pergunta de sim ou não com a probabilidade do sim. |

## 5. Criar um curso, passo a passo

1. **Novo curso.** Clique em ＋ ao lado das abas de curso (ou tecle ⌘N). Com nada selecionado, preencha à direita o título, o autor e, se quiser, a descrição.
2. **Adicione passos.** Clique no ＋ da barra de cima (ou abra o menu **Inserir**) e escolha *Texto*: o passo novo aparece abaixo do que estiver selecionado e já vem selecionado. Para escolher o lugar, arraste o *Texto* da lista do ＋ até o grafo. Escreva o título e o conteúdo no inspetor. A aba **visualizar** mostra como o texto fica.
3. **Ligue os passos.** Puxe do círculo embaixo de um passo até outro. Isso cria uma seta.
4. **Marque o início.** O primeiro passo do curso tem o selo ▶. Para mudar, marque "Este é o nó de início do curso" no passo desejado.
5. **Salve** com ⌘S. O editor grava um arquivo só, `meu-curso.egf`, com o curso e a arrumação do grafo. Mover um passo no grafo também é uma alteração: a aba do curso mostra um ponto até ele ser salvo.

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

O selo na barra de cima mostra ✖ erros e ⚠ avisos. Clique nele para ver a lista; clique num item para ir até o passo ou a seta. Os passos com problema também ganham um selo vermelho ou laranja no grafo.

- **Erros** impedem o curso de funcionar (uma seta para um passo que não existe, um quiz sem resposta correta).
- **Avisos** são conselhos (um texto muito curto, uma tradução que falta). O curso funciona, mas vale a pena ler.

O editor aplica exatamente as mesmas regras do validador do builder (`validate_course.py`).

## 9. Testar como o estudante (Preview)

Na aba **Preview** você faz o curso como o estudante, com a IA de verdade.

1. Em **Preferências** (⚙), cole a sua chave da **OpenRouter**. Ela fica guardada no Keychain do Mac, nunca num arquivo.
2. Os textos com IA são gerados na hora; as notas e escolhas da IA são feitas como no servidor, com o mesmo modelo e os mesmos limites.
3. Ao lado de **Recomeçar**, **Exibindo** mostra o id do passo na tela, também quando o estudante revê um passo anterior. Clique nele para ir a esse passo no grafo; o preview continua de onde estava.
4. À direita:
   - **Chamadas**: cada chamada à IA, com modelo, tokens, custo e tempo. Clique para ver o que foi enviado e a resposta.
   - **Estado**: tudo o que o estudante já produziu.
   - **Caminho**: cada passo, a seta tomada e a condição que a decidiu; o caminho também aparece em verde no grafo. Use **Voltar ao nó** para testar outro ramo sem refazer tudo.
   - **Forçar julgamento**: troque a resposta da IA por um valor seu, para ver um ramo específico. Isso vale só para o teste e nunca é salvo.
5. Se você editar o curso com o preview aberto, clique em **Aplicar alterações** para recarregar mantendo o estudante onde está.

Sem chave, o preview funciona em modo reduzido: os textos com IA mostram "tentar de novo" e as avaliações da IA viram um painel em que você mesmo escolhe o resultado.

Para testar só uma avaliação, use **Testar julgamento** no inspetor da Nota/Escolha/Probabilidade: digite um texto de exemplo, veja o que a IA responde, as chaves que seriam gravadas e para onde o estudante iria.

## 10. Vários idiomas

- **Idiomas do curso…** (no inspetor do curso): adicione idiomas (`pt`, `en`, `es`, `pt-BR`…). O idioma de origem é sempre o primeiro.
- Cada texto ganha uma aba por idioma; as vazias aparecem com um ponto laranja. **comparar idiomas** mostra dois lado a lado.
- O seletor 🌐 na barra muda o idioma dos títulos no grafo; no Preview você escolhe o idioma do estudante.

## 11. Publicar

- **Arquivo → Exportar curso…** gera um HTML que roda o curso sozinho, sem servidor (as avaliações da IA viram o painel manual).
- Para publicar no Edukors, envie o arquivo `meu-curso.egf` pelo admin do player.

## 12. O agente de IA

O ícone ✦ na ponta direita da barra de cima (ou ⇧⌘A) abre o **agente de IA** no painel da direita, no lugar do inspetor; clique de novo para voltar ao inspetor. O agente é o Claude e trabalha no curso que está na tela: lê os passos, escreve, liga setas, traduz, valida e corrige.

**Antes de usar:** o agente usa a sua conta do Claude, a mesma do Claude Code. Se o painel disser que nenhuma conta está conectada, abra o Terminal, digite `claude` e, dentro dele, `/login`; depois clique em **Tentar de novo**.

**Como pedir.** Escreva no campo de baixo e tecle ↵ (⇧↵ quebra a linha). Exemplos:

- "Revise o curso e corrija os erros de validação."
- "Crie um quiz de 3 perguntas sobre o passo selecionado."
- "Monte uma tarefa de escrita avaliada pela IA depois do sm3, com comentário."
- "Traduza os textos que faltam para o espanhol."
- "Crie um curso curto sobre frações para o 6º ano." (sem curso aberto, ele cria um numa aba nova)

O que estiver selecionado no grafo vai junto com a mensagem: aparece no chip ◎ do campo (clique nele para não enviar). Por isso, "este passo" quer dizer o passo selecionado.

**Instruções permanentes.** Em **Preferências → Agente de IA** há um campo de texto que o agente lê no começo de toda sessão, como um CLAUDE.md. Use-o para o que vale sempre: o público ("meus alunos são do 9º ano"), o tom ("informal, frases curtas"), hábitos de montagem ("termine cada seção com um quiz de 3 perguntas"). O que você pedir na conversa tem prioridade. As instruções valem a partir da próxima sessão (**Nova sessão**).

**Skills e servidores MCP.** Também em **Preferências → Agente de IA** você pode dar ao agente habilidades extras:

- **Skills** são pacotes de instruções (uma pasta com um arquivo `SKILL.md`, às vezes com scripts) que ensinam o agente a fazer uma tarefa de um certo jeito. Clique em **Abrir pasta das skills**, ponha lá a pasta da skill e clique em **Recarregar**: ela aparece na lista.
- **Servidores MCP** ligam o agente a outros programas e serviços (uma pasta de materiais, uma base de documentos…). Cole no campo **Servidores MCP** o JSON que a documentação do servidor indica para o Claude Code (o `.mcp.json`). Servidores que pedem login pela web não funcionam aqui.

Os dois valem a partir da próxima sessão (**Nova sessão**). O menu do modelo, no pé do painel, mostra as skills carregadas e se cada servidor conectou (✓) ou falhou (✗). Se uma skill precisar rodar um comando no Mac, o agente pede a sua aprovação **a cada comando**, mostrando o comando, mesmo no modo Automático.

**Os três modos** (no botão ✋ do campo):

| Modo | O que acontece |
| --- | --- |
| **Pedir antes** | Cada alteração aparece num cartão com o que vai mudar (passos adicionados, alterados, excluídos, setas). Clique em **Permitir**, **Permitir sempre nesta sessão** ou **Recusar** (o **…** deixa você dizer o que ele deve fazer em vez disso). |
| **Automático** | O agente altera o curso sem perguntar. |
| **Planejar** | O agente estuda o curso e escreve um plano, sem mudar nada. Aprove o plano para ele executar, ou peça mudanças. |

Em qualquer modo, **cada alteração do agente é um passo do desfazer**: ⌘Z desfaz a última. Ler um arquivo do seu Mac (anexado com o clipe 📎) ou abrir uma página da web sempre pede a sua permissão. O agente não salva o arquivo do curso: salve você, com ⌘S, quando estiver contente.

**Perguntas do agente.** Quando o pedido tem mais de um caminho (o ano escolar, o tamanho, os idiomas), o agente pergunta num cartão com opções; escolha uma ou escreva outra resposta.

**Modelo e esforço.** No botão do modelo (por exemplo, *Opus 5.5*) você escolhe o modelo do Claude e o **esforço**: mais esforço, respostas mais cuidadosas e mais lentas. O padrão serve para quase tudo.

**Conta e uso.** O mesmo menu mostra a conta do Claude em uso e o **uso da conta**: as janelas de limite da assinatura, como o Claude Code as informa (em inglês), cada uma com uma barra. *Current session* é a janela de 5 horas; *Current week*, a da semana; cada linha diz quando a janela renova. O uso é atualizado ao abrir o painel e depois de cada resposta (o ⟳ atualiza na hora), e aparece também no início de cada conversa nova. As janelas são da conta, não do editor: contam também o que você usa no claude.ai e no Claude Code. Para usar outra conta, entre com ela no Claude Code (`claude`, depois `/login`) e comece uma conversa nova no painel.

**Sessões.** Cada conversa fica guardada. O título no alto do painel abre a lista das conversas anteriores (com busca); clique numa para continuar de onde parou. O ícone ✎ começa uma conversa nova; a 🗑 de cada item exclui a conversa.

**Parar.** Enquanto o agente trabalha, o botão de enviar vira ■: clique nele (ou tecle Esc no campo) para interromper. Você também pode escrever enquanto ele trabalha: a mensagem entra na fila.

## 13. Atalhos

| Atalho | Ação |
| --- | --- |
| ⌘N / ⌘O / ⌘S / ⇧⌘S | Novo, abrir, salvar, salvar como |
| ⌘W | Fechar a aba do curso |
| ⌃⇥ / ⌃⇧⇥ | Próxima aba de curso / anterior |
| ⌘1 … ⌘9 | Ir para a aba de curso 1 … 9 (⌘9: a última) |
| ⌘Z / ⇧⌘Z | Desfazer / refazer |
| ⌫ | Excluir o que estiver selecionado no grafo |
| ⌘D | Duplicar os passos selecionados |
| ⌘C / ⌘V | Copiar e colar passos (de uma aba de curso para outra também) |
| ⌘A | Selecionar todos os passos |
| ⌘0 | Enquadrar o grafo |
| ⇧⌘L | Organizar automaticamente |
| ⇧⌘M | Abrir / fechar o painel de problemas |
| ⌘J / ⌘P | Aba JSON / Preview |
| ⌘, | Preferências |
| ⇧⌘A | Abrir / fechar o agente de IA |
| Esc | Limpar a seleção |
