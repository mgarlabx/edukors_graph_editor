# O arquivo `.layout.json`

Cada curso aberto no editor tem dois arquivos lado a lado:

| Arquivo | Conteúdo |
| --- | --- |
| `meu-curso.json` | O curso, válido contra `https://edukors.org/graph/schema/v1/`. O editor nunca acrescenta nada a ele. |
| `meu-curso.layout.json` | Tudo o que o editor sabe do curso e que não é o curso. |

O nome do layout é o do curso trocando `.json` por `.layout.json` (`world-cats-3-full-course.json` → `world-cats-3-full-course.layout.json`). Ele é salvo junto com o curso e, depois, sozinho, um segundo depois de cada mudança de posição ou de zoom. Se faltar ou estiver corrompido, o curso abre normalmente e o ELK organiza o grafo de novo.

## Formato (versão 1)

```json
{
  "format": "edukors-editor-layout",
  "version": 1,
  "positions": { "sm1": { "x": 0, "y": 0 }, "q1": { "x": 310, "y": 40 } },
  "viewport": { "x": 120, "y": 80, "zoom": 0.85 },
  "pairs": {
    "s1|f2": { "form": "9f8e7d6c", "state": "0a1b2c3d" }
  }
}
```

| Campo | Para quê |
| --- | --- |
| `positions` | Posição de cada nó no canvas, por id. Um nó sem posição é colocado pelo ELK. |
| `viewport` | Onde a vista estava (pan e zoom). |
| `pairs` | Tarefas de escrita: impressões digitais das instruções do `form` e do `state` do julgamento na última vez em que o autor os marcou como alinhados. |
