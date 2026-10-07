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

O instalador do Windows (NSIS, `Edukors Graph Editor_<versão>_x64-setup.exe`) só pode ser gerado num Windows. Ele é feito no GitHub Actions: **Actions → Windows installer → Run workflow** (`.github/workflows/release-windows.yml`); quando a execução termina, o `.exe` fica nos *artifacts* dela. Numa máquina Windows com Rust (MSVC) e Node 22, o mesmo sai de `npm ci && npm run app:build:win`, em `src-tauri/target/release/bundle/nsis/`.

- `src-tauri/tauri.windows.conf.json`, que o Tauri lê só no Windows, troca `app`/`dmg` pelo NSIS, instala para o usuário (sem pedir administrador) e associa só `.egf` ao editor: no Windows não há o “Alternate” do Mac, e associar `.json` tomaria todos os `.json` do usuário.
- O agente vai junto, como no Mac, com o `claude.exe` do pacote `@anthropic-ai/claude-agent-sdk-win32-x64` (≈ 250 MB): o instalador fica grande. O Node continua sendo do usuário; `agent.rs` o procura no PATH e onde o instalador oficial, nvm-windows, fnm, Volta e Scoop o põem.
- A chave da OpenRouter fica no Gerenciador de Credenciais do Windows.
- Um `.egf` aberto no Explorer com o editor já aberto vai para a janela que está aberta (`tauri-plugin-single-instance`).
- Só x64. O instalador não é assinado: o SmartScreen avisa “O Windows protegeu o computador”, e a pessoa segue em **Mais informações → Executar assim mesmo**. Para tirar o aviso é preciso um certificado de assinatura de código (OV/EV ou Azure Trusted Signing), configurado em `bundle.windows.signCommand`.
