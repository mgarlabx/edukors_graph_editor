# Distribuição: assinatura, notarização e `.dmg`

`npm run app:build` gera, em `src-tauri/target/release/bundle/`:

- `macos/Edukors Graph Editor.app` — o aplicativo (≈ 10 MB);
- `dmg/Edukors Graph Editor_<versão>_aarch64.dmg` — a imagem de instalação.

Sem assinatura, o macOS abre o app só depois de o usuário autorizá-lo em **Ajustes → Privacidade e Segurança** (ou com clique direito → Abrir). Para distribuir a professores, o app precisa ser assinado com um certificado **Developer ID Application** e notarizado pela Apple.

## O que já está configurado

- `src-tauri/tauri.conf.json` → `bundle.macOS.hardenedRuntime: true` (exigido pela notarização) e `minimumSystemVersion: "11.0"`.
- Associação de arquivo `.egf` (Edukors Graph Format, `bundle.fileAssociations`), com papel *Editor* e prioridade *Owner*, e o tipo exportado `org.edukors.grapheditor.egf` (conforme a `public.json`): o duplo clique num `.egf` abre o editor.
- Associação de `.json` com prioridade *Alternate*, para os cursos antigos aparecerem em **Abrir com** sem tomar o lugar do editor padrão de JSON.
- Identificador `org.edukors.grapheditor`.

## O que falta (precisa da conta Apple Developer)

1. Instalar o certificado *Developer ID Application* no Keychain. Conferir com:

   ```sh
   security find-identity -v -p codesigning
   ```

2. Exportar as variáveis antes do build (o Tauri assina e notariza sozinho quando elas existem):

   ```sh
   export APPLE_SIGNING_IDENTITY="Developer ID Application: Edukors (TEAMID)"
   export APPLE_ID="conta@exemplo.org"
   export APPLE_PASSWORD="senha-de-app"        # senha específica de app, não a da conta
   export APPLE_TEAM_ID="TEAMID"
   npm run app:build
   ```

   Alternativa sem senha: `APPLE_API_KEY`, `APPLE_API_ISSUER` e `APPLE_API_KEY_PATH` (chave da App Store Connect).

3. Conferir o resultado:

   ```sh
   codesign --verify --deep --strict --verbose=2 "src-tauri/target/release/bundle/macos/Edukors Graph Editor.app"
   spctl --assess --type execute --verbose "src-tauri/target/release/bundle/macos/Edukors Graph Editor.app"
   xcrun stapler validate "src-tauri/target/release/bundle/dmg/Edukors Graph Editor_1.13.0_aarch64.dmg"
   ```

## Intel e Apple Silicon

O build padrão é para a arquitetura da máquina (`aarch64` num Mac com Apple Silicon). Para um binário universal:

```sh
rustup target add x86_64-apple-darwin aarch64-apple-darwin
npx tauri build --target universal-apple-darwin
```

## Entitlements

O app não precisa de entitlements especiais: lê e grava apenas os arquivos que o usuário escolhe nos diálogos, usa o Keychain do próprio usuário e faz requisições HTTPS só para `openrouter.ai`. O agente de IA é outro processo (Node, com o Claude Code do Agent SDK), que fala com `api.anthropic.com`. Se um dia for distribuído pela Mac App Store (sandbox), será preciso acrescentar `com.apple.security.files.user-selected.read-write` e `com.apple.security.network.client`.

## O agente de IA

O agente roda fora do `.app`: `src-tauri/src/agent.rs` inicia o Node com `agent/sidecar.mjs`, procurando o script primeiro em `Contents/Resources/agent/` e, se não houver, na pasta do projeto, cujo caminho fica gravado na compilação. Por isso o `.app` gerado neste Mac funciona aqui, e num outro Mac o painel diz que não encontrou os arquivos do agente. Para levá-lo junto seria preciso:

1. Incluir `agent/` e o `node_modules` que ele usa (`@anthropic-ai/claude-agent-sdk`, o pacote do binário `@anthropic-ai/claude-agent-sdk-darwin-arm64`, ≈ 230 MB, e `zod`) em `bundle.resources`, com o binário do Claude Code assinado junto com o app para a notarização; ou compilar o processo num executável único (o SDK documenta `bun build --compile` com `extractFromBunfs`).
2. Exigir o Node no Mac do professor, ou levá-lo junto.
3. **Trocar a autenticação.** Hoje o agente usa o login do Claude Code do próprio Mac (a conta do Claude). A documentação do Agent SDK diz: *"Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Please use the API key authentication methods described in this document instead."* Para entregar o app a outras pessoas, o caminho é uma chave de API da Anthropic (guardada no Keychain, como a da OpenRouter, e passada ao processo do agente como `ANTHROPIC_API_KEY`), ou uma aprovação da Anthropic.

## Windows

O instalador do Windows (NSIS, `Edukors Graph Editor_<versão>_x64-setup.exe`) só pode ser gerado num Windows. Ele é feito no GitHub Actions, junto com o app do Mac, pelo fluxo de release (ver [Releases e atualização automática](#releases-e-atualização-automática)). Numa máquina Windows com Rust (MSVC) e Node 22, o mesmo sai de `npm ci && npm run app:build:win`, em `src-tauri/target/release/bundle/nsis/`.

- `src-tauri/tauri.windows.conf.json`, que o Tauri lê só no Windows, troca `app`/`dmg` pelo NSIS, instala para o usuário (sem pedir administrador) e associa só `.egf` ao editor: no Windows não há o “Alternate” do Mac, e associar `.json` tomaria todos os `.json` do usuário.
- O agente vai junto, como no Mac, com o `claude.exe` do pacote `@anthropic-ai/claude-agent-sdk-win32-x64` (≈ 250 MB): o instalador fica grande. O Node continua sendo do usuário; `agent.rs` o procura no PATH e onde o instalador oficial, nvm-windows, fnm, Volta e Scoop o põem.
- A chave da OpenRouter fica no Gerenciador de Credenciais do Windows.
- Um `.egf` aberto no Explorer com o editor já aberto vai para a janela que está aberta (`tauri-plugin-single-instance`).
- Só x64. O instalador não é assinado: o SmartScreen avisa “O Windows protegeu o computador”, e a pessoa segue em **Mais informações → Executar assim mesmo**. Para tirar o aviso é preciso um certificado de assinatura de código (OV/EV ou Azure Trusted Signing), configurado em `bundle.windows.signCommand`.

## Releases e atualização automática

O app procura versões novas nos releases do GitHub (`tauri-plugin-updater`, configurado em `plugins.updater` do `src-tauri/tauri.conf.json`). Ao abrir, ele verifica em silêncio, no máximo uma vez por dia, e só se a caixa **Verificar atualizações automaticamente** estiver ligada nas Preferências. O item **Verificar atualizações…** fica no menu do app (Mac) ou no menu Ajuda (Windows) e sempre responde. Antes de baixar, o app pergunta sobre os cursos não salvos e encerra o agente. No Mac, o app novo substitui o antigo e o editor reinicia. No Windows, o app fecha, o instalador roda sem perguntas (modo `passive`, por usuário, sem pedir administrador) e abre o editor de novo. Código: `src/app/updates.ts` e `src/app/UpdateModal.tsx`.

Cada atualização é verificada com uma chave própria do updater, independente dos certificados da Apple e do Windows. **Se a chave privada for perdida, os apps instalados não conseguem mais se atualizar** e todos teriam de reinstalar à mão.

### Preparar a chave (uma vez)

```sh
npx tauri signer generate -w ~/.tauri/edukors-updater.key
```

1. Defina uma senha e guarde a chave e a senha num gerenciador de senhas.
2. Copie o conteúdo de `~/.tauri/edukors-updater.key.pub` para `plugins.updater.pubkey` no `src-tauri/tauri.conf.json`. Enquanto o campo diz `PENDENTE`, o fluxo de release falha logo no início.
3. Em **Settings → Secrets and variables → Actions** do repositório, crie `TAURI_SIGNING_PRIVATE_KEY` (o conteúdo de `~/.tauri/edukors-updater.key`) e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

### Lançar uma versão

1. Escreva a seção da versão no `CHANGELOG.md` (`## 2.12.0`), **sempre em inglês**. Esse texto vai para a página do release e para o aviso dentro do app, igual para todos os idiomas da interface.
2. `node scripts/bump-version.mjs 2.12.0`: atualiza a versão no `package.json`, no `package-lock.json`, no `tauri.conf.json`, no `Cargo.toml` e no `Cargo.lock`. Faça o commit e o push.
3. `git tag v2.12.0 && git push origin v2.12.0`.
4. O fluxo `.github/workflows/release.yml` confere a tag e as versões, cria um rascunho de release e gera, em paralelo, o app universal do Mac (`.dmg` e `.app.tar.gz`) e o instalador do Windows, cada um com sua assinatura `.sig`. Cada instalador também sobe uma segunda vez, com nome fixo, para os links de download (abaixo). Por fim, monta o `latest.json` com as três plataformas (`darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`). Leva de 15 a 25 minutos.
5. Revise o rascunho e clique em **Publish**. Só então o `latest.json` passa a valer em `releases/latest/download/`, e os apps instalados enxergam a versão nova.

**Não edite as notas no rascunho**: o `latest.json` já foi gerado com o texto do `CHANGELOG.md`, e a mudança não chega ao app. Para corrigir, apague o rascunho e a tag, corrija o `CHANGELOG.md` e repita.

Para gerar o app localmente sem a chave, nada muda: `npm run app:build` não cria os arquivos do updater. Eles só são criados quando o build recebe também `--config src-tauri/tauri.release.conf.json`, que exige `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` no ambiente.

### Links de download

Para um site ou e-mail, estes links baixam sempre o instalador da versão publicada mais recente:

- Mac (Apple Silicon e Intel): `https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-mac.dmg`
- Windows (x64): `https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-windows.exe`

São cópias, com nome sem versão, do `.dmg` e do `.exe` de cada release. A v2.12.0 saiu antes delas e não as tem: os links valem a partir da versão seguinte. A página com todos os arquivos é `https://github.com/mgarlabx/edukors_graph_editor/releases/latest`.

### Testar

`releases/latest/download/` ignora rascunhos e pre-releases: um pre-release no repositório principal não é encontrado pelo app. Para testar de ponta a ponta, use um fork, com `plugins.updater.endpoints` apontando para os releases dele, e o fluxo disparado à mão (**Actions → Release → Run workflow**). Publique uma versão N, instale-a, publique a N+1 e confira:

- o aviso aparece sozinho ao abrir, e **Verificar atualizações…** também o mostra;
- com um curso não salvo, o app pergunta antes de baixar, e **Cancelar** interrompe a atualização;
- no Windows, com o painel do agente aberto, a instalação termina e o app reabre;
- depois de atualizar, **Sobre** mostra a versão N+1;
- sem internet, a verificação automática não diz nada, e a manual explica o erro;
- com um `.sig` alterado no release de teste, o app recusa a atualização.

### Sem assinatura de código

As atualizações funcionam sem os certificados. Mas, sem assinatura, cada build do Mac tem uma assinatura *ad hoc* diferente, e o macOS pode pedir a senha do usuário na primeira vez que a versão nova lê a chave da OpenRouter no Keychain. **Permitir sempre** resolve até a próxima versão. A primeira instalação, a partir do `.dmg` baixado no navegador, continua exigindo a liberação em **Ajustes → Privacidade e Segurança**. As versões seguintes, baixadas pelo próprio app, não passam por isso.
