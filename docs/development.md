# Desenvolvimento

Notas técnicas do Edukors Graph Editor: a arquitetura sobre o Edukors Common, os testes, a estrutura do código e como manter o editor em dia com o repositório [edukors_graph](https://github.com/mgarlabx/edukors_graph). Para a apresentação e a instalação, ver o [README](../README.md); para assinatura, instaladores, loja e releases, [distribution.md](distribution.md).

## Requisitos e comandos

Node 22.12+ e git (o Common vem do GitHub, por `git+https`, com `.npmrc` `allow-git=root`). Para os testes de paridade: `php` 8.4+ e o repositório `edukors_graph` (por padrão em `~/Library/CloudStorage/Dropbox/EDUKORS/edukors_graph`, ou em `EDUKORS_GRAPH`); sem eles, esses testes são pulados.

```sh
npm ci
npm start                                   # build (esbuild) e o app no Electron; dados em .local-data/
node node_modules/typescript/bin/tsc --noEmit
npm test                                    # vitest
node scripts/build.mjs --no-bump && node scripts/smoke-electron.mjs   # o app de verdade, janelas ocultas, dados temporários
node scripts/smoke-legacy.mjs               # a migração da 2.20, sobre uma cópia de dados reais (GRAPH_LEGACY_SOURCE)
npm run package                             # instaladores deste sistema em release/ (montados fora do Dropbox)
```

`scripts/build.mjs` grava em `package.json` a versão do dia (`YY.M.D`, a regra do Common); `--no-bump` mantém a que está (e é o padrão na CI), `--version=X.Y.Z` escolhe outra. Ele também regenera os validadores (`scripts/gen-validators.mjs`).

As strings da interface ficam em `src/i18n/locales/{pt,en,es}.json`, editadas diretamente (as três com as mesmas chaves).

Depois de qualquer `npm install`, o lockfile volta a apontar o Common por `git+ssh` e o `package.json` por `github:`; trocar os dois de volta para `git+https://github.com/mgarlabx/edukors_common_ux.git` (o README do Common explica o motivo).

## Arquitetura

O editor é um app do [Edukors Common](https://github.com/mgarlabx/edukors_common_ux), como o Slides e o Text: janela, barra de título, toolbar, abas, Abrir/Salvar/Recentes, rascunhos, configurações, ajuda, termos, tema, aviso de atualização e o assistente de IA vêm dele.

- **Processo principal** (`src/main/index.ts`): `startDesktopApp({appId: 'graph', documentExtensions: ['.egrx'], openExtensions: ['.egf', '.json']})` mais a ponte `window.graph` (`preload.ts`, registrado na sessão; o remetente é conferido em toda chamada): preferências do Graph; a chave da OpenRouter guardada com `safeStorage`, que nunca chega à página, e as chamadas só para `https://openrouter.ai/` (`openrouter.ts`); exportação `.egf`/HTML com guarda de destino (`files.ts`); tela cheia; a migração única dos dados da 2.20 (`legacy.ts`, só lendo a pasta antiga).
- **Quadros** (`src/app/frames.ts`): o player do preview, o mapa do curso e as prévias HTML do inspetor vêm de `graph-frame://doc/<id>`, servidos pelo processo principal, em sandbox e sem a ponte. A página tem CSP estrita (`script-src 'self'`); os validadores do Ajv são pré-compilados para não precisar de `eval`.
- **Página** (`src/common/`): `config.ts` (ajuda: guia rápido, guia do professor dos `docs/teacher-guide*.md`, termos), `document.ts` (Salvar grava só `.egrx`; `.egf`/`.json` abrem como importação não salva), `tabs.ts` (abas do Common ↔ cursos do Graph), `assistant.ts` (as ferramentas do curso para o assistente do Common), `editor.tsx` (mapa, EGF, preview e problemas na área de trabalho, inspetor na barra lateral, grupo do Graph na toolbar, Exportar, atalhos, a seção "IA no preview" das Configurações), `legacy-conversations.ts` (as conversas da 2.19/2.20 no histórico do curso).
- **Formato**: `src/course/egrx.ts`, descrito em [formats/egrx-v1.md](formats/egrx-v1.md).

## Testes

| Teste | O que garante |
| --- | --- |
| `tests/validate.parity.test.ts` | A validação do editor acusa erro **exatamente quando** o `validate.php` do player recusaria importar o curso, nos três samples e em 36 tipos de curso quebrado de propósito (94 casos). As linhas que o editor imprime ficam num snapshot, tirado quando ainda batiam linha a linha com o `validate_course.py`, que o `edukors_graph` não tem mais. |
| `tests/judge.parity.test.ts` | Montagem do pedido, leitura da resposta, recusas, piso de confiança, chaves gravadas, prompt de feedback e escolha da edge são idênticos a `ai.php`, `course.php` e à classe `Course` do próprio player. |
| `tests/course.test.ts` | Abrir e salvar os samples devolve o arquivo **byte a byte**; edições do grafo preservam a ordem das edges e as referências; idiomas. |
| `tests/insert.test.ts` | Inserir um tipo, pelo menu **Inserir** ou pelo ＋ da barra, cria o nó com o próximo id livre ao lado da seleção, selecionado e enquadrado no mapa, de qualquer vista; o que se digitava na aba EGF entra antes, sem apagar o nó novo. |
| `tests/positions.test.ts` | As posições ficam no `position` de cada nó, arredondadas e antes do título; mover é uma alteração do curso, desfeita num passo; nada mudando, o curso é o mesmo objeto; o agente reescrevendo o curso não tira os nós do lugar. |
| `tests/tabs.test.ts` | Cada aba guarda o seu curso, histórico, seleção e preview; nós colados de outro curso ganham ids novos, as referências dentro do grupo os acompanham e os textos ficam nos idiomas do curso de destino. |
| `tests/errors.test.ts` | Os erros da validação, do julgamento da IA e do lado nativo aparecem no idioma da interface (pt, en, es), enquanto o inglês comparado nos testes de paridade continua o do script e o do servidor; JSON quebrado é apontado por linha e coluna. |
| `tests/markup.test.ts` | A barra do editor de conteúdo: o que cada comando escreve e seleciona, em Markdown e em HTML, e como desfaz a marcação que já está lá; o `{{STORAGE: …}}` que um prompt completa. |
| `tests/egrx.test.ts` | Os cursos do corpus voltam byte a byte (`.egf` → `.egrx` → `.egf`); leitura estrita (outro app, versão mais nova, JSON quebrado com linha e coluna); conversas legadas preservadas. |
| `tests/main.test.ts` | A regra da OpenRouter, a guarda de exportação e a migração da 2.20 (pasta antiga intacta, nada sobrescrito). |
| `tests/legacy-conversations.test.ts` | As conversas da 2.19/2.20 viram conversas do Common. |
| `scripts/smoke-electron.mjs` | No Electron, com janelas ocultas e dados temporários: o shell do Common e as pontes, `.egf` importado, `.egrx` salvo e reaberto, original intacto, exportações, Monaco, o player no quadro `graph-frame:` sob a CSP, o painel de IA, sem erros na página. Roda na CI nos três sistemas. |
| `scripts/smoke-legacy.mjs` | A migração da 2.20 no app real, sobre uma cópia de dados reais. |
| `.github/workflows/release.yml` | Instalar por cima da v2.20.0 real: no Windows (a 2.20 sai, os dados ficam, o app novo e o atalho entram) e no Linux (`.deb`). |

## Estrutura

```
src/
  main/         processo principal: host do Common, ponte window.graph, OpenRouter, exportação, migração da 2.20
  common/       a parte do Graph na página do Common (config, documento, abas, assistente, editor)
  store/        estado (zustand), undo/redo, layout, preferências do Graph, cursos abertos
  schema/       schema.json, validadores pré-compilados, tipos gerados, textos de ajuda lidos do schema
  validate/     validação (camada 2) e painel de problemas
  course/       operações no grafo, serialização fiel, o formato .egrx
  canvas/       React Flow: nós, edges, seções, layout ELK
  inspector/    formulários por tipo de nó, campos localizados, editor de conteúdo em tela cheia
  conditions/   editor de when em árvore
  json/         aba Monaco, sincronizada nos dois sentidos
  preview/      player verbatim + shim (o bridge.js do editor) + painel do preview
  judge/        porte do ai.php (geração e julgamento)
  i18n/         idiomas do curso, strings da interface (pt, en, es)
  ai/           cliente OpenRouter do preview, preços dos modelos
  agent/        o prompt e as especificações das ferramentas do curso, usadas pelo assistente do Common
build/          ícone, entitlements, after-pack, instalador NSIS (installer.nsh), blocos da Store (appx/)
assets/         course_player.html e course_viewer.html (cópias verbatim)
scripts/        build, package, smoke, update-assets, gen-types, gen-validators, release-notes, public-installers
```

## Manter em dia com o repositório

```sh
npm run update-assets          # copia schema, player e viewer
node scripts/update-assets.mjs --check
```

O script também vigia o código que o editor porta — `bridge.js`, `ai.php`, `course.php`, as classes `Ai`, `JudgeView` e `Course` do player e o `validate.php` — e avisa qual arquivo do editor revisar quando um deles muda. Depois, `npm test` diz se a paridade se manteve.

## Limitações conhecidas

- **Assinatura**: o app do Mac sai assinado e notarizado pelo fluxo de release; um build local só é assinado quando o certificado *Developer ID* está no Keychain. O instalador do Windows não é assinado; a cópia da Microsoft Store é assinada pela própria Store.
- **Mídia própria** (imagens e vídeos guardados no `.egrx`) fica fora desta versão: imagens e vídeos continuam por link, como no `.egf`.
- Os testes com IA usam um modelo simulado; o `tools/judge-probe.php` não é executado nos testes.
