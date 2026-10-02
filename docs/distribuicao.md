# Distribuição: assinatura, notarização e `.dmg`

`npm run app:build` gera, em `src-tauri/target/release/bundle/`:

- `macos/Edukors Graph Editor.app` — o aplicativo (≈ 10 MB);
- `dmg/Edukors Graph Editor_<versão>_aarch64.dmg` — a imagem de instalação.

Sem assinatura, o macOS abre o app só depois de o usuário autorizá-lo em **Ajustes → Privacidade e Segurança** (ou com clique direito → Abrir). Para distribuir a professores, o app precisa ser assinado com um certificado **Developer ID Application** e notarizado pela Apple.

## O que já está configurado

- `src-tauri/tauri.conf.json` → `bundle.macOS.hardenedRuntime: true` (exigido pela notarização) e `minimumSystemVersion: "11.0"`.
- Associação de arquivo `.json` (`bundle.fileAssociations`), com papel *Editor* e prioridade *Alternate*, para o app aparecer em **Abrir com** sem tomar o lugar do editor padrão de JSON.
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
   xcrun stapler validate "src-tauri/target/release/bundle/dmg/Edukors Graph Editor_0.1.0_aarch64.dmg"
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
