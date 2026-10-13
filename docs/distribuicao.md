# Distribuição: assinatura, notarização e instaladores

`npm run app:build` gera o app universal (Apple Silicon e Intel) em `src-tauri/target/universal-apple-darwin/release/bundle/`:

- `macos/Edukors Graph Editor.app` — o aplicativo;
- `dmg/Edukors Graph Editor_<versão>_universal.dmg` — a imagem de instalação.

O app do Mac sai assinado com o certificado **Developer ID Application** e notarizado pela Apple: baixado pelo navegador, abre só com a pergunta padrão “é um app baixado da Internet”, sem passar por **Ajustes → Privacidade e Segurança**.

## O que está configurado

- `src-tauri/tauri.conf.json` → `bundle.macOS.hardenedRuntime: true` (exigido pela notarização) e `minimumSystemVersion: "11.0"`. `signingIdentity` fica `null` no arquivo: a identidade vem da variável `APPLE_SIGNING_IDENTITY`, e quem não tem o certificado continua gerando o app, sem assinatura.
- Associação de arquivo `.egf` (Edukors Graph Format, `bundle.fileAssociations`), com papel *Editor* e prioridade *Owner*, e o tipo exportado `org.edukors.grapheditor.egf` (conforme a `public.json`): o duplo clique num `.egf` abre o editor.
- Associação de `.json` com prioridade *Alternate*, para os cursos antigos aparecerem em **Abrir com** sem tomar o lugar do editor padrão de JSON.
- Identificador `org.edukors.grapheditor`.

## Assinatura e notarização do Mac

A conta Apple Developer é de pessoa física: o desenvolvedor que o macOS mostra é **Mauricio Garcia**, Team ID `GRVGLXMK3S`.

| Item | Onde está |
|---|---|
| Certificado *Developer ID Application: Mauricio Garcia (GRVGLXMK3S)*, válido até 12/11/2027 | Keychain de quem o criou e, como `.p12`, no gerenciador de senhas |
| Chave de API da App Store Connect (Team Key, papel Developer), Key ID `A9CQQ9PA49` | O `.p8` no gerenciador de senhas; a Apple só deixa baixá-lo uma vez |
| Issuer ID da App Store Connect | **Users and Access → Integrations → Team Keys** |

O Tauri assina o `.app` e notariza-o com a chave de API quando estas variáveis existem. O `.app.tar.gz` do updater é feito do `.app` já notarizado. O `.dmg`, porém, o Tauri só assina: a notarização dele é um passo à parte (`notarytool` e `stapler`, abaixo).

Os binários `claude` do agente (`Contents/Resources/agent/…/claude-agent-sdk-darwin-{arm64,x64}/claude`) vão com a assinatura original da Anthropic (Developer ID, hardened runtime, timestamp), que a notarização aceita como está: não são assinados de novo.

### No GitHub Actions

O job do Mac em `.github/workflows/release.yml` lê estes secrets do repositório (**Settings → Secrets and variables → Actions**):

| Secret | Conteúdo |
|---|---|
| `APPLE_CERTIFICATE` | o `.p12` em base64 (`base64 -i certificado.p12`) |
| `APPLE_CERTIFICATE_PASSWORD` | a senha do `.p12` |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Mauricio Garcia (GRVGLXMK3S)` |
| `APPLE_API_ISSUER` | o Issuer ID |
| `APPLE_API_KEY` | o Key ID |
| `APPLE_API_KEY_P8` | o conteúdo do `.p8` |

Com eles, o fluxo grava o `.p8` num arquivo temporário, o Tauri assina e notariza o app, um passo seguinte notariza e grampeia o `.dmg` e troca no rascunho a cópia que o `tauri-action` subiu, e a checagem final passa o app e o `.dmg` pelo Gatekeeper. Sem `APPLE_CERTIFICATE` (num fork, por exemplo), o build segue sem assinatura, com um aviso.

### Num Mac, à mão

Com o certificado no Keychain:

```sh
security find-identity -v -p codesigning     # deve listar 1 identidade válida

export APPLE_SIGNING_IDENTITY="Developer ID Application: Mauricio Garcia (GRVGLXMK3S)"
export APPLE_API_ISSUER="<Issuer ID>"
export APPLE_API_KEY="A9CQQ9PA49"
export APPLE_API_KEY_PATH="$HOME/caminho/AuthKey_A9CQQ9PA49.p8"
npm run app:build
```

Na primeira assinatura, o macOS pede a senha de login para o `codesign` usar a chave: **Permitir sempre**. Se a identidade aparece em `find-identity` mas não como válida (`0 valid identities found`), falta o certificado intermediário da Apple: instale o `DeveloperIDG2CA.cer` de `https://www.apple.com/certificateauthority/` (duplo clique).

Depois, notarizar o `.dmg` e conferir:

```sh
B=src-tauri/target/universal-apple-darwin/release/bundle
DMG="$B/dmg/Edukors Graph Editor_<versão>_universal.dmg"
xcrun notarytool submit "$DMG" --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" --wait
xcrun stapler staple "$DMG"

codesign --verify --deep --strict --verbose=2 "$B/macos/Edukors Graph Editor.app"
spctl --assess --type execute --verbose "$B/macos/Edukors Graph Editor.app"            # Notarized Developer ID
spctl --assess --type open --context context:primary-signature --verbose "$DMG"       # Notarized Developer ID
syspolicy_check distribution "$B/macos/Edukors Graph Editor.app"
```

Se a notarização for recusada, o motivo está em `xcrun notarytool log <id> --key … --key-id … --issuer …`.

### Renovar o certificado (antes de 12/11/2027)

Os apps já assinados continuam abrindo depois do vencimento (a assinatura tem carimbo de tempo); só os builds novos precisam do certificado novo.

1. No Keychain Access, **Certificate Assistant → Request a Certificate From a Certificate Authority…**, salvo em disco.
2. Em developer.apple.com → **Certificates** → **+** → **Developer ID Application** (G2 Sub-CA), com esse pedido. Só o titular da conta pode criar.
3. Instalar o `.cer`, exportar de novo como `.p12` e atualizar `APPLE_CERTIFICATE` e `APPLE_CERTIFICATE_PASSWORD`. A identidade (nome e Team ID) não muda.

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
- Só x64. O instalador não é assinado: o SmartScreen avisa “O Windows protegeu o computador”, e a pessoa segue em **Mais informações → Executar assim mesmo**. Para tirar o aviso é preciso um certificado de assinatura de código (OV, com a chave num serviço de assinatura em nuvem), configurado em `bundle.windows.signCommand`. O Azure Artifact Signing (antigo Trusted Signing) não emite certificados para organizações brasileiras.

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

### Atualizações e assinatura

As atualizações funcionam com ou sem os certificados. As versões do Mac até a 2.13.0 saíram sem assinatura (*ad hoc*, diferente a cada build), e o macOS pedia a senha do usuário na primeira vez que a versão nova lia a chave da OpenRouter no Keychain. Com o Developer ID, a identidade é a mesma em todas as versões: o pedido aparece uma última vez na passagem da versão sem assinatura para a primeira assinada, e não volta. No Windows, que ainda não é assinado, a primeira instalação continua com o aviso do SmartScreen; as versões seguintes, baixadas pelo próprio app, não passam por ele.
