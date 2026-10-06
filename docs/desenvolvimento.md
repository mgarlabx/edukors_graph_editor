# Desenvolvimento

Notas técnicas do Edukors Graph Editor: como o agente de IA é montado, os testes, a estrutura do código e como manter o editor em dia com o repositório [edukors_graph](https://github.com/mgarlabx/edukors_graph). Para a apresentação e a instalação, ver o [README](../README.md).

## Requisitos e comandos

Xcode Command Line Tools, Rust (`rustup`), Node 22+. Para os testes de paridade: `php` 8.4+ e o repositório `edukors_graph` (por padrão em `~/Library/CloudStorage/Dropbox/EDUKORS/edukors_graph`, ou em `EDUKORS_GRAPH`). Para o agente de IA: o Claude Code logado numa conta do Claude neste Mac (`claude`, depois `/login`).

```sh
npm install
npm run app:dev        # o app, com recarga ao vivo
npm run app:build      # .app e .dmg em src-tauri/target/release/bundle/
npm run dev            # só a interface, num navegador (sem Keychain nem diálogos nativos)
```

## Agente de IA

O ícone ✦ na ponta direita da barra (⇧⌘A, ou **Ver → Agente de IA**) abre o agente no lugar do inspetor. Ele é feito com o [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) e usa a conta do Claude com que o Claude Code está logado neste Mac: as chaves `ANTHROPIC_API_KEY` e `ANTHROPIC_AUTH_TOKEN` são retiradas do ambiente do processo para que a conta seja o que vale.

```
painel (src/agent/)  ⇄  Rust (src-tauri/src/agent.rs)  ⇄  Node: agent/sidecar.mjs  ⇄  Claude Agent SDK → Claude Code → Claude
     eventos "agent" / agent_send             JSON por linha (stdin/stdout)
```

- **`agent/sidecar.mjs`** roda o SDK em modo de entrada contínua (uma conversa aberta por vez, com fila, interrupção e troca de modelo, modo e esforço no meio). Lista, reabre e exclui as sessões que o SDK grava em `~/.claude/projects/`, numa pasta de trabalho própria do app (`~/Library/Application Support/org.edukors.grapheditor/agent`). Não carrega as configurações, skills, plugins nem servidores MCP do Claude Code da pessoa (`settingSources: []`, `strictMcpConfig`, conectores do claude.ai desligados): as skills e os servidores MCP do agente são os do próprio app (abaixo).
- **As ferramentas** (`agent/tools.mjs`) são declaradas no processo e executadas no editor (`src/agent/editorTools.ts`): `read_course`, `get_schema`, `validate_course`, `get_editor_state`, `edit_course` (operações aplicadas juntas, como um passo de desfazer, ou nenhuma), `replace_course`, `new_course`, `show_node`, `auto_layout`. Das ferramentas do Claude Code, só `Read`, `Glob`, `Grep`, `Bash`, `WebSearch`, `WebFetch`, `AskUserQuestion`, `TodoWrite`, `ExitPlanMode` e, havendo skills, `Skill`: nada de escrever arquivos com Write/Edit. Cada comando do Bash pede aprovação, em qualquer modo (sem "permitir sempre"), e no modo *Planejar* é recusado.
- **Skills e MCP do app** (`agent/extensions.mjs`): as skills ficam em `…/org.edukors.grapheditor/agent/plugin/skills/<nome>/SKILL.md`, montadas como plugin local (`edukors`); só elas são ligadas, pelo nome (`skills: ["edukors:<nome>"]`), e as skills embutidas do Claude Code ficam de fora. Os servidores MCP (stdio, http, sse) vêm de **Preferências → Agente de IA**, no formato do `.mcp.json` (`agent.mcp`, validado em `src/agent/mcpConfig.ts`), e passam a `mcpServers` ao lado do `edukors`; suas ferramentas pedem permissão no modo *Pedir antes* e não no *Automático*. O menu do modelo mostra as skills e o estado de cada servidor.
- **Modos**: *Pedir antes* (cada alteração do curso espera aprovação no painel), *Automático* (altera sem perguntar) e *Planejar* (estuda e propõe um plano; nada muda até a aprovação). Ler arquivos do Mac fora da pasta do agente sempre pede permissão.
- **Conta e uso**: a conta é a do login do Claude Code, lida quando cada conversa começa (o menu do modelo a mostra). O uso da conta é o relatório do `/usage` do Claude Code, mostrado como vem, em inglês, com uma barra por janela (sessão de 5 horas, semana): o processo o pede numa consulta à parte, que não chama modelo nem grava sessão, ao abrir uma conversa e depois de cada resposta (no máximo a cada 15 s).
- **Cada mensagem** leva na frente um bloco `<editor-context>` com o curso na tela, os outros abertos, a vista e a seleção (o chip ◎ do compositor tira a seleção); o painel não mostra esse bloco.
- O processo procura o Node no PATH, nos lugares usuais (`~/.local/bin`, Homebrew, nvm, Volta…) e, por último, no shell de login, porque um app aberto pelo Finder não recebe o PATH do terminal (`EDUKORS_NODE` força um caminho).

> **Atenção, se o app for distribuído**: a documentação do Agent SDK diz que, salvo aprovação prévia, a Anthropic não permite que terceiros ofereçam o login do claude.ai, nem os limites de uso dele, nos seus produtos, inclusive agentes feitos com o SDK; para isso, pede autenticação por chave de API. O agente daqui usa o login do Claude Code do próprio Mac, que serve ao uso pessoal; para entregar o app a professores, troque para uma chave de API (ver [distribuicao.md](distribuicao.md)).

## Testes

```sh
npm test                               # vitest: 229 testes
(cd src-tauri && cargo test)           # comandos nativos
npm run dev &                          # depois:
node tests/e2e/smoke.mjs /tmp          # a interface em WebKit, com capturas de tela
node tests/e2e/preview.mjs /tmp        # o preview do início ao fim, com a OpenRouter simulada
node tests/e2e/tabs.mjs /tmp           # dois cursos em abas, um nó copiado de um para o outro
node tests/e2e/content.mjs /tmp        # o editor de conteúdo em tela cheia e os atalhos da ajuda no Windows
node tests/e2e/agent.mjs /tmp          # o painel do agente, com o processo simulado (não gasta uso)
node tests/e2e/agent.mjs /tmp --live   # o mesmo painel com o agente de verdade (Haiku; gasta um pouco do uso da conta)
```

| Teste | O que garante |
| --- | --- |
| `tests/validate.parity.test.ts` | A validação do editor acusa erro **exatamente quando** o `validate.php` do player recusaria importar o curso, nos três samples e em 36 tipos de curso quebrado de propósito (94 casos). As linhas que o editor imprime ficam num snapshot, tirado quando ainda batiam linha a linha com o `validate_course.py`, que o `edukors_graph` não tem mais. |
| `tests/judge.parity.test.ts` | Montagem do pedido, leitura da resposta, recusas, piso de confiança, chaves gravadas, prompt de feedback e escolha da edge são idênticos a `ai.php`, `course.php` e à classe `Course` do próprio player. |
| `tests/course.test.ts` | Abrir e salvar os samples devolve o arquivo **byte a byte**; edições do grafo preservam a ordem das edges e as referências; idiomas. |
| `tests/insert.test.ts` | Inserir um tipo, pelo menu **Inserir** ou pelo ＋ da barra, cria o nó com o próximo id livre ao lado da seleção, selecionado e enquadrado no mapa, de qualquer vista; o que se digitava na aba JSON entra antes, sem apagar o nó novo. |
| `tests/positions.test.ts` | As posições ficam no `position` de cada nó, arredondadas e antes do título; mover é uma alteração do curso, desfeita num passo; nada mudando, o curso é o mesmo objeto; o agente reescrevendo o curso não tira os nós do lugar. |
| `tests/tabs.test.ts` | Cada aba guarda o seu curso, histórico, seleção e preview; nós colados de outro curso ganham ids novos, as referências dentro do grupo os acompanham e os textos ficam nos idiomas do curso de destino. |
| `tests/errors.test.ts` | Os erros da validação, do julgamento da IA e do lado nativo aparecem no idioma da interface (pt, en, es), enquanto o inglês comparado nos testes de paridade continua o do script e o do servidor; JSON quebrado é apontado por linha e coluna. |
| `tests/e2e/tabs.mjs` | No WebKit, um nó copiado num curso cola em outro aberto em outra aba; o que se digita na aba JSON fica no curso certo mesmo trocando de aba logo em seguida; fechar uma aba com alterações pergunta antes, pelo nome do curso. |
| `tests/markup.test.ts` | A barra do editor de conteúdo: o que cada comando escreve e seleciona, em Markdown e em HTML, e como desfaz a marcação que já está lá; o `{{STORAGE: …}}` que um prompt completa. |
| `tests/e2e/content.mjs` | No WebKit, o inspetor mostra o conteúdo e o prompt dos nós com IA só para leitura e o ✎ abre o editor de tela cheia; a barra e ⌘B/⌘I agem sobre a seleção e ⌘Z desfaz; Raw/View, quebra de linhas e idioma; no prompt, `{{` completa a chave no cursor e Esc fecha a lista antes do editor; ⌫ na View não apaga o nó; no Windows, os guias e as dicas mostram Ctrl, Alt e Shift. |
| `tests/agentMcp.test.ts` | O JSON dos servidores MCP das Preferências: as duas formas aceitas, os campos que passam, cada erro e o nome reservado `edukors`; o frontmatter das skills e a filtragem dos servidores no processo do agente. |
| `tests/agent.test.ts` | As edições do agente se aplicam todas ou nenhuma, num passo de desfazer, mantendo referências e a ordem das edges; ele lê o curso da conversa sem mexer na tela; o contexto de cada mensagem e a conversa (em streaming, interrompida ou lida do disco) chegam ao painel como devem. |
| `tests/e2e/agent.mjs` | No WebKit, o ícone abre o agente ao lado do inspetor, sem fechá-lo; uma edição aprovada passa pelas ferramentas do editor; perguntas, plano, modo, modelo, ⇧⌘A e sessões funcionam. Com `--live`, o Claude edita um curso de verdade, pelo `agent/sidecar.mjs`. |
| `tests/e2e/preview.mjs` | No WebKit, o preview percorre o `world-cats-2-short` com geração e julgamento; o corpo enviado ao `/decisions`, as chaves e a edge tomada batem com `ai.php`/`course.php`, e o bloco do julgamento no prompt do feedback é idêntico ao do servidor, caractere a caractere. |

## Estrutura

```
src-tauri/      Rust: arquivos, preferências, Keychain, HTTP para a OpenRouter (a chave nunca chega ao JS), menu nativo, abrir .egf (e .json antigo) pelo Finder, o processo do agente
agent/          o agente: Claude Agent SDK num processo Node (sidecar.mjs), as ferramentas sobre o curso (tools.mjs), o system prompt
src/
  store/        estado (zustand), undo/redo, layout, preferências, cursos abertos em abas
  schema/       schema.json embutido, Ajv (camada 1), tipos gerados, textos de ajuda lidos do schema
  validate/     porte linha a linha do antigo validate_course.py (camada 2) e painel de problemas
  course/       operações no grafo, chaves produzidas e escalas, condições, serialização fiel
  canvas/       React Flow: nós, edges, seções, layout ELK
  inspector/    formulários por tipo de nó, campos localizados, editor de conteúdo em tela cheia, tarefa de escrita lado a lado
  conditions/   editor de when em árvore
  json/         aba Monaco, sincronizada nos dois sentidos
  preview/      player verbatim + shim (o bridge.js do editor) + painel do preview
  judge/        porte do ai.php (geração e julgamento) e o judge-probe visual
  i18n/         idiomas do curso, strings da interface (pt, en, es)
  ai/           cliente OpenRouter do preview, preços dos modelos
  agent/        o painel do agente de IA: conversa, aprovações, sessões, as ferramentas executadas no editor
  prefs/        preferências
assets/         course_player.html e course_viewer.html (cópias verbatim), ícone
samples/        world-cats 1, 2 e 3
scripts/        update-assets.mjs, gen-types.mjs, build-locales.py
```

## Manter em dia com o repositório

```sh
npm run update-assets          # copia schema, player e viewer
node scripts/update-assets.mjs --check
```

O script também vigia o código que o editor porta — `bridge.js`, `ai.php`, `course.php`, as classes `Ai`, `JudgeView` e `Course` do player e o `validate.php` — e avisa qual arquivo do editor revisar quando um deles muda. Depois, `npm test` diz se a paridade se manteve.

## Decisões tomadas onde o plano deixou em aberto

| Questão (plano §8) | Decisão |
| --- | --- |
| Nome e licença | *Edukors Graph Editor*, MIT, como o repositório. |
| Importar para um player remoto | Fica na exportação de arquivos (curso, mapa e player). |
| `.edukors` ou dois arquivos | Um arquivo só, `curso.json`: a posição de cada nó no canvas vai no campo `position` do próprio nó, que o schema aceita e os players ignoram. |

## Limitações conhecidas

- **Assinatura e notarização** estão configuradas, mas exigem um certificado *Developer ID*, que não há nesta máquina: o `.app` gerado não é assinado. Ver [distribuicao.md](distribuicao.md).
- Os testes com IA usam um modelo simulado. A integração foi verificada com a OpenRouter simulada no nível da rede; uma rodada com a chave real fica para o primeiro uso.
- O `tools/judge-probe.php` não é executado nos testes (precisa da chave e da rede); os testes chamam diretamente as funções do `ai.php` que ele usa.
- **O agente roda a partir da pasta do projeto**: o processo é `agent/sidecar.mjs` com o `node_modules` daqui (o SDK traz o Claude Code para Apple Silicon, ≈ 230 MB). Um `.app` gerado neste Mac o encontra pelo caminho do projeto gravado na compilação; levar o agente dentro do `.app`, para outro Mac, ainda não está feito (ver [distribuicao.md](distribuicao.md)).
