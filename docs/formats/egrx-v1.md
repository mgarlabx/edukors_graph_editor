# `.egrx` — Edukors Graph course file, version 1

The file the Graph Editor saves, from version 26.11.5 on. It is an **Edukors package** (a ZIP with Open Packaging
Conventions parts), written and read by Edukors Common: the container, its rules and its limits are described in
Common's [document-package.md](https://github.com/mgarlabx/edukors_common_ux/blob/main/docs/document-package.md).
The code is `src/course/egrx.ts`; its tests are `tests/egrx.test.ts`.

The course inside is an [Edukors Graph](https://github.com/mgarlabx/edukors_graph) course **exactly** as the `.egf`
schema describes it. The schema does not change: an exported `.egf` is that course as it is, byte for byte when it
was not edited.

## Parts

```
[Content_Types].xml
_rels/.rels                              → graph/course.json (main part), docProps
docProps/core.xml                        title (the course's title in its source language), language
docProps/app.xml                         app "graph" and the editor's version
graph/course.json                        the course (below)
graph/_rels/course.json.rels             → the AI conversations, the legacy conversations
graph/ai/conversations/<id>.json         the course's AI conversations (Common's assistant)
graph/ai/legacy-conversations.json       conversations kept by versions 2.19–2.20, when there were any
```

The main part's content type is `application/vnd.edukors.graph.course+json`; the package's MIME type, for file
associations, is `application/vnd.edukors.graph+zip`.

## `graph/course.json`

```json
{
  "format": "edukors.graph.course",
  "version": 1,
  "style": { "indent": "  ", "trailingNewline": true, "ascii": false },
  "course": { "info": { … }, "nodes": [ … ] }
}
```

- `format` must be `edukors.graph.course`.
- `version` is an integer; a file with a version above the editor's (1) is refused ("saved by a newer version").
- `style` is the JSON style of the `.egf` the course came from (indent of 1–8 spaces or a tab, final newline, ASCII
  escapes), so exporting writes the same bytes. Missing or invalid values fall back to the defaults.
- `course` is the course; each node's `position` (the map layout) is part of it, as in the `.egf`, and players
  ignore it.

## Reading

A file is untrusted input. It is refused, with a message for the person, when it is not a valid package, when its
main part belongs to another Edukors app, when `format` is not the Graph's, when `version` is newer, or when
`course` has no `nodes`. AI conversations that cannot be read are dropped; the course still opens.

## Not in version 1

Media files of their own (pictures, videos stored in the package). Pictures and videos are referenced by URL, as in
the `.egf`.

## Other formats

- `.egf` and the older `.json`: opened as an **import** (an unsaved course; Save creates its `.egrx` and never writes
  the original). Invalid JSON is reported with its line and column.
- **Export** writes the `.egf` for the player (and the platform's gallery) or a stand-alone HTML player, next to the
  `.egrx`, with its name.
