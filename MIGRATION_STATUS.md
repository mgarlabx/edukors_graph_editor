# Estado da migração — Graph Editor → Edukors Common e `.egrx`

Atualizado em 04/11/2026. Plano: `PLANO_MIGRACAO_EGRX.md`. Branch `migration/egrx-common` (a partir de `main` = `8e7629b`, v2.20.0). **Nada foi commitado, publicado, enviado à loja ou marcado com tag.**

Decisões D1–D12: adotadas as recomendações do plano (o usuário pode trocar qualquer uma).

## Rodada 10 (05/11/2026) — deploy (prevalece sobre o abaixo)

Pedido do usuário: deploy completo (notarização da Apple e Microsoft Store), com a transição "mais completa e transparente" para quem tem a 2.20.

- **Common:** nada a subir (repositório limpo e igual ao `origin/main`; o instalado no Graph era idêntico ao `b776e8b`, sem patches). O Graph passou para o `409adb2` (indicador de Salvar/Exportar). Typecheck, 261 testes e 20/20 no Electron.
- **Versão 26.11.5**, com seção no CHANGELOG.
- **Empacotamento** (`electron-builder.yml`): Mac (DMG e ZIP universais, UTIs `.egrx`/`.egf`), Windows (NSIS por usuário e MSIX `mgarlabx.EdukorsGraphEditor`, `applicationId` `EdukorsGraphEditor`, blocos em `build/appx/` por `scripts/appx-tiles.py`) e Linux (AppImage e `.deb` `edukors-graph-editor`).
- **Transição da 2.20 (D5/S4: `latest.json` completo):**
  - `scripts/tauri-update.mjs` escreve o `latest.json` que a 2.20 lê, apontando para os instaladores novos; antes, confere cada assinatura minisign contra a chave pública da v2.20.0;
  - no Mac, `.app.tar.gz` do app notarizado. Simulado aqui: a extração como no Tauri mantém a assinatura válida;
  - no Windows, `build/installer.nsh` remove a 2.20 (desinstalador do Tauri em modo silencioso: fecha o app, mantém `%APPDATA%\org.edukors.grapheditor`);
  - no Linux, o `.deb` usa o mesmo nome de pacote.
- **CI e release reescritos** a partir dos do Slides:
  - `release.yml` instala por cima da v2.20.0 real no Windows e no Linux a cada execução;
  - a Store só recebe o pacote depois que a release do GitHub sai;
  - `STORE_AUTO_SUBMIT=true` foi mantido, como o usuário pediu.
- **Docs:** README, `docs/distribution.md`, `docs/development.md`, `docs/formats/egrx-v1.md` e os guias do professor (pt/en/es).

## Rodada 9 (04/11/2026) — build local instalado em /Applications (prevalece sobre o abaixo)

- **Ajustes:** sem a bolha de erros ao passar o mouse sobre um nó (fica só o selo; os erros estão no painel de problemas); sem a contagem de erros no rodapé; sem o botão de tela cheia nem o seletor de idioma na barra do preview (o idioma fica no próprio player); separadores do Graph ocultos sem documento; barra lateral sempre fechada ao abrir; botões de edição acompanham a seleção e o histórico.
- **Empacotamento:**
  - `electron-builder.yml` com `org.edukors.grapheditor` e associações `.egrx`/`.egf`;
  - `build/` com ícone, entitlements e `after-pack`, que também limpa os atributos do Dropbox;
  - `scripts/package.mjs` monta fora do Dropbox;
  - só o Common é dependência de execução (o resto vai no bundle).
- **Versão por data:** `package.json` 26.11.4 (v.26.11.04).
- **Instalado** em `/Applications/Edukors Graph Editor.app`: arm64, Developer ID, sem notarização; `codesign --verify --deep --strict` ok e registrado no Launch Services. Testado empacotado (oculto, dados temporários): mapa, migração da 2.20, termos aceitos trazidos, sem erros.
- **A 2.20.0 instalada foi guardada** em `~/EdukorsBackups/graph-egrx-20261104-114601/installed-app-2.20.0/`. Para voltar: apagar o app novo e mover essa cópia de volta para `/Applications`. Os dados da 2.20 continuam intactos em `~/Library/Application Support/org.edukors.grapheditor`; o app novo usa `~/Library/Application Support/Edukors Graph Editor`.
- Por pedido do usuário: **sem deploy** (sem commit, tag, push, release ou loja) por alguns dias de uso local.

## Rodada 8 (04/11/2026) — ajustes pedidos depois de ver o app (prevalece sobre o abaixo)

- **Toolbar, nesta ordem:**
  - Arquivo (novo, abrir, recentes, salvar, exportar, pasta);
  - Visualizar (mapa, EGF, preview, preview com mapa);
  - desfazer e refazer;
  - recortar, copiar, colar, duplicar, excluir;
  - novo nó, enquadrar, erros;
  - configurações e ajuda.

  "Organizar automaticamente" ficou só no atalho ⇧⌘L.
- **Idioma do mapa:** um só lugar, o "Idioma dos textos" do inspetor; o globo saiu da toolbar.
- **Preview e preview com mapa:** botão para abrir e fechar o painel de chamadas, que começa fechado.
- **Exportar pela tela padrão do Common** (`EdukorsFileDialogs.exportAs`, como no Slides): formatos "Curso (.egf)" e "Player (HTML)", gravados ao lado do `.egrx` com o mesmo nome. Um curso sem arquivo é salvo antes; um arquivo existente só é substituído depois de "Substituir".
- **Decisão do usuário (04/11/2026), "por enquanto":** a exportação pode substituir o `.egf` de origem, só depois do "Substituir" da tela do Common (que não deixa mudar nome nem pasta). O `.egrx` nunca é substituído por uma exportação.
- Verificado: typecheck, 261 testes, `smoke-electron.mjs` 17/17.

## Rodada 7 (04/11/2026) — escala da interface e CSP (prevalece sobre o abaixo)

- **Tamanho da interface (Configurações do Common, 80–200%):** o CSS do Graph usa px fixos, o que deixava a escala misturada (diálogo com título pequeno e tabela enorme). Agora a fonte-base do Graph fica fixa e inspetor, diálogos, painel de problemas, editor de conteúdo e seção de configurações escalam por `zoom`. Mapa, aba EGF e preview têm zoom próprio e ficam de fora. Conferido em tema claro a 200%: idiomas, juiz, EGF e problemas.
- **CSP estrita na página** (`scripts/build.mjs`): `script-src 'self'`, sem `unsafe-eval` nem `unsafe-inline` para scripts; `frame-src graph-frame:`; `object-src 'none'`.
  - Os quadros do editor (player do preview, mapa do curso, prévias HTML do inspetor) vêm de `graph-frame://doc/<id>`, servidos pelo processo principal (`src/app/frames.ts`). Como na 2.20, não têm CSP própria (o player carrega o KaTeX do cdnjs; o conteúdo pode ter recursos `https://`), mas continuam em sandbox, com origem opaca e sem a ponte.
  - O Ajv compilava o schema em tempo de execução (`new Function`). Agora os validadores são pré-compilados (`scripts/gen-validators.mjs` gera `src/schema/validators.generated.js`, autocontido). O build e o `update-assets` os regeneram, e os testes de paridade com o PHP passam iguais. O `schema.json` não mudou (SHA-256 `3f9edf19…`, o da linha de base).
- Verificado: typecheck, 261 testes, `smoke-electron.mjs` 16/16 (com o player rodando no quadro `graph-frame:` e a CSP conferida), `smoke-legacy.mjs` 9/9; roteiros visuais sem erros.

## Rodada 6 (04/11/2026) — histórico das conversas da 2.20 e conferência visual (prevalece sobre o abaixo)

- **Conversas da 2.19/2.20 no histórico do curso** (`src/common/legacy-conversations.ts`): ao importar um `.egf`, as conversas que a 2.20 guardou sobre aquele arquivo viram conversas do Common. Passam as falas, as respostas e as ferramentas chamadas; o `resumeId` antigo não, então continuar uma delas abre sessão nova. A cópia integral continua na parte legada do `.egrx`. Nas três conversas reais desta máquina não havia curso associado (eram de cursos não salvos).
- **Conferência visual** em tema escuro, português e fonte a 150%: mapa, inspetor e editor de conteúdo. O editor fica na área de trabalho, com o inspetor e o botão da IA visíveis.
- **Corrigido:** o mapa abria desenquadrado, com os passos sob a borda esquerda, porque os painéis do Common se ajustam depois que o curso chega. Agora o mapa se reenquadra quando a área assenta, até a pessoa mexer no mapa.
- Idiomas do curso e juiz continuam pelo inspetor (aba do curso e nó de julgamento), como na 2.20.
- Verificado: typecheck, 261 testes, 15/15 em `smoke-electron.mjs`, 9/9 em `smoke-legacy.mjs`.

## Rodada 5 (04/11/2026) — primeiro uso e ajustes de interface (prevalece sobre o abaixo)

- **Migração da 2.20 completa** (`src/main/legacy.ts`, uma vez e só lendo a pasta antiga):
  - termos já aceitos vão para `terms.json` do Common;
  - Recentes que ainda existem vão para `recent.json` do Common;
  - idioma, tema e largura do painel de IA são aplicados uma vez pelos próprios controles do Common;
  - preferências do Graph, configurações da IA e skills, como antes.
- A migração grava na pasta que o Common lê (`commonAppDir()`): empacotado, `userData`; em testes, `<--data-dir>/apps/graph`.
- **Conversas da 2.19/2.20:** ao importar um `.egf`, as conversas que a 2.20 guardou sobre aquele arquivo (pela `coursePath`) entram inteiras na parte legada do `.egrx`. Ainda não aparecem no histórico do painel (só ficam preservadas).
- **Interface:**
  - o inspetor fica visível também no preview (a barra lateral não fica vazia);
  - o editor de conteúdo em tela cheia passa a cobrir só a área de trabalho, deixando o painel de IA do Common ao lado (**não conferido visualmente**).
- Na 2.20 os exemplos world-cats não tinham acesso pela interface; continua assim.
- `scripts/smoke-legacy.mjs`: migra no app real (janelas ocultas) uma cópia dos dados reais da 2.20 tirada do backup. **7/7**: configurações da IA, skills, termos, Recentes existentes (5 de 10), idioma `en` e tema claro aplicados, pasta antiga intacta.
- Verificado: typecheck, 259 testes, 15/15 em `smoke-electron.mjs`, 7/7 em `smoke-legacy.mjs`.

## Rodada 4 (04/11/2026) — imagens também fora da especificação (prevalece sobre o abaixo)

- Decisão do usuário: **mídia própria do `.egrx` (imagens, como já os vídeos) fica fora desta versão**, a resolver depois.
- O `.egrx` guarda `graph/course.json` = `{format, version, style, course}`, as conversas da IA (Common) e as conversas legadas. Exportar `.egf` grava o curso como está (byte a byte quando não editado); o HTML do player sai como na 2.20.
- Removidos do Graph: referências `egrx:media/…`, partes de mídia, endereço base e pasta de mídia na exportação, o botão Imagem do computador, o `src/app/media.ts` e o tratamento nas prévias. O `store/media.ts` virou `store/extras.ts` (só as conversas legadas).
- Verificado: typecheck, 258 testes e 15/15 no Electron.

## Rodada 3 (04/11/2026) — vídeo fora da especificação (prevalece sobre o abaixo)

- Decisão do usuário: **vídeos `.mp4` saem desta versão do formato**, a resolver depois. O `.egrx` guarda só imagens; o `.egf` exportado continua só com links.
- Removidos do Graph: `mp4` do codec (um `.mp4` não é aceito como mídia), o botão Vídeo, o protocolo `egrx-media://` e o registro de mídia no processo principal; no preview e nas prévias, as imagens vão como `data:`.
- Permanecem no Common (`b776e8b`), por serem genéricos: o tipo `video` do `pickFiles`, o `minimizeShortcut`, o modo Planejar e a correção de nomes com espaço.
- Verificado: typecheck, 263 testes e 16/16 no Electron (saíram as duas checagens de vídeo).

## Rodada 2 (04/11/2026) — mídia na interface e mudanças no Common (prevalece sobre o abaixo)

**Graph (no branch, sem commit):**
- Editor de conteúdo: botões **Imagem do computador** e **Vídeo do computador (.mp4)** pelo `EdukorsFiles.pickFiles` do Common. O arquivo vira mídia do curso (`src/store/media.ts`) e o texto recebe `<img src="egrx:media/…">`, `![](egrx:media/…)` ou `<video controls src="egrx:media/…">`.
- `src/app/media.ts` (`forFrames`): no preview, no mapa e nas prévias do inspetor, as imagens vão como `data:` (o sanitizador do player as aceita) e os vídeos por `egrx-media://<curso>/<arquivo>`, com Range. Isso vale só dentro do editor; Salvar e Exportar não mudam.
- O registro das mídias no processo principal acompanha cada mudança (`tabs.ts`).
- `minimizeShortcut: false`: o ⌘M volta a mostrar o Mapa.
- Nomes de mídia com espaço voltam a ser aceitos (o bug foi corrigido no Common).
- Teste de fumaça com **18/18**, incluindo a imagem do `.egrx` exibida dentro do player, o vídeo servido com Range (206) e o `pickFiles` de vídeo.

**Common: commit `b776e8b` publicado na `main` (autorizado pelo usuário); o lockfile do Graph aponta para ele, em `git+https`:**
- `src/package/package.js`: atributos XML com espaço no valor (como `Target="media/a b.png"`) eram recusados; agora só texto que não seja atributo entre eles é recusado. Dois testes novos.
- `pickFiles` com tipo `video` (`.mp4`, `.webm`; 500 MB) no host e no navegador; documentado em `docs/common-shell.md`.
- `startDesktopApp({ minimizeShortcut: false })`: o Minimizar do menu do macOS fica sem o ⌘M.
- Modo **Planejar** no assistente: o agente só lê e propõe; ferramentas que alteram e ações nativas (arquivos e comandos) são recusadas; cada pedido leva o aviso. Traduções nos cinco idiomas; `ai-settings` aceita `mode: "plan"`; descrito em `docs/ai.md`.
- Verificado: `node --test` 147/147. Regressão contra esse Common: Text 27/27 (`node --test`); Slides `test.mjs` 57/57, headless (galeria, canvas, ESF e PPTX → ESLX) e Electron oculto 20/20. Os `node_modules` do Text e do Slides foram restaurados depois.
- Graph verificado com o Common instalado do GitHub (`b776e8b`): typecheck, 263 testes, build e 18/18 no Electron.
- Observação: o `tools/customize-common.mjs` do Text Editor, ainda não commitado, quebra o build com qualquer Common a partir de `c1e7783`, porque esse commit já deixou o diálogo só com Cancelar/Substituir. A falha não vem destas mudanças; o ajuste do Text ficou obsoleto.

## Feito (rodada 1)

### Fase 0 — Backup (concluída e verificada)

- Em `../migration-backups/graph-egrx-20261104-114601/` e uma cópia fora do Dropbox em `~/EdukorsBackups/graph-egrx-20261104-114601/` (conferida pelo `MANIFEST.sha256`).
- Bundles git verificados dos cinco repositórios (Graph, Common, Slides em `4719279`, Text, edukors_graph), snapshots e patches das árvores, lockfiles, tarballs do `@edukors/ai-cli` 0.2.2 e do `@edukors/ai-ui` 0.1.4, `agent-bundle` da 2.20.0, todos os artefatos da release v2.20.0, dados do app (`prefs.json`, `agent/history`, skills) e o corpus de cursos.
- Credenciais não copiadas: `agent/codex`, `agent/antigravity` e `EDUKORS/ai` aparecem só em inventário com SHA-256. A chave da OpenRouter no Keychain só foi registrada como presente.
- Linha de base do schema: SHA-256 `3f9edf19…` idêntico em `src/schema/schema.json`, `edukors_graph/schema/schema.json` e `_code/public_html/graph/schema/v1/schema.json`. **O schema não foi alterado.**
- Restauração de prova numa pasta isolada: `npm ci`, typecheck, 275 testes e build ok (`RESTORE_REPORT.md`).

### Formato `.egrx` (Fases 2 e 4)

- `src/course/egrx.ts`: o pacote do Common com `graph/course.json` = `{format: "edukors.graph.course", version: 1, style, publishing, course}`, mídia em `graph/media/<arquivo>` por relationship (imagens e `.mp4`), conversas da IA do Common e uma parte para as conversas legadas. A referência local é `egrx:media/<arquivo>` (nome codificado como URL).
- Importação de `.egf`/`.json` com o estilo do JSON preservado.
- Exportação `.egf` **só com links** (`<endereço base>/<arquivo>`, nada embutido); os arquivos de mídia são gravados numa pasta ao lado do export para publicação.
- `tests/egrx.test.ts` (20 testes): os 11 cursos do corpus voltam byte a byte (`.egf` → `.egrx` → `.egf`), mídia, links, endereço base obrigatório, referências ausentes relatadas, nomes portáteis, leitura estrita (outro app, versão mais nova, JSON quebrado com linha e coluna) e conversas legadas preservadas.

### Electron + Common (Fase 3)

- Removidos `src-tauri/` (Rust), o shell próprio (`App.tsx`, `Toolbar`, `DocTabs`, Help/About/Update/Terms), o menu nativo, o atualizador Tauri, o agente legado (`src/agent/{client,store,events,transcript,history,mcpConfig,…}`, componentes, `AgentSkills`, `PrefsDialog`), os scripts `stage-agent`, `make-msix`, `bump-version` e `check-compat`, Vite e os e2e em WebKit.
- **Zero `@edukors/ai-cli` / `@edukors/ai-ui` / `@tauri-apps`** no `package.json`, no lockfile e no `node_modules` (`npm ls` vazio).
- Dependência `edukors-common-ux` por `git+https…#main`, travada em `90178c8`, com `.npmrc` `allow-git=root`. Electron 44.10.0, electron-builder 26.17.0 e esbuild 0.28.2.
- **Processo principal** `src/main/index.ts`: `startDesktopApp({appId: 'graph', documentExtensions: ['.egrx'], openExtensions: ['.egf', '.json'], exportFormats: []})` mais a ponte `window.graph` (preload registrado na sessão, remetente conferido em toda chamada):
  - preferências do Graph;
  - chave da OpenRouter com `safeStorage`, sem nunca ir para a página;
  - POST e modelos só para `https://openrouter.ai/`;
  - exportação `.egf`/HTML com guarda de destino (`src/main/files.ts`);
  - mídia servida em `egrx-media://` com Range;
  - tela cheia.
- **Migração dos dados da 2.20** (`src/main/legacy.ts`), uma vez e só lendo o legado:
  - `prefs.json` vira `graph-preferences.json` e o `ai-settings.json` do Common;
  - as skills vão para a pasta de skills do Common;
  - as conversas são copiadas para `legacy-conversations/`;
  - fica registrada em `migration.json`.
- **Página** `src/common/`:
  - `config.ts` (`EdukorsAppConfig`, ajuda com guia rápido, guia do professor e termos);
  - `document.ts` (`EdukorsAppDocument`: Salvar grava só `.egrx`; `.egf`/`.json` abrem como importação não salva; sem `saveOriginal`);
  - `tabs.ts` (abas do Common ↔ cursos do Graph, modificado e rascunhos);
  - `assistant.ts` (`EdukorsAiAssistant` com as 9 ferramentas do curso, pasta privada);
  - `editor.tsx` (mapa, EGF, preview e problemas na área de trabalho; inspetor na barra lateral; grupo do Graph na toolbar; Exportar; atalhos; seção "IA no preview" nas Configurações).
- `src/store/prefs.ts`: só as preferências do Graph; o idioma segue o do Common (zh e hi mostram inglês). O tema do preview segue o do Common. O Apresentar usa a tela cheia do HTML.
- `scripts/build.mjs` (esbuild, versão por data, `--no-bump`) e `scripts/smoke-electron.mjs`.

## Verificação (04/11/2026)

- `node node_modules/typescript/bin/tsc --noEmit`: limpo.
- `node node_modules/vitest/vitest.mjs run`: 14 arquivos, 263 testes, todos passam. Inclui as paridades com o PHP, `egrx.test.ts` e `main.test.ts`: regra da OpenRouter, guarda de exportação, migração do legado com a pasta antiga intacta e sem sobrescrever.
- `node scripts/build.mjs --no-bump && node scripts/smoke-electron.mjs`: **15/15** no Electron real com janelas ocultas e dados temporários:
  - shell do Common e as duas pontes;
  - `.egf` aberto como importação não salva, com todos os passos no mapa;
  - inspetor na barra lateral;
  - `.egrx` gravado pelo host do Common e reaberto;
  - original intacto;
  - exportação `.egf` idêntica byte a byte;
  - Monaco, preview com o player e painel de IA;
  - sem erros na página.

## Pendências (em ordem)

1. (Mídia própria: fora desta versão, por decisão do usuário.)
2. **Common:** o chip de seleção no compositor não foi feito.
6. **Empacotamento:**
   - `electron-builder.yml` com `org.edukors.grapheditor`, MSIX `mgarlabx.EdukorsGraphEditor` / `CN=25CB0A95-…` e os mesmos três idiomas;
   - NSIS, AppImage e `.deb` com o nome de pacote atual;
   - associações `.egrx` e `.egf`;
   - exclusão dos binários do SDK;
   - `build/` com ícone, entitlements e after-pack;
   - `scripts/package.mjs`.
7. **CI e release:** `.github/workflows/{ci,release,store}.yml` ainda são do Tauri e precisam ser reescritos a partir dos do Slides. `STORE_AUTO_SUBMIT=true` continua ligado: **desligar antes de qualquer tag**.
8. **Transição da 2.20** (S4: `latest.json` compatível ou versão-ponte) e testes no Windows e no Linux (S5).
9. **Documentação:** README, CHANGELOG (em inglês), guias pt/en/es (sem Node; `.egrx`; Exportar → .egf), `docs/development.md`, `docs/distribution.md`.
10. **DMG local** isolado para homologação; nada publicado antes do aceite.

## Comandos (sem janelas)

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run
node scripts/build.mjs --no-bump
node scripts/smoke-electron.mjs          # Electron com EDUKORS_HIDDEN=1 e dados temporários
```

Nesta máquina, usar o npm compatível: `node /usr/local/lib/node_modules/npm/bin/npm-cli.js`. Depois de qualquer `npm install`, o lockfile volta a apontar o Common por `git+ssh`; corrigir para `git+https` (o README do Common explica o motivo).
