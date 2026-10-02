# Edukors Graph Editor

O Edukors Graph Editor é um *builder* visual, que roda no seu computador, para criar e editar cursos adaptativos no padrão [Edukors Graph](https://github.com/mgarlabx/edukors_graph).

> No momento, só há versão Mac disponível. Mas esse código poderá ser baixado e alterado para gerar versões Windows e Linux livremente.

## Parte do projeto Edukors Graph

O [Edukors Graph](https://github.com/mgarlabx/edukors_graph) é um padrão aberto para cursos adaptativos, ligado ao projeto [Edukors.org](https://edukors.org). A ideia é antiga na educação: dar a cada estudante o que ele precisa, levando em conta o que ele já sabe. Para isso, o curso é descrito como um grafo. Os **nós** são o que o estudante vê: um texto, um vídeo, um quiz, uma tarefa de escrita avaliada por IA. As **arestas** dizem para onde ele vai em seguida, conforme o que fez até ali. Quem acerta o quiz segue adiante; quem erra recebe uma explicação diferente antes de tentar de novo.

O curso inteiro cabe num único arquivo JSON, e o projeto é formado por algumas peças em volta desse arquivo:

- o **schema**, que define o formato do curso;
- o **builder**, que gera cursos a partir de uma descrição curta, com a ajuda de um assistente de IA;
- o **player**, um servidor que entrega os cursos aos estudantes, inclusive dentro de um ambiente virtual de aprendizagem (via LTI 1.3);

Este editor é outro *builder*, pensado para rodar em ambiente local. No builder do repositório, você conversa com uma IA e recebe o curso pronto. Aqui, você vê o curso como um mapa e o monta ou ajusta com as próprias mãos, com uma IA ao lado se quiser. O resultado é o mesmo arquivo JSON, que o player abre sem nenhuma conversão.

## Para que serve

O editor foi feito para professores e autores de cursos. Com ele você pode:

- desenhar o percurso do curso, decidindo o que o estudante vê e para onde vai depois de cada atividade;
- escrever o conteúdo de cada etapa, nos idiomas do curso;
- conferir se o curso está correto antes de publicá-lo;
- fazer o curso como se fosse um estudante, para ver o que ele verá;
- pedir a um agente de IA que crie ou altere partes do curso por você.

## Como funciona

**O mapa.** O curso aparece na tela como um grafo, no estilo de ferramentas como o n8n: cada atividade é uma caixa, e as setas mostram os caminhos possíveis. Dá para arrastar, ligar, copiar e organizar as caixas automaticamente.

**O inspetor.** Ao clicar numa caixa, o painel lateral mostra o conteúdo dela num formulário próprio para o tipo de atividade. As regras de cada caminho ("se acertou pelo menos 70% do quiz") são montadas em menus, sem precisar escrever código.

**A validação.** O editor verifica o curso enquanto você trabalha, com as mesmas regras do repositório, e aponta cada problema no lugar em que ele está.

**O JSON.** Quem prefere pode editar o arquivo diretamente, numa aba própria, que fica sincronizada com o mapa.

**O preview.** Você faz o curso como um estudante, usando o próprio player do projeto. As atividades com IA (textos gerados e avaliações) funcionam de verdade quando você informa uma chave da [OpenRouter](https://openrouter.ai), que fica guardada no Keychain do Mac. Sem a chave, o preview funciona em modo reduzido, e você mesmo escolhe o resultado das avaliações.

**As abas.** Vários cursos podem ficar abertos ao mesmo tempo, e dá para copiar atividades de um para outro.

**O agente de IA.** Um painel à direita traz um agente, feito com o Claude, que lê o curso aberto e o altera a pedido. Por padrão, cada alteração espera a sua aprovação, e tudo pode ser desfeito.

Cada curso é salvo em dois arquivos: `curso.json`, com o curso, e `curso.layout.json`, com a posição das caixas no mapa. O primeiro é o que vai para o player.

O [guia do professor](docs/guia-do-professor.md) explica o uso passo a passo.

## Instalação

O editor funciona em macOS 11 ou mais recente. Por enquanto ele é instalado a partir do código-fonte, o que pede algumas ferramentas, todas gratuitas. Os comandos abaixo são digitados no Terminal.

**1. Instale as ferramentas.**

- Ferramentas de linha de comando da Apple: `xcode-select --install`
- [Rust](https://rustup.rs): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- [Node.js](https://nodejs.org), versão 22 ou mais recente

**2. Baixe o projeto e instale as dependências.**

```sh
git clone https://github.com/<conta>/edukors-graph-editor.git
cd edukors-graph-editor
npm install
```

**3. Abra o editor.**

```sh
npm run app:dev
```

A primeira vez demora alguns minutos, porque o app é compilado. Nas próximas é rápido.

Se preferir um aplicativo para deixar na pasta Aplicativos, gere-o com `npm run app:build`. O `.app` e o `.dmg` ficam em `src-tauri/target/release/bundle/`. Como o app ainda não é assinado pela Apple, abra-o da primeira vez com o botão direito → **Abrir**.

**4. Opcional: IA no preview.** Crie uma chave na [OpenRouter](https://openrouter.ai) e cole-a em **Preferências** (⌘,).

**5. Opcional: o agente de IA.** O agente usa o [Claude Code](https://code.claude.com) instalado e logado neste Mac. Instale-o, rode `claude` no Terminal e entre na sua conta com `/login`.

> O agente usa o login pessoal do Claude Code, o que serve para quem usa o editor no próprio Mac. Para distribuir o app a outras pessoas, a Anthropic pede autenticação por chave de API; ver [docs/distribuicao.md](docs/distribuicao.md).

## Estado do projeto

O editor é experimental, como o próprio padrão Edukors Graph, e o formato dos cursos ainda pode mudar. Por ora, ele roda apenas em macOS.

## Para desenvolvedores

A arquitetura do agente, os testes, a estrutura do código e as limitações conhecidas estão em [docs/desenvolvimento.md](docs/desenvolvimento.md). Os testes rodam com `npm test`, e `npm run update-assets` atualiza o schema, o player e os exemplos a partir do repositório [edukors_graph](https://github.com/mgarlabx/edukors_graph).

## Licença

[MIT](LICENSE.md). Copyright (c) 2026 Edukors.org - Maurício Garcia.
