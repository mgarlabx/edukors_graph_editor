# Guía del docente — Edukors Graph Editor

Esta guía muestra cómo crear un curso en Edukors Graph Editor, desde el primer paso hasta el archivo listo para publicar. No necesita escribir JSON: todo se hace en el mapa y en el inspector.

## 1. La idea en una frase

Un curso es un **grafo**. Cada **nodo** es un paso que el estudiante ve o hace (un texto, un cuestionario, un formulario) o una evaluación que la IA hace por detrás. Cada **flecha** (arista) indica qué paso viene después, y puede tener una **condición**: "si acertó el 70 % o más, vaya aquí; si no, allá".

## 2. Instalar y abrir

**En Mac** (Apple Silicon o Intel, macOS 11 o posterior):

1. Descargue [`Edukors-Graph-Editor-mac.dmg`](https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-mac.dmg), ábralo y arrastre la app a la carpeta **Aplicaciones**.
2. Abra la app. La primera vez, macOS pregunta si desea abrir una app descargada de Internet: haga clic en **Abrir**.

**En Windows** (10 u 11, 64 bits):

1. Abra la página del editor en Microsoft Store, [Edukors Graph Editor](https://apps.microsoft.com/detail/9N0N0P3GVRCK), y haga clic en **Obtener** (si se abre la app de Microsoft Store, haga clic en **Obtener** también allí). Sin avisos y sin contraseña de administrador.
2. El editor queda en el menú Inicio. Las versiones nuevas llegan por Microsoft Store, como las de cualquier app instalada desde ella.

Sin Microsoft Store (algunos equipos escolares la tienen desactivada), use el instalador:

1. Descargue [`Edukors-Graph-Editor-windows.exe`](https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-windows.exe). Si el navegador dice que el archivo no se descarga con frecuencia, abra el menú **…** junto a él y elija **Conservar** (en Edge, también **Mostrar más → Conservar de todas formas**).
2. Abra el archivo descargado. Este instalador no tiene firma digital, por eso Windows muestra **Windows protegió su PC**. Haga clic en **Más información** y luego en **Ejecutar de todas formas**.
3. El instalador no pide contraseña de administrador; enseguida el editor se abre y queda en el menú Inicio.

Si Windows dice que **bloqueó** el instalador, sin el botón *Ejecutar de todas formas*, el equipo tiene activado el **Control inteligente de aplicaciones** o una regla de la escuela que solo acepta programas firmados. Instale desde Microsoft Store o hable con quien administra el equipo.

**En Linux** (64 bits, x64):

- En **Ubuntu, Debian, Mint** y derivados, descargue el [`Edukors-Graph-Editor-linux.deb`](https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-linux.deb) y ábralo con doble clic (o ejecute `sudo apt install ./Edukors-Graph-Editor-linux.deb` en la carpeta donde está). La instalación pide su contraseña; después, el editor queda en el menú de aplicaciones.
- En **otras distribuciones**, descargue el [`Edukors-Graph-Editor-linux.AppImage`](https://github.com/mgarlabx/edukors_graph_editor/releases/latest/download/Edukors-Graph-Editor-linux.AppImage), márquelo como ejecutable (clic derecho → **Propiedades → Permisos → Permitir ejecutar el archivo como un programa**, o `chmod +x` en una terminal) y ábralo. Funciona sin instalar, desde donde esté.

**Versiones nuevas.** Cuando sale una versión nueva, el editor muestra un aviso, "La versión … está disponible.", con el botón **Descargar**: abre la página de descarga, y usted instala la versión nueva como instaló la primera. El editor no se actualiza solo. En Microsoft Store, quien actualiza es la propia Store.

**En todos los sistemas**, la primera vez, el editor muestra los **Términos de uso** (la licencia MIT, explicada): debe hacer clic en **Aceptar** para continuar (**Rechazar y salir** cierra el editor). Después quedan en **Ayuda → Términos de uso**. La versión del editor aparece en la barra de abajo de la ventana y arriba en la **Ayuda**. A partir de ahí puede crear un curso **Nuevo** o **Abrir** un archivo. Para ver cómo se arma un curso, descargue los [cursos de ejemplo](https://github.com/mgarlabx/edukors_graph/blob/main/samples/samples.README.md) (*Cats of the World*, ocho archivos `.egf`, cada uno explicado) y ábralos en el editor; también se ejecutan, cada uno con un video corto, en [edukors.org/graph](https://edukors.org/graph/).

### Los archivos del curso: `.egrx` y `.egf`

- El editor guarda el curso en un archivo **`.egrx`**: un paquete con el curso, la disposición del mapa y las conversaciones con el asistente de IA sobre él. Es el archivo de trabajo.
- Un curso **`.egf`** (o un `.json` antiguo) también se abre en el editor, con **Abrir**, **Recientes** o doble clic. Se abre como un curso **aún sin guardar**: al guardar, el editor pide un nombre y una carpeta para el `.egrx`. **Guardar** nunca modifica el archivo `.egf` original.
- El `.egf` sigue siendo el archivo que se publica (sección 11): para generarlo, use **Exportar**.
- Una vez instalado, un `.egrx` o un `.egf` se abre en el editor con doble clic.

### Si viene de la versión 2.20

La primera vez que se abre esta versión, trae de la 2.20, una sola vez, lo que ya estaba allí: los ajustes del editor, los ajustes y las skills del asistente de IA, los términos ya aceptados, los **Recientes** que todavía existen, el idioma y el tema. La clave de OpenRouter no viene: péguela de nuevo en **Configuración → IA en la vista previa** (sección 9). Los datos de la 2.20 quedan donde estaban.

Al abrir un `.egf`, las conversaciones que la 2.20 guardó sobre ese archivo entran en el historial del asistente de ese curso.

La versión 2.20 no abre archivos `.egrx`. Para llevar un curso de vuelta a ella, use **Exportar → Curso (.egf)**.

## 3. La pantalla

| Parte | Qué hace |
| --- | --- |
| **Barra superior** | De izquierda a derecha: el logotipo (abre edukors.org); **Archivo** (Nuevo, Abrir, Recientes, Guardar, Exportar, Mostrar en la carpeta); las vistas **Mapa / EGF / Vista previa / Vista previa con mapa**; Deshacer y Rehacer; Cortar, Copiar, Pegar, Duplicar y Eliminar; **Insertar nodo**, **Encuadrar el grafo** y **Problemas**; **Configuración** y **Ayuda**. En el extremo derecho, los botones de la **Barra lateral** (el inspector) y del **Asistente de IA**. |
| **Pestañas de curso** (justo debajo) | Un curso abierto por pestaña; el ＋ crea un curso nuevo. |
| **Mapa** (centro) | Los pasos y las flechas. Arrastre los pasos para organizarlos, o arrastre el título de una sección para mover la sección entera; ⇧⌘L lo organiza todo automáticamente. |
| **Inspector** (barra lateral, a la izquierda) | El contenido de lo que esté seleccionado. El título, el tipo y el id quedan fijos arriba; debajo, el paso se divide en dos partes: *Datos generales* (identificación, salidas y extras) y la parte de su tipo (el contenido, las preguntas, el juicio…). Empieza cerrado; el botón **Barra lateral**, en el extremo derecho de la barra superior, lo abre y lo cierra. Su borde se arrastra para cambiar el ancho. Sin nada seleccionado, muestra la información del curso. |
| **Asistente de IA** (a la derecha) | El panel del asistente (sección 12). Se abre y se cierra con su propio botón, independiente del inspector: los dos pueden estar abiertos a la vez. |

Sin ningún curso abierto, la barra muestra solo Nuevo, Abrir, Recientes, Configuración y Ayuda.

### Configuración y Ayuda

**Configuración** (⚙, o ⌘,) tiene tres partes:

- **Interfaz**: el **Idioma de la interfaz** (los textos del editor; el idioma del curso no cambia), el **Tema** (Sistema, Claro u Oscuro) y el **Tamaño de fuente**, del 80 % al 200 % (también con ⇧⌘+ y ⇧⌘−). En chino y en hindi, los textos propios del editor y esta guía aparecen en inglés.
- **Asistente de IA**: las cuentas y las opciones del asistente (sección 12).
- **IA en la vista previa**: la clave de OpenRouter y los modelos de la Vista previa (sección 9).

La **Ayuda** tiene tres pestañas: **Guía rápida**, **Guía completa** (esta guía) y **Términos de uso**.

### Varios cursos a la vez

Cada curso que abre o crea recibe una **pestaña de curso**, justo debajo de la barra superior. Haga clic en una pestaña para cambiar de curso: cada uno guarda su propio deshacer, la selección, la posición del mapa y la Vista previa. La pestaña indica cuando hay cambios sin guardar; la ✕ cierra la pestaña y, si hay algo que guardar, el editor pregunta antes. Abrir un archivo que ya está abierto solo muestra su pestaña.

Si el editor se cierra de repente con cambios sin guardar, la próxima vez que se abre ofrece **Recuperar** o **Descartar** esos cursos. Un curso recuperado se abre como "… (recuperado)", aún sin guardar; el archivo original no se toca.

Para **llevar pasos de un curso a otro**: seleccione los pasos en el mapa, pulse ⌘C, cambie de pestaña, haga clic en el mapa y pulse ⌘V. Los pasos llegan con ids nuevos, cerca del centro de la pantalla y con la misma disposición; las flechas entre ellos vienen también. Las referencias de uno a otro pasan a apuntar a las copias: una *Nota (IA)* copiada junto con su formulario evalúa el formulario copiado. Los textos llegan en los idiomas del curso de destino; si falta su idioma principal, el texto original va a ese idioma, para que lo traduzca allí mismo.

También puede pegar en el mapa un paso copiado de la pestaña **EGF** (el objeto entero del paso, de `{` a `}`).

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

1. **Nuevo curso.** Haga clic en **Nuevo** en la barra superior (o en el ＋ junto a las pestañas de curso). Sin nada seleccionado, complete en el inspector el título, el autor y, si quiere, la descripción.
2. **Agregue pasos.** Haga clic en **Insertar nodo** en la barra superior y elija *Texto*: el paso nuevo aparece debajo del seleccionado y ya viene seleccionado. Escriba el título en el inspector. El contenido aparece allí solo para lectura: haga clic en ✎ (o en el propio texto) para abrirlo en el editor de contenido.
3. **Conecte los pasos.** Arrastre desde el círculo de abajo de un paso hasta otro. Eso crea una flecha.
4. **Marque el inicio.** El primer paso del curso tiene la insignia ▶. Para cambiarlo, marque "Este es el nodo de inicio del curso" en el paso que quiera.
5. **Guarde** con ⌘S (o **Guardar**). La primera vez, el editor pide el nombre y la carpeta; graba un solo archivo, `mi-curso.egrx`, con el curso, la disposición del mapa y las conversaciones con el asistente. **Guardar como** (⇧⌘S) graba una copia con otro nombre. Mover un paso en el mapa también es un cambio: la pestaña del curso indica que hay algo que guardar hasta que lo guarde.

### El editor de contenido

El contenido de un paso *Texto* (markdown) o *HTML*, y el prompt de un paso *Texto con IA* o *HTML con IA*, no se editan en el inspector: allí aparecen solo para lectura, y el ✎ junto al nombre del campo (o un clic en el texto) abre el editor, que ocupa el área de trabajo, entre el inspector y el asistente de IA.

- **Fuente** muestra el texto tal como se escribe; **Vista**, como lo ve el estudiante.
- La barra tiene los comandos principales: título, negrita, cursiva, lista con viñetas, lista numerada, enlace e imagen (en HTML, también párrafo). Actúan sobre el fragmento seleccionado; ⌘B, ⌘I y ⌘K aplican negrita, cursiva y enlace.
- El prompt se escribe en markdown, con la misma barra más la lista **Insertar {{STORAGE: …}}**; escribir `{{` abre la lista de claves allí mismo, en el cursor.
- El icono del extremo derecho de la barra activa y desactiva el ajuste de las líneas largas.
- En un curso con varios idiomas, el selector de arriba cambia el idioma del texto.
- El ✦ de arriba abre y cierra el **asistente de IA** junto al texto. Sabe qué texto tiene abierto y en qué idioma: pídale "haz este texto más corto", "añade un ejemplo aquí", "traduce esto al español", y lo que escriba aparece en la caja (⌘Z deshace).
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

El botón **Problemas** de la barra superior (o ⇧⌘M) abre y cierra el panel de problemas, debajo del mapa, con los errores y los avisos del curso; haga clic en un elemento para ir al paso o a la flecha. Los pasos con problemas también reciben una insignia roja o naranja en el mapa.

- Los **errores** impiden que el curso funcione (una flecha a un paso que no existe, un cuestionario sin respuesta correcta).
- Los **avisos** son consejos (un texto muy corto, una traducción que falta). El curso funciona, pero vale la pena leerlos.

El editor aplica las mismas reglas que usa el player para revisar un curso antes de importarlo.

## 9. Probar como el estudiante (Vista previa)

En la vista **Vista previa** usted hace el curso como el estudiante, con la IA real.

1. En **Configuración → IA en la vista previa**, pegue su **Clave de OpenRouter** y haga clic en **Guardar clave**. Queda guardada cifrada por el propio sistema y nunca se muestra a la página del editor; **Borrar** la elimina. En la misma sección están los modelos de **Generación** y de **Juicio**, con los mismos valores que el player.
2. Los textos con IA se generan en el momento; las notas y elecciones de la IA se hacen como en el servidor, con el mismo modelo y los mismos límites.
3. Junto a **Reiniciar**, **Mostrando** indica el id del paso en pantalla, también cuando el estudiante revisa un paso anterior. Haga clic en él para ir a ese paso en el mapa; la vista previa sigue donde estaba.
4. El botón del extremo derecho de la barra de la vista previa abre y cierra el panel **Llamadas, estado, recorrido y consola** (empieza cerrado):
   - **Llamadas**: cada llamada a la IA, con modelo, tokens, costo y tiempo. Haga clic para ver lo que se envió y la respuesta.
   - **Estado**: todo lo que el estudiante ya produjo.
   - **Camino**: cada paso, la flecha tomada y la condición que la decidió; el camino también aparece en verde en el mapa. Use **Volver al nodo** para probar otra rama sin rehacerlo todo.
   - **Consola**: lo que el curso escribe en la consola del navegador y los errores que no maneja, también los de una página HTML, cada línea con la hora y el paso del que vino. Úsela para entender por qué una simulación no funciona.
5. Si edita el curso con la vista previa abierta, haga clic en **Aplicar cambios** para recargar manteniendo al estudiante donde está.
6. Los enlaces de un paso se abren en el navegador de su computadora, y la vista previa sigue donde estaba.
7. La vista **Vista previa con mapa** (⇧⌘P) es la misma vista previa con el mapa del curso al lado, como lo ve el estudiante en la plataforma: el mapa marca los pasos ya hechos y el camino recorrido, y sigue el paso actual. Las flechas en la línea entre las dos mitades amplían una de ellas. Cambiar entre las dos vistas no reinicia al estudiante.

Sin clave, la vista previa funciona en modo reducido: los textos con IA muestran "intentar de nuevo" y las evaluaciones de la IA se convierten en un panel en el que usted mismo elige el resultado.

Para probar una sola evaluación, use **Probar juicio** en el inspector de la Nota/Elección/Probabilidad: escriba un texto de ejemplo y vea lo que responde la IA, las claves que se grabarían y adónde iría el estudiante.

## 10. Varios idiomas

- **Idiomas del curso…** (en el inspector del curso): agregue idiomas (`pt`, `en`, `es`, `pt-BR`…). El idioma de origen es siempre el primero.
- El inspector muestra y edita todos los textos en un solo idioma, elegido en la barra **Idioma de los textos**, justo debajo del título del paso. Es también el idioma de los títulos en el mapa: cambiar uno cambia el otro. Un punto naranja marca el idioma en el que algún texto del paso todavía está vacío, y cada campo muestra junto a su nombre la etiqueta del idioma que está mostrando.
- En la Vista previa, el idioma del estudiante se elige en el propio player.

## 11. Publicar

Use **Exportar**, en la barra superior. La pantalla de exportación ofrece dos formatos:

- **Curso (.egf)**: el curso tal como está, para el player, el plugin de Moodle y la galería.
- **Player (HTML)**: un archivo HTML que ejecuta el curso solo, sin servidor (las evaluaciones de la IA se convierten en el panel manual).

El archivo se graba junto al `.egrx`, con el mismo nombre (por ejemplo, `mi-curso.egf`). Un curso que todavía no tiene archivo se guarda antes. Si ya existe un archivo con ese nombre, el editor avisa, y solo se reemplaza después de **Reemplazar**. Exportar nunca modifica el `.egrx`.

- Para publicar en Edukors, exporte el **Curso (.egf)**, suba el archivo `mi-curso.egf` a su Google Drive e inscríbalo en la sección "Galería".
- Si lo prefiere, suba el archivo al proveedor de su preferencia.

## 12. El asistente de IA

El botón **Asistente de IA**, en el extremo derecho de la barra superior, abre el panel del asistente en el extremo derecho de la ventana, al lado del mapa; haga clic de nuevo (o en la ✕ del panel) para cerrarlo. El asistente trabaja en el curso de la conversación: lee los pasos, escribe, conecta flechas, traduce, valida, corrige y organiza el mapa. Con el editor de contenido abierto, su ✦ trae el asistente junto al texto, para trabajar en ese texto (sección 5).

**Antes de usarlo.** El asistente responde con una cuenta suya en **Claude Code** (Anthropic) o en **Codex** (OpenAI), programas que usted instala en su computadora. En **Configuración → Asistente de IA**:

1. En **Cuentas**, haga clic en el ＋ (**Añadir cuenta**), elija el **Servicio de IA** (junto a cada uno aparece si el programa está instalado), dé un **Nombre de la cuenta** y haga clic en **Añadir e iniciar sesión**. El inicio de sesión se hace en la página del servicio, en el navegador. Si el programa no está instalado, la pantalla muestra la **Guía oficial** y el comando de instalación para su sistema (**Copiar comando**); después de instalarlo, haga clic en **Verificar de nuevo**. El editor no instala nada por sí solo.
2. Marque, a la izquierda de la cuenta, la que va a usar el editor. Las cuentas valen para todas las apps EDUKORS de la computadora; cambiar de cuenta empieza una conversación nueva.

Debajo de las cuentas, valen solo para este editor:

- **Instrucciones**: un texto que el asistente lee en cada conversación nueva. Úselo para lo que vale siempre: el público ("mis estudiantes son de 9.º grado"), el tono ("informal, frases cortas"), hábitos de armado ("termina cada sección con un cuestionario de 3 preguntas").
- **Servidores MCP**: conectan al asistente con otros servicios. El ＋ pide un **Nombre** y la **Dirección (URL)** del servidor. Los servidores que piden iniciar sesión por la web no funcionan aquí.
- **Skills**: paquetes de instrucciones (una carpeta con un archivo `SKILL.md`) que le enseñan al asistente a hacer una tarea de cierta manera. El ＋ añade una skill a partir de un archivo ZIP; la papelera la elimina.

**Cómo pedir.** Escriba en el campo de abajo y envíe. Ejemplos:

- "Revisa el curso y corrige los errores de validación."
- "Crea un cuestionario de 3 preguntas sobre el paso seleccionado."
- "Arma una tarea de escritura evaluada por la IA después de sm3, con comentario."
- "Traduce al español los textos que faltan."
- "Crea un curso corto sobre fracciones para 6.º grado." (crea el curso en una pestaña nueva)

Cada pedido lleva el estado del curso en pantalla, con los cambios aún sin guardar, y lo que esté seleccionado en el mapa. Por eso, "este paso" quiere decir el paso seleccionado.

**El ＋ del campo** ofrece: **Añadir archivos** (adjuntar archivos al pedido), **Skills** y **Servidores MCP** (para pedirle que use uno de ellos en este pedido) y **Buscar en la web** (activado o desactivado).

**Los tres modos** (en el botón de modo, junto al modelo):

| Modo | Qué pasa |
| --- | --- |
| **Revisar antes de aplicar** | El predeterminado. Cada cambio en el curso espera en una tarjeta, con **Detalles**; haga clic en **Aprobar** o **Rechazar**. |
| **Aplicar cambios** | El asistente cambia el curso al momento. |
| **Planificar** | El asistente lee el curso y propone un plan, sin cambiar nada. Para ejecutar el plan, elija otro modo y pídalo. |

En cualquier modo, **cada cambio del asistente es un paso de deshacer**: ⌘Z deshace el último. Cuando quiere usar uno de sus servidores MCP, pregunta antes: **Permitir**, **Permitir siempre** (en esta conversación) o **Rechazar**. El asistente no guarda el archivo del curso: guárdelo usted, con ⌘S, cuando esté conforme.

**Preguntas del asistente.** Cuando el pedido admite más de un camino (el año escolar, la extensión, los idiomas), el asistente pregunta en una tarjeta con opciones; elija una o escriba otra respuesta.

**Modelo y esfuerzo.** En el botón del modelo, junto a enviar, usted elige entre los modelos que ofrece el servicio y, cuando el modelo lo permite, el **esfuerzo**: más esfuerzo, respuestas más cuidadosas y más lentas. La elección queda guardada para cada cuenta.

**Uso de la cuenta.** Debajo del campo, una barra muestra cuánto de la ventana de uso de su cuenta (**Límite de la sesión**) ya se usó y cuándo se renueva. Es el uso de su cuenta en el servicio, no del editor.

**Conversaciones.** Las conversaciones son del curso: quedan guardadas dentro del `.egrx` cuando usted guarda (por eso una conversación nueva también cuenta como cambio sin guardar). Arriba del panel, **Conversaciones** abre el historial del curso, por día, con búsqueda; haga clic en una para continuar. **Nueva conversación** empieza otra; la papelera elimina una conversación.

**Detener.** Mientras el asistente trabaja, el botón de enviar se convierte en **Detener**. Los cambios ya hechos se mantienen y se pueden deshacer.

## 13. Atajos

En Windows y en Linux, ⌘ y ⌃ corresponden a Ctrl, ⌥ a Alt y ⇧ a Shift.

| Atajo | Acción |
| --- | --- |
| ⌘S / ⇧⌘S | Guardar / guardar como |
| ⌘W | Cerrar la pestaña del curso |
| ⌃⇥ / ⌃⇧⇥ | Pestaña de curso siguiente / anterior |
| ⌘Z / ⇧⌘Z | Deshacer / rehacer |
| ⌫ | Eliminar lo que esté seleccionado en el mapa |
| ⌘D | Duplicar los pasos seleccionados |
| ⌘X / ⌘C / ⌘V | Cortar, copiar y pegar pasos (también de una pestaña de curso a otra) |
| ⌘A | Seleccionar todos los pasos |
| ⌘0 | Encuadrar el grafo |
| ⇧⌘L | Organizar automáticamente |
| ⇧⌘M | Abrir / cerrar el panel de problemas |
| ⌘M / ⌘E / ⌘P | Vista Mapa / EGF / Vista previa |
| ⇧⌘P | Vista previa con mapa |
| ⌘, | Configuración |
| ⇧⌘+ / ⇧⌘− | Aumentar / reducir el tamaño de fuente |
| ⌘B / ⌘I / ⌘K | Negrita / cursiva / enlace, en el editor de contenido |
| Esc | Limpiar la selección |
