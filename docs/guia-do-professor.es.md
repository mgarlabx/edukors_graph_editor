# Guía del docente — Edukors Graph Editor

Esta guía muestra cómo crear un curso en Edukors Graph Editor, desde el primer paso hasta el archivo listo para publicar. No necesita escribir JSON: todo se hace en el grafo y en el panel de la derecha.

## 1. La idea en una frase

Un curso es un **grafo**. Cada **nodo** es un paso que el estudiante ve o hace (un texto, un cuestionario, un formulario) o una evaluación que la IA hace por detrás. Cada **flecha** (arista) indica qué paso viene después, y puede tener una **condición**: "si acertó el 70 % o más, vaya aquí; si no, allá".

## 2. Instalar y abrir

1. Abra el archivo `Edukors Graph Editor.dmg` y arrastre la app a la carpeta **Aplicaciones**.
2. La primera vez, si macOS avisa que no pudo verificar la app, haga clic derecho en la app y elija **Abrir**. Enseguida el editor muestra los **Términos de uso** (la licencia MIT, explicada): debe aceptarlos para continuar. Después quedan en **Ayuda → Términos de uso**. Cada vez que se abre, el editor muestra su versión, que también aparece arriba en la **Ayuda**.
3. En la pantalla inicial puede crear un **Nuevo curso**, **Abrir** un archivo `.egf` o abrir uno de los **Ejemplos** (*World Cats*), que son una muy buena forma de ver cómo se arma un curso.

Consejo: una vez instalado, un curso `.egf` se abre en el editor con doble clic. Un curso `.json` antiguo pasa a ser `.egf` cambiando la extensión del archivo (el contenido es el mismo).

## 3. La pantalla

| Parte | Qué hace |
| --- | --- |
| **Grafo** (centro) | Los pasos y las flechas. Arrastre los pasos para organizarlos, o arrastre el título de una sección para mover la sección entera; use ⊞ para organizarlo todo automáticamente. |
| **Inspector** (derecha) | El contenido de lo que esté seleccionado. Empieza cerrado al abrir un archivo y se abre al hacer clic en un paso o en una flecha; el icono de barra lateral (⌥⌘0) lo abre y lo cierra, y su borde izquierdo se arrastra para cambiar el ancho — en la Vista previa, el mismo icono abre y cierra el panel de llamadas, estado, camino y consola. Sin nada seleccionado, muestra la información del curso. Sigue abierto cuando el agente de IA aparece a su lado. |
| **Barra superior** | Guardar, el ＋ que **inserta** pasos (los diez tipos, también en el menú **Insertar**), deshacer, las pestañas **Mapa / JSON / Vista previa**, el idioma del grafo, la insignia de **problemas** y, en el extremo derecho, el **agente de IA** ✦. |
| **Pestañas de curso** (justo debajo) | Un curso abierto por pestaña; ＋ crea un curso nuevo. |

### Varios cursos a la vez

Cada curso que abre o crea recibe una **pestaña de curso**, justo debajo de la barra superior. Haga clic en una pestaña para cambiar de curso: cada uno guarda su propio deshacer, la selección, la posición del grafo y la Vista previa. El punto ● en la pestaña indica cambios sin guardar; la ✕ cierra la pestaña y, si hay algo que guardar, el editor pregunta antes. Abrir un archivo que ya está abierto solo muestra su pestaña. Para reordenar, arrastre las pestañas.

Para **llevar pasos de un curso a otro**: seleccione los pasos en el grafo, pulse ⌘C, cambie de pestaña, haga clic en el grafo y pulse ⌘V. Los pasos llegan con ids nuevos, cerca del centro de la pantalla y con la misma disposición; las flechas entre ellos vienen también. Las referencias de uno a otro pasan a apuntar a las copias: una *Nota (IA)* copiada junto con su formulario evalúa el formulario copiado. Los textos llegan en los idiomas del curso de destino; si falta su idioma principal, el texto original va a ese idioma, para que lo traduzca allí mismo.

También puede pegar en el grafo un paso copiado de la pestaña **JSON** (el objeto entero del paso, de `{` a `}`).

## 4. Los tipos de paso

**Lo que ve el estudiante**

| Tipo | Para qué |
| --- | --- |
| Texto | Una lección escrita en markdown (títulos, listas, negrita, imágenes, fórmulas). |
| HTML | Una página interactiva lista (simulaciones, gráficos). |
| Texto con IA | La IA escribe el texto en el momento, para ese estudiante (por ejemplo, un refuerzo sobre lo que falló). |
| HTML con IA | La IA arma una página para ese estudiante. |
| Cuestionario | Preguntas de opción múltiple, cada una con una opción correcta. |
| Formulario | Campos para que el estudiante complete; con instrucciones y un campo de texto largo se convierte en una **tarea de escritura**. |
| Sí/no | Una pregunta de sí o no, que suele abrir un camino más largo o más corto. |

**Lo que decide la IA, sin que el estudiante se detenga** (aparecen como rombos)

| Tipo | Para qué |
| --- | --- |
| Elección (IA) | La IA elige una opción de una lista que usted escribió (por ejemplo: "refuerzo", "normal", "avanzado"). |
| Nota (IA) | La IA sitúa el trabajo del estudiante en una escala de niveles que usted escribió; con puntos, se convierte en una nota de 0 a 100. |
| Probabilidad (IA) | La IA responde a una pregunta de sí o no con la probabilidad del sí. |

## 5. Crear un curso, paso a paso

1. **Nuevo curso.** Haga clic en ＋ junto a las pestañas de curso (o pulse ⌘N). Sin nada seleccionado, complete a la derecha el título, el autor y, si quiere, la descripción.
2. **Agregue pasos.** Haga clic en el ＋ de la barra superior (o abra el menú **Insertar**) y elija *Texto*: el paso nuevo aparece debajo del seleccionado y ya viene seleccionado. Para elegir dónde queda, arrastre *Texto* desde la lista del ＋ hasta el grafo. Escriba el título en el inspector. El contenido aparece allí solo para lectura: haga clic en ✎ (o en el propio texto) para abrirlo en el editor de pantalla completa.
3. **Conecte los pasos.** Arrastre desde el círculo de abajo de un paso hasta otro. Eso crea una flecha.
4. **Marque el inicio.** El primer paso del curso tiene la insignia ▶. Para cambiarlo, marque "Este es el nodo de inicio del curso" en el paso que quiera.
5. **Guarde** con ⌘S. El editor graba un solo archivo, `mi-curso.egf`, con el curso y la disposición del grafo. Mover un paso en el grafo también es un cambio: la pestaña del curso muestra un punto hasta que se guarde.

### El editor de contenido

El contenido de un paso *Texto* (markdown) o *HTML*, y el prompt de un paso *Texto con IA* o *HTML con IA*, no se editan en el inspector: allí aparecen solo para lectura, y el ✎ junto al nombre del campo (o un clic en el texto) abre el editor, que ocupa toda la ventana.

- **Fuente** muestra el texto tal como se escribe; **Vista**, como lo ve el estudiante.
- La barra tiene los comandos principales: título, negrita, cursiva, lista con viñetas, lista numerada, enlace e imagen (en HTML, también párrafo). Actúan sobre el fragmento seleccionado; ⌘B, ⌘I y ⌘K aplican negrita, cursiva y enlace.
- El prompt se escribe en markdown, con la misma barra más la lista **Insertar {{STORAGE: …}}**; escribir `{{` abre la lista de claves allí mismo, en el cursor.
- El icono del extremo derecho de la barra activa y desactiva el ajuste de las líneas largas.
- En un curso con varios idiomas, el selector de arriba cambia el idioma del texto.
- Lo que escribe va al curso de inmediato: **Listo** (o Esc) cierra el editor sin perder nada, y ⌘Z deshace.

## 6. Caminos distintos para estudiantes distintos

Cuando de un paso sale más de una flecha, el estudiante sigue **la primera cuya condición se cumple**. Las flechas están numeradas en ese orden.

1. Haga clic en una flecha para ver el **editor de condiciones**.
2. Elija la **clave** (lo que produjo el estudiante, como `q1.percent`, el porcentaje de aciertos del cuestionario `q1`), el **operador** (≥, <, =…) y el **valor**. El editor muestra la escala de cada clave (0–100, 0–1, sí/no…).
3. Una condiciones con **Y** (todas se cumplen) u **O** (al menos una se cumple).
4. Siempre que haya condiciones, deje **una flecha sin condición al final**: es el "en otro caso". Una flecha nueva creada después de ella entra antes, con una condición para que usted la ajuste.
5. Para cambiar el orden, use ↑ ↓ en la lista "Aristas que salen de este nodo".

**Cuidados que el editor le recuerda:**

- Después de un paso de la IA (rombo), siempre debe haber una flecha sin condición: si la IA no consigue juzgar, el estudiante sale por ella.
- La nota de un paso *Nota (IA)* va de 0 hasta el número de niveles menos uno (por ejemplo, de 0 a 2) y no es un número entero. Para comparar con una nota de 0 a 100, dé **puntos** a los niveles y use `s1.percent`.
- Evite "igual a" con números que produce la IA; use ≥ o <.

## 7. Una tarea de escritura evaluada por la IA

El patrón es **Formulario → Nota (IA) → Texto con IA**:

1. **Formulario** con *instrucciones* (el enunciado: qué escribir, cuántas palabras, qué se evaluará) y un campo *Texto largo*, con mínimo y máximo de palabras.
2. **Nota (IA)**. En el **state**, escriba la tarea e inserte el texto del estudiante con `{{STORAGE: f1.texto}}` (escriba `{{` y elija la clave de la lista). En cada **pregunta**, diga qué evaluar y qué ignorar ("Evalúe las evidencias. No evalúe la ortografía."), y describa los niveles del más débil al más fuerte.
3. **Texto con IA** con **"Escrito a partir del juicio"** apuntando a la Nota. El prompt dice solo *cómo* escribir el comentario (tono, extensión, qué elogiar); la nota ya está decidida.
4. Flechas: Nota → comentario con la condición `s1.percent ≥ 0` (quiere decir "hubo juicio"), y Nota → paso siguiente sin condición.

El inspector de la Nota muestra las instrucciones del formulario al lado del state y avisa si usted cambió uno y olvidó el otro.

## 8. Encontrar y corregir problemas

La insignia de la barra superior muestra ✖ errores y ⚠ avisos. Haga clic en ella para ver la lista; haga clic en un elemento para ir al paso o a la flecha. Los pasos con problemas también reciben una insignia roja o naranja en el grafo.

- Los **errores** impiden que el curso funcione (una flecha a un paso que no existe, un cuestionario sin respuesta correcta).
- Los **avisos** son consejos (un texto muy corto, una traducción que falta). El curso funciona, pero vale la pena leerlos.

El editor aplica las mismas reglas que usa el player para revisar un curso antes de importarlo.

## 9. Probar como el estudiante (Vista previa)

En la pestaña **Vista previa** usted hace el curso como el estudiante, con la IA real.

1. En **Preferencias** (⚙), pegue su clave de **OpenRouter**. Queda guardada en el llavero del Mac, nunca en un archivo.
2. Los textos con IA se generan en el momento; las notas y elecciones de la IA se hacen como en el servidor, con el mismo modelo y los mismos límites.
3. Junto a **Reiniciar**, **Mostrando** indica el id del paso en pantalla, también cuando el estudiante revisa un paso anterior. Haga clic en él para ir a ese paso en el grafo; la vista previa sigue donde estaba.
4. A la derecha:
   - **Llamadas**: cada llamada a la IA, con modelo, tokens, costo y tiempo. Haga clic para ver lo que se envió y la respuesta.
   - **Estado**: todo lo que el estudiante ya produjo.
   - **Camino**: cada paso, la flecha tomada y la condición que la decidió; el camino también aparece en verde en el grafo. Use **Volver al nodo** para probar otra rama sin rehacerlo todo.
   - **Consola**: lo que el curso escribe en la consola del navegador y los errores que no maneja, también los de una página HTML, cada línea con la hora y el paso del que vino. Úsela para entender por qué una simulación no funciona.
5. Si edita el curso con la vista previa abierta, haga clic en **Aplicar cambios** para recargar manteniendo al estudiante donde está.
6. Los enlaces de un paso se abren en el navegador de su computadora, y la vista previa sigue donde estaba.

Sin clave, la vista previa funciona en modo reducido: los textos con IA muestran "intentar de nuevo" y las evaluaciones de la IA se convierten en un panel en el que usted mismo elige el resultado.

Para probar una sola evaluación, use **Probar juicio** en el inspector de la Nota/Elección/Probabilidad: escriba un texto de ejemplo y vea lo que responde la IA, las claves que se grabarían y adónde iría el estudiante.

## 10. Varios idiomas

- **Idiomas del curso…** (en el inspector del curso): agregue idiomas (`pt`, `en`, `es`, `pt-BR`…). El idioma de origen es siempre el primero.
- Cada texto recibe una pestaña por idioma; las vacías aparecen con un punto naranja.
- El selector 🌐 de la barra cambia el idioma de los títulos en el grafo; en la Vista previa usted elige el idioma del estudiante.

## 11. Publicar

- **Archivo → Exportar curso…** genera un HTML que ejecuta el curso por sí solo, sin servidor (las evaluaciones de la IA se convierten en el panel manual).
- Para publicar en Edukors, suba el archivo `mi-curso.egf` a su Google Drive e inscríbalo en la sección "Galería".
- Si lo prefiere, suba el archivo al proveedor de su preferencia.

## 12. El agente de IA

El icono ✦ en el extremo derecho de la barra superior (o ⇧⌘A) abre el **agente de IA** en el extremo derecho de la ventana, al lado del grafo y del inspector; haga clic de nuevo para cerrarlo. Los dos paneles son independientes: el icono de barra lateral (⌥⌘0) abre y cierra solo el inspector, y el ✦ solo el agente. El editor está configurado para operar con el Claude Code que esté instalado en su computadora. El agente trabaja en el curso que está en pantalla: lee los pasos, escribe, conecta flechas, traduce, valida y corrige.

**Antes de usarlo:** el agente usa su cuenta de Claude, la misma de Claude Code. Si el panel dice que no hay ninguna cuenta conectada, abra la Terminal, escriba `claude` y, dentro de él, `/login`; después haga clic en **Reintentar**.

**Cómo pedir.** Escriba en el campo de abajo y pulse ↵ (⇧↵ salta de línea). Ejemplos:

- "Revisa el curso y corrige los errores de validación."
- "Crea un cuestionario de 3 preguntas sobre el paso seleccionado."
- "Arma una tarea de escritura evaluada por la IA después de sm3, con comentario."
- "Traduce al español los textos que faltan."
- "Crea un curso corto sobre fracciones para 6.º grado." (sin curso abierto, crea uno en una pestaña nueva)

Lo que esté seleccionado en el grafo va junto con el mensaje: aparece en el chip ◎ del campo (haga clic en él para no enviarlo). Por eso, "este paso" quiere decir el paso seleccionado.

**Instrucciones permanentes.** En **Preferencias → Agente de IA** hay un campo de texto que el agente lee al comienzo de cada sesión. Úselo para lo que vale siempre: el público ("mis estudiantes son de 9.º grado"), el tono ("informal, frases cortas"), hábitos de armado ("termina cada sección con un cuestionario de 3 preguntas"). Lo que pida en la conversación tiene prioridad. Las instrucciones valen a partir de la próxima sesión (**Nueva sesión**).

**Skills y servidores MCP.** También en **Preferencias → Agente de IA** puede darle al agente habilidades extra:

- Las **skills** son paquetes de instrucciones (una carpeta con un archivo `SKILL.md`, a veces con scripts) que le enseñan al agente a hacer una tarea de cierta manera. Haga clic en **Abrir carpeta de skills**, ponga allí la carpeta de la skill y haga clic en **Recargar**: aparece en la lista.
- Los **servidores MCP** conectan al agente con otros programas y servicios (una carpeta de materiales, una base de documentos…). Pegue en el campo **Servidores MCP** el JSON que la documentación del servidor indica para Claude Code (el `.mcp.json`). Los servidores que piden iniciar sesión por la web no funcionan aquí.

Ambos valen a partir de la próxima sesión (**Nueva sesión**). El menú del modelo, al pie del panel, muestra las skills cargadas y si cada servidor se conectó (✓) o falló (✗). Si una skill necesita ejecutar un comando en el Mac, el agente pide su aprobación **para cada comando**, mostrando el comando, incluso en el modo Automático.

**Los tres modos** (en el botón ✋ del campo):

| Modo | Qué pasa |
| --- | --- |
| **Pedir antes** | Cada cambio aparece en una tarjeta con lo que va a cambiar (pasos agregados, cambiados, eliminados, flechas). Haga clic en **Permitir**, **Permitir siempre en esta sesión** o **Rechazar** (el **…** le deja decir lo que debe hacer en su lugar). |
| **Automático** | El agente cambia el curso sin preguntar. |
| **Planificar** | El agente estudia el curso y escribe un plan, sin cambiar nada. Apruebe el plan para que lo ejecute, o pida cambios. |

En cualquier modo, **cada cambio del agente es un paso de deshacer**: ⌘Z deshace el último. Leer un archivo de su Mac (adjunto con el clip 📎) o abrir una página web siempre pide su permiso. El agente no guarda el archivo del curso: guárdelo usted, con ⌘S, cuando esté conforme.

**Preguntas del agente.** Cuando el pedido admite más de un camino (el año escolar, la extensión, los idiomas), el agente pregunta en una tarjeta con opciones; elija una o escriba otra respuesta.

**Modelo y esfuerzo.** En el botón del modelo (por ejemplo, *Opus 5.5*) usted elige el modelo de Claude y el **esfuerzo**: más esfuerzo, respuestas más cuidadosas y más lentas. El valor predeterminado sirve para casi todo.

**Cuenta y uso.** El mismo menú muestra la cuenta de Claude en uso y el **uso de la cuenta**: las ventanas de límite de la suscripción, tal como Claude Code las informa (en inglés), cada una con una barra. *Current session* es la ventana de 5 horas; *Current week*, la de la semana; cada línea dice cuándo se renueva la ventana. El uso se actualiza al abrir el panel y después de cada respuesta (⟳ lo actualiza en el momento), y aparece también al comienzo de cada conversación nueva. Las ventanas son de la cuenta, no del editor: cuentan también lo que usa en claude.ai y en Claude Code. Para usar otra cuenta, inicie sesión con ella en Claude Code (`claude`, después `/login`) y empiece una conversación nueva en el panel.

**Sesiones.** Cada conversación queda guardada. El título en lo alto del panel abre la lista de conversaciones anteriores (con búsqueda); haga clic en una para seguir donde quedó. El icono ✎ empieza una conversación nueva; la 🗑 de cada elemento elimina la conversación.

**Detener.** Mientras el agente trabaja, el botón de enviar se convierte en ■: haga clic en él (o pulse Esc en el campo) para interrumpir. También puede escribir mientras trabaja: el mensaje entra en la cola.

## 13. Atajos

En Windows, ⌘ y ⌃ corresponden a Ctrl, ⌥ a Alt y ⇧ a Shift; dentro del editor, cada atajo ya aparece con las teclas de su sistema.

| Atajo | Acción |
| --- | --- |
| ⌘N / ⌘O / ⌘S / ⇧⌘S | Nuevo, abrir, guardar, guardar como |
| ⌘W | Cerrar la pestaña del curso |
| ⌃⇥ / ⌃⇧⇥ | Pestaña de curso siguiente / anterior |
| ⌘1 … ⌘9 | Ir a la pestaña de curso 1 … 9 (⌘9: la última) |
| ⌘Z / ⇧⌘Z | Deshacer / rehacer |
| ⌫ | Eliminar lo que esté seleccionado en el grafo |
| ⌘D | Duplicar los pasos seleccionados |
| ⌘C / ⌘V | Copiar y pegar pasos (también de una pestaña de curso a otra) |
| ⌘A | Seleccionar todos los pasos |
| ⌘0 | Encuadrar el grafo |
| ⇧⌘L | Organizar automáticamente |
| ⇧⌘M | Abrir / cerrar el panel de problemas |
| ⌘M / ⌘J / ⌘P | Pestaña Mapa / JSON / Vista previa |
| ⌥⌘0 | Abrir / cerrar el inspector (en la Vista previa, el panel lateral) |
| ⌘, | Preferencias |
| ⇧⌘A | Abrir / cerrar el agente de IA |
| ⌘B / ⌘I / ⌘K | Negrita / cursiva / enlace, en el editor de contenido |
| Esc | Limpiar la selección |
