# Plano de migração do Edukors Graph Editor para o Edukors Common e o formato `.egrx`

Data: 04/11/2026. Estado: em execução, com as recomendações de D1–D12 adotadas (o usuário pode trocar qualquer uma); progresso em `MIGRATION_STATUS.md`. A base abaixo foi examinada só por leitura, sem alterações em nenhum repositório.

## Requisitos confirmados pelo usuário

- Migrar o Graph para o padrão `.egrx` em vez de `.egf`. Migração robusta e cautelosa, começando por um backup.
- O código novo usa o `edukors_common_ux` como base.
- Nenhuma dependência legada de `edukors_ai_cli` (`@edukors/ai-cli`, `@edukors/ai-ui`) permanece.
- Referência: a migração já feita no `edukors_slides_editor`.
- O schema do `.egf` permanece sem alterações.
- **Mídia própria do pacote (imagens e vídeos) fica fora desta versão do formato** (decisões do usuário em 04/11/2026: complexo demais por ora; a ser resolvido depois). O `.egrx` guarda o curso e as conversas da IA; imagens que o autor já escreve no conteúdo (`data:` ou `https://`) continuam texto do curso.

## 1. Ponto de partida (04/11/2026)

| Repositório | Estado |
| --- | --- |
| `edukors_graph_editor` | v2.20.0, `main` = `origin/main` = `8e7629b`, árvore limpa. Tauri 2 + Rust + React/Vite, com `@edukors/ai-cli` 0.2.2 e `@edukors/ai-ui` 0.1.4 |
| `edukors_common_ux` | `main` = `origin/main` = `90178c8`, árvore limpa |
| `edukors_slides_editor` | Migração para o Common feita, mas **não commitada** (83 arquivos sobre `ef06e9d`) |
| `edukors_text_editor` | `7edb629` mais alterações locais. É a referência do contrato do Common |
| `edukors_graph` | Schema, player PHP e plugin Moodle, que consomem `.egf` (`6bc743c`) |

## 2. O que define o trabalho

1. **O runtime muda.** O Common é Electron por regra ("Desktop runtime: Electron"); o Graph é Tauri. Tudo o que está em `src-tauri/` passa para o `startDesktopApp` do Common e para um processo principal do Graph, como o Slides fez com `src/main/index.ts` e um preload próprio com remetente conferido. Isso inclui arquivos, preferências, Keychain, chamadas à OpenRouter, menu nativo, instância única, abertura pelo Finder, atualizador, detecção da Store e o processo do agente.
2. **O `.egf` continua sendo o formato do ecossistema.** O player PHP, o plugin Moodle e a galeria do site recebem `.egf`, e o `schema.README` de `edukors_graph` manda gravar cursos como `.egf`. Por isso ele vira um comando de **Exportar**, com o mesmo serializador de hoje (`src/course/serialize.ts`). O schema não muda.
3. **O Common já reserva `.egrx` e a pasta `graph/` para o Graph** (`EdukorsPackage.EXTENSIONS.graph`). A conversão de `.egf` para pacote aparece como pendência em `docs/document-package.md` do Common.
4. **A IA deixa de exigir Node instalado.** Hoje o Rust (`src-tauri/src/agent.rs`) inicia um processo Node (versão 22.12 ou mais nova) instalado pela pessoa, com o host do `ai-cli`. No Common, a IA roda no próprio Electron. As contas continuam valendo, porque o registro compartilhado é o mesmo arquivo nos dois: `~/Library/Application Support/EDUKORS/ai/registry.json` (no Windows, `%LOCALAPPDATA%\EDUKORS`; no Linux, `~/.local/share/edukors`).
5. **O que o Graph tem e o Common não tem:**
   - modo Planejar (`plan_ready`);
   - chip de seleção no compositor;
   - exportações próprias com vários arquivos (o Common só exporta html, pdf, png, md, txt e docx, sempre num arquivo único);
   - instalação automática de atualizações (o Common só avisa, com link);
   - atalho ⌘M livre: no menu mínimo do macOS do Common ele é Minimizar, e no Graph mostra o Mapa.
6. **Mídia própria fora desta versão** (decisão do usuário): imagens e vídeos dentro do `.egrx` pedem um desenho próprio (referências, exportação com links, memória, rascunhos) e ficam para depois.
7. **Há dados fora do curso** (macOS: `~/Library/Application Support/org.edukors.grapheditor/`; nos outros sistemas, a pasta de dados equivalente do Tauri):
   - `prefs.json`;
   - `agent/history` (3 conversas na máquina examinada);
   - `agent/plugin/skills`;
   - `agent/codex` e `agent/antigravity`, sobras de integrações antigas que podem conter credenciais.

   A chave da OpenRouter está no Keychain (serviço `org.edukors.grapheditor`, conta `openrouter`), no Credential Manager (Windows) ou no Secret Service (Linux).
8. **A transição de quem já tem o app é um risco.**
   - A 2.20.0 (release "Latest") procura o `latest.json` do atualizador Tauri. Uma release Electron sem esse arquivo deixaria parados, sem aviso, os usuários do DMG, do `.exe`, do AppImage e do `.deb`. Pela Microsoft Store, a mesma identidade leva a atualização normalmente.
   - A variável `STORE_AUTO_SUBMIT` está `true`: qualquer tag `v*` envia um pacote para certificação.
9. **O site não precisa mudar** se os nomes fixos `Edukors-Graph-Editor-{mac.dmg,windows.exe,linux.AppImage,linux.deb}` forem mantidos (`_code/public_html/graph/graphView.js` e o README os usam).

## 3. Regras que valem para todas as fases

- **Entradas:** `.egf` e `.json` abrem como importação, numa aba nova sem arquivo. O original nunca é gravado.
- **Saída:** Salvar e Salvar como gravam só `.egrx`. Isso é conferido na página, no processo principal e no codec.
- **Exportar é separado de Salvar:** gera o `.egf` (o curso como está) e o HTML do player. Uma exportação nunca sobrescreve o `.egrx`; o `.egf` de origem só é substituído depois do "Substituir" da tela de exportação do Common (decisão do usuário em 04/11/2026, "por enquanto").
- **O schema do `.egf` não muda:** nem em `edukors_graph`, nem na cópia do editor (`src/schema/schema.json`), nem em `_code`. O SHA-256 é conferido antes e depois; `npm run update-assets` e os testes de paridade com o PHP continuam iguais.
- **Nenhuma funcionalidade some.** O que o Common não tem ganha ponto de extensão nele ou fica no Graph.
- **Mudanças no próprio Common** levam os testes do Common (`node --test`), regressão do Text e do Slides, e push só com autorização do usuário. Depois, o lockfile do Graph é atualizado.
- **Migração de dados:** só lê o legado, pode rodar mais de uma vez sem efeito duplicado e nunca apaga a pasta antiga.
- **Testes sem janela visível** (`EDUKORS_HIDDEN=1` e Chrome headless) e sem `confirm()` ou `alert()` nativos.
- **Nada de commit, push, tag, release ou envio à loja sem autorização do usuário.** Primeiro vem um DMG local para homologação.
- Código, documentação técnica e CHANGELOG em inglês. Nesta máquina, rodar os scripts com `node` direto: o `npm` 12 do PATH é incompatível com o Node 22.13 instalado (npm compatível: `node /usr/local/lib/node_modules/npm/bin/npm-cli.js`).

## Fase 0 — Backup inicial (antes de tocar no código)

O backup vai para `/Users/macstudiomgar/Library/CloudStorage/Dropbox/EDUKORS/migration-backups/graph-egrx-<data-hora>/` e para uma **segunda cópia fora do Dropbox**, já que o Dropbox também replica exclusões.

1. Fechar o app e os builds. Registrar o ambiente (macOS, arquitetura, Node, npm, Rust/cargo, Xcode CLT) e, de cada repositório, HEAD, branches, tags e status: Graph `8e7629b`, Common `90178c8`, Slides `ef06e9d` (com as alterações não commitadas), Text `7edb629`, `edukors_graph` `6bc743c`.
2. Gerar `git bundle --all` dos cinco repositórios e conferir com `git bundle verify`.
3. Tirar um snapshot das árvores de trabalho (arquivos rastreados e não rastreados, sem `node_modules`, `dist` e `target`) mais `git diff --binary`. Isso é essencial para o Slides e o Text, que têm trabalho não commitado; o Slides é a referência desta migração.
4. Guardar o necessário para reconstruir a 2.20.0: `package-lock.json`, `Cargo.lock`, os tarballs de `@edukors/ai-cli@0.2.2` e `@edukors/ai-ui@0.1.4` (`npm pack`) e o `src-tauri/agent-bundle/` atual.
5. Baixar todos os artefatos da release v2.20.0 com `gh release download v2.20.0` (DMG, `.exe`, AppImage, `.deb`, `.app.tar.gz`, `.sig`, `latest.json`), com SHA-256. Opcional: copiar o app de `/Applications` com `ditto`.
6. Copiar `prefs.json`, `agent/history` e `agent/plugin/skills`. **Credenciais nunca em texto aberto:** `agent/codex`, `agent/antigravity` e `~/Library/Application Support/EDUKORS/ai` (contas compartilhadas) entram só como inventário (nome, tamanho, SHA-256), ou numa imagem cifrada criada pelo próprio usuário (`hdiutil … -encryption AES-256`). Da chave no Keychain, só se registra que existe.
7. Montar o corpus de teste em cópias, com SHA-256 de cada arquivo: `samples/*.json` do repositório, `edukors_graph/samples/*.egf`, os `.egf` de `_code/public_html/graph/examples` e os cursos que o usuário indicar. Esses hashes provam depois que nenhum original mudou.
8. Registrar o estado externo: releases e assets, variáveis do repositório (`STORE_AUTO_SUBMIT=true`), nomes dos secrets (sem valores) e a situação no Partner Center (anotada pelo usuário).
9. Escrever um `MANIFEST.json` (arquivos, tamanhos, SHA-256) e um `README.md` do backup com o conteúdo e os passos de restauração.
10. **Restaurar numa pasta isolada, fora do Dropbox:** clonar do bundle, rodar `npm ci`, `tsc --noEmit`, o vitest, `vite build` e o teste de salvar os samples sem mudar um byte (`tests/course.test.ts`). O resultado vai para `RESTORE_REPORT.md`. Só então o backup conta como pronto.
11. Trabalhar no branch `migration/egrx-common`. `main` e a tag `v2.20.0` ficam intactos; correções urgentes da 2.20.x, se necessárias, vão num branch `tauri-2.x`.

## Fase 1 — Inventário, linha de base e provas de viabilidade

- **Matriz de funcionalidades** (`docs/migration/feature-matrix.md`): menu nativo (`src-tauri/src/lib.rs`), atalhos, botões, preferências, ferramentas da IA e exportações, cada item com o arquivo que o implementa, o teste que o cobre e a evidência esperada. Ela é o contrato de regressão.
- **Linha de base:** typecheck, vitest (229 testes segundo `docs/development.md`), paridade com o PHP, e2e atuais, `cargo test`, além de tempos e memória ao abrir, editar, organizar e abrir o preview num curso grande.
- **Provas de viabilidade, cada uma com decisão de seguir ou não:**
  - **S1:** React Flow, ELK, Monaco (com workers) e Ajv funcionando dentro da página do Common (`file:`, CSP estrita), montados nos espaços do shell como no Slides.
  - **S2:** preview, mapa e prévias de HTML. Os iframes `srcdoc` herdam a CSP da página, então provavelmente será preciso um esquema próprio, como o `esf-frame:` do Slides.
  - **S4:** num fork, testar se o atualizador da 2.20 consegue instalar o app Electron: no Mac, `.app.tar.gz` assinado com a chave minisign atual; também `.exe`, AppImage e `.deb`.
  - **S5:** gerar o MSIX com a identidade da Store pelo electron-builder, atualizar por cima do pacote Tauri e conferir os caminhos virtualizados no Windows (`%APPDATA%`, `%LOCALAPPDATA%\EDUKORS`).
  - **S7:** a IA do Common e o `ai-cli` 0.2.2 usando o mesmo registro de contas ao mesmo tempo, com os dois apps abertos (locks e versão do registro).

## Fase 2 — Especificação `.egrx` v1 (`docs/formats/egrx-v1.md`), aprovada antes do codec

```
[Content_Types].xml, _rels/.rels, docProps/core.xml, docProps/app.xml
graph/course.json        { format: "edukors.graph.course", version: 1, style, course }
graph/_rels/course.json.rels
graph/ai/conversations/<id>.json
graph/ai/legacy-conversations.json   (histórico da 2.19/2.20, se houver)
```

- **`course`** é o curso EGF intacto, sem nenhuma alteração de schema.
- **`style`** guarda o estilo do JSON original (indentação, ASCII, quebra final), para o `.egf` exportado sair idêntico.
- **`docProps`:** título no idioma-fonte do curso, `dc:language` = `source-language`, aplicação "Edukors graph" com a versão v.YY.MM.DD.
- **Leitura estrita**, como no Text: documento de outro app, de outro formato ou de versão mais nova é recusado. Uma referência quebrada vira problema de validação, não erro de abertura.
- **Critério de aceite:** importar, salvar, reabrir e exportar um curso sem edição devolve o `.egf` original idêntico, byte a byte, em todo o corpus.

## Fase 3 — Fundação Electron + Common e fatia vertical

- **Dependências:** `edukors-common-ux` por `git+https://github.com/mgarlabx/edukors_common_ux.git#main` (com o SHA fixado no lockfile), `.npmrc` com `allow-git=root`, Electron 44.10.0, electron-builder 26.17.0 e esbuild, como no Slides. Saem `@tauri-apps/*` e `src-tauri/`.
- **Processo principal:** `startDesktopApp({ appId: 'graph', documentExtensions: ['.egrx'], openExtensions: ['.egf', '.json'], exportFormats: [] })`, mais o IPC próprio do Graph, com remetente conferido:
  - OpenRouter (estado, gravar e apagar a chave, POST e lista de modelos), aceitando só `https://openrouter.ai/`, com a chave mantida no processo principal;
  - exportações;
  - tela cheia (Apresentar);
  - preferências do Graph;
  - migração dos dados antigos.
- **Página:** `src/common/config.ts` (`EdukorsAppConfig`), `src/common/editor.tsx` (componentes montados nos espaços do shell do Common) e CSS só com os tokens do Common. Um adaptador liga as abas do Common ao `src/store/docs.ts` do Graph (ativar e estacionar o curso da aba, `doc.modified`, eventos `edukors:document-modified` e `edukors:document-changed`).
- **Build:** `scripts/build.mjs` com versão por data e `--no-bump`; a CSP de `dist/index.html` libera os esquemas próprios e os workers do Monaco.
- **Fatia vertical, com teste headless e um codec mínimo:** abrir `.egf`, editar, salvar `.egrx`, reabrir e exportar `.egf`.

## Fase 4 — Arquivos

- **Integração com o Common:** `EdukorsAppDocument` (`toBytes`, `fromBytes`, `adopt`, `importFile` para `egf` e `json`, `draftBytes`), **sem** `saveOriginal` e sem `saveExtensions`: o `.egf` nunca é alvo de gravação.
- **Guarda de exportação:** compara caminho resolvido e inode com o documento e com a origem importada, como o `src/main/file-policy.ts` do Slides.
- **Exportar `.egf`:** o curso como está, com o mesmo serializador e o estilo original.
- **Exportar HTML do player** (`buildPlayer`), como na 2.20.
- **Do próprio Common, só testados aqui:** rascunhos e recuperação, conflito com alteração no disco, Recentes, última pasta, abertura pelo sistema e instância única.

## Fase 5 — Interface no shell do Common

| Hoje | No Common |
| --- | --- |
| Toolbar e menu nativo | Toolbar do Common, mais espaços do Graph para: Inserir (10 tipos), vistas Mapa / EGF / Preview / Preview com mapa, enquadrar, organizar, idioma do mapa e problemas |
| Abas, preferências, ajuda, termos, sobre, atualização | Componentes do Common, mais as seções de configuração do Graph (IA do preview e juiz, editor); o guia do professor vira o "Guia completo" |
| Inspetor | Conforme a decisão D1 |
| Painel do agente | Painel de IA do Common |
| Problemas, idiomas do curso, juiz, editor de conteúdo, Apresentar | Componentes do Graph, com a estrutura e o estilo do Common |

A paridade cobre: mapa (selecionar, arrastar, ligar, copiar e colar entre abas, duplicar, excluir, ELK, seções, `position`), inspetor (Dados / Especificação / Extras, condições, juiz), editor de conteúdo em tela cheia, aba EGF em Monaco sincronizada nos dois sentidos, validação e painel de problemas, preview (com e sem mapa, tela cheia, modo reduzido sem chave), exemplos, desfazer por aba e atalhos ⌘/Ctrl. Atalhos que colidem com o menu do Common (⌘M) recebem uma opção no Common ou um atalho novo.

## Fase 6 — IA só pelo Common (`edukors_ai_cli` sai por completo)

- **Configuração:** `EdukorsAiAssistant.configure` com as instruções atuais (`src/agent/system-prompt.md`, `prompt.ts`), `documentId`, o `context.ts` e as ferramentas portadas de `toolSpecs.ts`/`editorTools.ts`: `read_course`, `get_schema`, `validate_course`, `get_editor_state`, `edit_course` (tudo ou nada, um passo de desfazer), `replace_course`, `new_course`, `show_node`, `auto_layout`. Os schemas zod passam a JSON Schema (leitura com `changes: false`, edição com `changes: true`), e as chamadas conferem a revisão do documento, como no Slides.
- **Pasta de trabalho da IA:** conforme a decisão D9.
- **Remoções:**
  - os pacotes `@edukors/ai-cli` e `@edukors/ai-ui`, no `package.json` e no lockfile;
  - `scripts/stage-agent.mjs`, `src-tauri/src/agent.rs`, `src-tauri/agent-bundle/` e a pasta vazia `agent/`;
  - os componentes legados de `src/agent/` (`client`, `store`, `events`, `transcript`, `history`, `mcpConfig`, `Accounts`, `AgentPanel`, `Asks`, `Composer`, `Messages`, `Usage`…) e `src/prefs/AgentSkills.tsx`;
  - os testes `tests/agentPanel.test.ts`, `tests/agentMcp.test.ts` e `tests/e2e/agent.mjs`, reescritos com o provedor falso do Common (`src/ai/runtime/testing`);
  - os trechos de documentação sobre o agente antigo.
- **Prova de que não sobrou nada:** `npm ls` vazio para esses pacotes, busca por `ai-cli|ai-ui|edukors-ai-host` limpa (fora do histórico do CHANGELOG), busca dentro do `app.asar` e um check no CI.

## Fase 7 — Mudanças no Common

- **Feitas e publicadas (`b776e8b`):** correção de nomes com espaço no leitor de pacotes, tipo `video` no `pickFiles`, `minimizeShortcut` e modo Planejar no assistente.
- Mídia própria do `.egrx` (imagens e vídeos): fora desta versão, por decisão do usuário.

## Fase 8 — Migração dos dados do usuário

| Legado | Destino |
| --- | --- |
| `uiLang`, `theme` | Preferências do Common (só como valor inicial, se ainda não houver escolha) |
| `ai.*`, `judge.*`, `editorWrap`, larguras | Preferências do Graph e larguras dos painéis do Common |
| `agent.instructions/mcp/account/accounts/mode` | `ai-settings.json` do Common (`instructions`, `mcp`, `defaultAccountId`, `choices`, `mode`) |
| `agent/plugin/skills` | `<userData>/skills` |
| `agent/history` | Para dentro do `.egrx` quando o `.egf` correspondente for aberto, com uma cópia integral numa parte legada (sem cortar nos limites de 40 conversas e 400 itens do Common) |
| `recent`, `terms` | `recent.json` e `terms.json` do Common (opcional) |
| Chave da OpenRouter | Conforme a decisão D8 |
| `agent/codex`, `agent/antigravity` | Não migram; ficam para rollback |

A migração roda uma vez por versão (registro em `migration.json`), é testada com cópias de pastas legadas dos três sistemas e nunca escreve na pasta antiga.

## Fase 9 — Qualificação

- **Testes de unidade:** os atuais (os de Tauri e `ai-cli` portados), mais:
  - codec `.egrx` e pacotes hostis;
  - `.egf` idêntico byte a byte;
  - guarda de exportação;
  - migração de dados;
  - regra de host da OpenRouter (portada do teste em Rust);
  - "só `.egrx`" em Salvar.
- **Chrome headless na página real** (como `scripts/test-common-headless.mjs` do Slides): edição, abas, área de transferência, aba EGF, preview com OpenRouter simulada, IA com o provedor falso nos modos revisar e aplicar, e idiomas.
- **Electron oculto** (como `scripts/smoke-electron.mjs` do Slides), no `dist` e no app empacotado: abrir por argumento ou `open-file`, salvar `.egrx`, importar `.egf` com o hash do original inalterado, exportar `.egf` e HTML, rascunho e recuperação, conflito externo e migração a partir de uma pasta legada de exemplo.
- **Comparação com a linha de base:** paridade com o PHP, desempenho e segurança (CSP, frames isolados, IPC conferido, chave da OpenRouter fora da página), com CI em macOS, Windows e Linux.

## Fase 10 — DMG local para homologação do usuário

- **Isolamento:** bundle ID e pasta de dados separados, sem atualizador e sem tomar a associação do `.egf`.
- **Build:** universal, assinado com Developer ID, gerado em staging fora do Dropbox (os atributos estendidos do Dropbox quebram o `codesign`).
- **Smoke** no `.app` empacotado.
- **Entrega:** DMG, SHA-256, roteiro de teste e limitações conhecidas.
- **Nenhuma publicação antes do aceite do usuário.**

## Fase 11 — Distribuição

- **Identidades preservadas:** `org.edukors.grapheditor`, "Edukors Graph Editor", MSIX `mgarlabx.EdukorsGraphEditor` e `CN=25CB0A95-E013-4D6C-9667-81DF1CC50F46`, Store `9N0N0P3GVRCK` com os mesmos três idiomas (pt-BR, en-US, es-ES, salvo novas listagens), Developer ID `GRVGLXMK3S`, nomes públicos dos instaladores e nome do pacote `.deb` atual.
- **Versão por data:** 26.MM.DD, maior que 2.20.0 em todos os canais (MSIX 26.MM.DD.0).
- **Associações:** `.egrx` como dono (`application/vnd.edukors.graph+zip`), e `.egf` aberto como importação.
- **Workflows:** baseados nos do Slides (build, nomes públicos, SHA256SUMS, atestado), com o `store.yml` mantido. O SHA do Common é resolvido uma vez por candidato e usado em todos os jobs.
- **Store:** `STORE_AUTO_SUBMIT` desligado até a homologação (ação do usuário no GitHub).
- **Transição de quem tem a 2.20:** conforme o S4 e a decisão D5.
- **Documentação a atualizar:** README, CHANGELOG (em inglês), guias do professor, `docs/development.md`, `docs/distribution.md`, privacidade e capturas da loja.

## Fase 12 — Publicação e rollback

- Publicar só o candidato homologado, sem recompilar, e acompanhar por 7 a 14 dias.
- **Rollback do app e do código:** `main`, a tag `v2.20.0` e os bundles. A 2.20.0 continua disponível para download. A Store não aceita voltar de versão; lá só se corrige com uma versão maior.
- **Dados:** as pastas antigas ficam intactas.
- **Documentos:** a 2.20 não lê `.egrx`. O caminho de volta é exportar `.egf`, e as notas da versão devem dizer isso.

## Decisões técnicas adotadas, salvo objeção

- O envelope de `graph/course.json` da Fase 2.
- A exportação como comando próprio do Graph no processo principal, porque gera vários arquivos (como o Exportar do Slides).
- O build da página com esbuild, como no Slides (Vite só se o S1 exigir).
- As identidades atuais preservadas.

## Decisões pendentes do usuário (com recomendação)

- **D1. Inspetor:** na barra lateral esquerda do Common (recomendado, porque ela já vem redimensionável e lembrada), ou à direita como hoje, dentro da área de trabalho.
- **D2. Mídia no `.egf`:** sem efeito nesta versão (mídia própria adiada pelo usuário).
- **D3. Vídeo e imagens próprias:** decidido pelo usuário em 04/11/2026: fora desta versão, a resolver depois.
- **D4. HTML exportado:** como na 2.20 (sem mudança, sem mídia própria).
- **D5. Quem tem a 2.20:** um `latest.json` compatível, se o S4 passar (recomendado); senão, uma última versão Tauri que só avisa e aponta para o download.
- **D6. Modo Planejar e chip de seleção:** implementar no Common (recomendado), ou retirar.
- **D7. Imagens `data:` já embutidas em `.egf`:** ficam como estão (texto do curso).
- **D8. Chave da OpenRouter:** guardar com `safeStorage` e pedir a chave uma vez (recomendado), ou usar um módulo nativo de keyring para aproveitar a entrada atual.
- **D9. Pasta da IA:** privada por documento, como no Slides (recomendado), ou a pasta do arquivo, padrão do Common.
- **D10. Atualizações:** só aviso com link, como no Common e no Slides (recomendado), ou manter a instalação automática.
- **D11. Idiomas:** pt, en e es agora, com zh e hi caindo para o inglês (recomendado), ou os cinco já, como no Slides.
- **D12. Instalador `.exe` fora da loja:** manter, já que README e site o usam (recomendado), ou ficar só com o MSIX.

## Referências

- **Slides** (`../edukors_slides_editor`): `PLANO_MIGRACAO_COMMON_UX.md`, `MIGRATION_STATUS.md`, `RETOMADA_MIGRACAO.md`, `CLAUDE.md` (seção "Migração para Edukors Common"); código em `src/main/index.ts`, `src/common/{editor.tsx,config.ts,store.ts,assistant-tools.ts}`, `src/shared/eslx.ts`, `src/main/file-policy.ts`, `scripts/{build.mjs,test-common-headless.mjs,smoke-electron.mjs,public-installers.mjs}`, `.github/workflows/{release,store}.yml`.
- **Text Editor** (`../edukors_text_editor`): `desktop/main.mjs`, `app-config.js`, `document.js`, `assistant.js`, `electron-builder.yml`.
- **Common** (`../edukors_common_ux`): `README.md`, `docs/{common-shell,document-package,common-document-format,ai}.md`, `desktop/{host,files-core}.mjs`, `src/package/package.js`, `src/ai/host/app-methods.js`.
- **Graph, pontos de troca:** `src-tauri/src/{lib.rs,agent.rs,macos.rs}`, `src/app/{platform,files,export,updates,menu}.ts`, `src/store/{docs,prefs}.ts`, `src/agent/`, `src/preview/`, `src/course/serialize.ts`, `scripts/{stage-agent,make-msix,bump-version,check-compat,release-notes}.mjs`, `.github/workflows/{ci,release,store}.yml`.
- **Ecossistema `.egf`:** `../edukors_graph/schema/schema.README.md` ("The .egf file"), `../edukors_graph/player`, `../edukors_graph/plugin`, `../_code/public_html/graph`.
