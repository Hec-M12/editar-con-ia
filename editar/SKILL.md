---
name: editar
description: Edita videos hablados (reels, shorts, tiktoks) en la compu de la persona. Primero pregunta su estilo (y si pasa un video que le gusta, mide cómo está editado y lo copia) y lo guarda; después Whisper anota cada palabra con su segundo, FFmpeg corta el aire entre frases sin tocar lo que dijo, HyperFrames convierte código en animaciones encima (texto, íconos, gráficas, listas, 3D) sin tapar la cara, y cada corrección queda como regla para la próxima. Usala cuando alguien diga «editá mi video», «/editar», «editame este reel», «editalo como este video», «cortá los silencios», «poneles animaciones» o pase un .mp4/.mov para editar.
---

# editar

Edita un video hablado como lo haría un editor: corta el aire, pone animaciones donde suman y aprende cómo te gusta. Son cuatro herramientas: **Whisper** (anota cada palabra con su segundo exacto), **FFmpeg** (corta), **HyperFrames** (convierte código en animaciones) y vos, Claude, que dirigís a las tres. Las tres primeras son gratis y corren en la compu de la persona.

Hablale a la persona en su idioma y corto. Hecha por @hectormej.ia.

## Lo que nunca se rompe

1. **El estilo va primero.** No toques el video sin `mi-estilo.md`. Si no existe, preguntá (paso 1), **una pregunta por mensaje**.
2. **Nunca cambiás lo que la persona dijo.** Se corta aire (silencios, «eh», «em»), no frases. Una frase solo sale si la persona lo pide.
3. **Las Reglas de `mi-estilo.md` mandan** sobre todo lo demás, incluso sobre este archivo.
4. **Cero datos inventados.** Todo texto o número en pantalla sale de lo que la persona dice.
5. **Nada generado con IA.** Las animaciones son código; no se usan servicios de video ni de imágenes con IA.
6. **El video no sale de la compu.** Whisper corre local; no subas el video ni cuadros a ningún servicio.

## El motor

Todo se corre con `node <skill>/motor/editar.mjs <paso> <video>`, donde `<skill>` es la carpeta de este SKILL.md (por ejemplo `~/.claude/skills/editar`). El trabajo queda en `edicion/<nombre>/` al lado del video y el resultado en `<nombre>-editado.mp4`, también al lado.

- La primera vez (o si no existe `<skill>/motor/node_modules`): `node <skill>/motor/editar.mjs instalar`. Si dice que falta FFmpeg o Whisper, pasale a la persona el comando que muestra y esperá a que lo instale.
- Para retomar o saber qué falta: `node <skill>/motor/editar.mjs estado <video>`.

## Paso 1 · El estilo

Corré `estado <video>`: muestra si hay un `mi-estilo.md` en la carpeta del video (o hasta tres carpetas arriba).

**Si existe:** leelo entero, sobre todo `## Reglas`. Decile en una línea con qué estilo vas (por ejemplo: «Uso tu estilo: ritmo rápido, texto e íconos en amarillo, pocas animaciones y 2 reglas que me enseñaste») y seguí sin preguntar nada.

**Si no existe:** hacé estas seis preguntas, **una por mensaje**, en este orden. Esperá cada respuesta antes de la siguiente; confirmala en pocas palabras y pasá a la otra. Si dice «no sé» o «como quieras», elegí vos según sus referencias y decile qué elegiste.

1. **Referencias:** «¿Qué cuentas o videos te gustan cómo están editados? Pasame de 1 a 3 y contame qué te gusta de cada uno. Si me pasás un video (el archivo o el link), lo miro y copio cómo está editado.» Si te pasa un video, seguí **Copiar el estilo de un video** (abajo) antes de la pregunta 2.
2. **Ritmo:** «¿Cómo querés el ritmo: cortes rápidos sin respiro, medio, o pausado con aire entre frases?»
3. **Tipo de animaciones:** «¿Qué querés encima del video? Podés elegir varias: texto (palabras clave grandes), íconos, gráficas (números, barras, líneas), listas o 3D (objetos que giran).»
4. **Colores y fuente:** «¿Tenés colores o una fuente de tu marca? Por ejemplo: amarillo y blanco, con Montserrat. Si no, los elijo yo según tus referencias.»
5. **Cuántas:** «¿Cuántas animaciones: pocas (una cada 8 a 10 segundos), normal (una cada 5) o muchas (una cada 2 o 3)?»
6. **Subtítulos:** «Última: ¿subtítulos? Te los pongo yo, los ponés vos en tu app (dejo libre ese espacio) o sin subtítulos.»

Con las respuestas, copiá `<skill>/plantillas/mi-estilo.md` a la carpeta del video como `mi-estilo.md` y llenalo:

| Respuesta | En `mi-estilo.md` |
|---|---|
| rápido / medio / pausado | `ritmo: rapido` + `energia: alta` · `ritmo: medio` + `energia: media` · `ritmo: pausado` + `energia: calma` + `zoom_en_cortes: no` |
| texto, íconos, gráficas, listas, 3D | `tipos: [texto, icono, grafica, lista, 3d]` (solo las que eligió) |
| colores | `color_acento` (el color fuerte) y `color_texto` (casi siempre blanco), en hex entre comillas o por nombre: amarillo, rojo, verde, azul, celeste, naranja, rosado, morado |
| fuente | `fuente:` cualquier nombre de Google Fonts |
| pocas / normal / muchas | `densidad: pocas`, `normal` o `muchas` |
| subtítulos | `captions: yo`, `app` o `no` |

Las referencias también deciden: si le gustan textos grandes en mayúsculas, `mayusculas: si`; si le gusta el texto sobre una franja oscura, `panel: si`; si hay mucho movimiento, `entrada: pop` (si es más sobrio, `sube`). Escribí en `## Referencias` y `## Lo que me dijiste` sus palabras tal cual. Decile dónde quedó: «Guardé tu estilo en mi-estilo.md. La próxima vez no te pregunto».

### Copiar el estilo de un video

1. `node <skill>/motor/editar.mjs referencia <su-video> <archivo-o-link>`. Tarda de 2 a 5 minutos y mide hasta 90 s (`--hasta 120` para más). El idioma en que se habla lo detecta solo, aunque no sea el de la persona. Con un link hace falta yt-dlp: si no está, el paso dice cómo instalarlo; si no quiere instalar nada, pedile que baje el video y te pase el archivo.
2. Leé `referencias/<nombre>/medidas.txt` y abrí `hoja-*.jpg` (un cuadro por segundo) y `momentos.jpg` (cuadro a cuadro de cómo entran y salen los textos y los zooms). Los números dicen cuánto y cada cuánto; las hojas dicen **qué** es cada cosa: qué íconos o stickers, qué gráficas, colores, fuente y si el texto lleva fondo.
3. Escribí de 4 a 8 reglas en `## Reglas de la referencia` de `mi-estilo.md`, cada una con un número medido. Por ejemplo:
   - `La imagen cambia cada 2.2 s: un salto de zoom (100 % ↔ 120 %) al arrancar frase, cada ~2 s.`
   - `Etiquetas blancas con letra negra, de 2 o 3 palabras de lo que dice, debajo del mentón, 0.8 s cada una.`
   - `Un ícono cuando nombra una herramienta o una cosa, en la misma zona que las etiquetas.`
   - `Cuando dice una cifra, la cifra entra gigante y cuenta hasta su valor (grafica numero), de 1 a 2 s.`
4. Pasá las medidas a los ajustes de arriba con esta tabla (las sugerencias del final de `medidas.txt` son el punto de partida):

| En `medidas.txt` o en las hojas | En `mi-estilo.md` |
|---|---|
| la imagen cambia cada menos de 3 s | `ritmo: rapido` + `energia: alta` |
| saltos con zoom o planos cortos | `zoom_cada:` lo que dura el plano (en segundos) · `zoom_escala:` 1 + lo que cambian (20 % → 1.2) |
| textos por minuto: 15 o más · de 7 a 15 · menos de 7 | `densidad: muchas` · `normal` · `pocas` |
| cuánto dura cada texto | `duracion_animaciones:` esos segundos (mínimo 0.8) |
| textos en mayúsculas | `mayusculas: si` |
| el texto lleva fondo (en las hojas) | `panel: si` + `color_panel` (blanco = etiqueta blanca con letra negra) |
| subtítulos de N palabras, a X % de la altura | `captions: yo` + `palabras_por_subtitulo: N` + `altura_subtitulos: X` |
| números en pantalla (cuántos, si cuentan, si entran cuando dice la cifra) | regla: `grafica` con `forma: numero` en la palabra de la cifra · `tipos:` sumá `grafica` |
| íconos, stickers o logos (en las hojas) | `tipos:` sumá `icono` |
| colores y fuente (en las hojas) | `color_acento`, `color_texto`, `fuente` (la más parecida de Google Fonts) |

5. Contale en 2 o 3 líneas qué viste y seguí con las preguntas 2 a 6, una por mensaje, proponiendo lo medido: «Tu referencia cambia la imagen cada 2 segundos. ¿Querés ese ritmo rápido o algo más tranquilo?». Lo que la persona diga distinto gana sobre la referencia: cambiá el ajuste y anotalo en `## Lo que me dijiste`.
6. La referencia solo se mide. No se copia nada de ella al video (ni imágenes, ni música, ni textos) y no se sube a ningún lado.

## Paso 2 · Preparar y transcribir

`node <skill>/motor/editar.mjs preparar <video>` deja el video en formato de trabajo y Whisper lo transcribe palabra por palabra. Usa el modelo de `whisper:` en `mi-estilo.md` (por defecto `small`, que corre bien en una compu de 8 GB; `medium` es más preciso con 16 GB o más; `base` o `tiny` para compus lentas). Leé `edicion/<nombre>/transcript.txt`.

Si Whisper escuchó mal una palabra que se entiende por el contexto (por ejemplo «lo sacó la ida» por «lo sacó la IA»), corregí solo el texto de esa palabra en `edicion/<nombre>/transcript.json`, nunca los tiempos, y contáselo a la persona en la entrega. Si no estás seguro de qué dijo, preguntale. Importa sobre todo con subtítulos y en los textos que van en pantalla.

## Paso 3 · Cortar el aire

1. `cortar <video> --plan` muestra qué sacaría sin tocar nada.
2. Si saca más del 25 % o avisa «Palabras que pierden voz en un corte», contale el resumen a la persona y preguntale si sigue. Si no, seguí.
3. `cortar <video>`. Desde acá, los tiempos salen de `edicion/<nombre>/transcript-cortado.txt`.

`--quitar 12.3-14.1` saca un tramo a propósito (un arranque falso, una toma repetida). Usalo **solo si la persona lo pide** («sacá donde me trabo», «dejá la última vez que lo digo»), con los segundos de `transcript.txt`, y antes de cortar decile qué frases salen.

## Paso 4 · Mirar el encuadre

`caras <video>` detecta dónde está la cara (en Mac, sola) y deja `edicion/<nombre>/cuadros.jpg`. Abrí esa imagen y mirala: dónde está la cara, si el plano cambia, qué hay de fondo. En Windows o Linux, el paso te dice cómo escribir `caras.json` a ojo con la grilla de esa hoja.

## Paso 5 · El storyboard

Escribí `edicion/<nombre>/storyboard.json`. El formato, los tipos y un ejemplo están en `<skill>/referencia/storyboard.md`; `node <skill>/motor/editar.mjs componentes` lista todos los parámetros. Cada animación:

- se ancla a una frase **copiada tal cual** de `transcript-cortado.txt` (`ancla`);
- lleva `porque`: qué dice la persona ahí que la justifica;
- es de un tipo que está en `tipos` (el `zoom` siempre vale, salvo con ritmo pausado);
- muestra palabras que la persona dice, o un resumen fiel de 1 a 3 palabras; máximo 5, con *una* palabra resaltada entre asteriscos.

Cuántas: pocas, una cada 8 a 10 s; normal, una cada 5 s; muchas, una cada 2 o 3 s. Que haya una en los primeros 2 segundos (el gancho). No repitas el mismo tipo tres veces seguidas y no pongas dos animaciones a la vez. Cumplí cada regla de `## Reglas` y, si hay, de `## Reglas de la referencia`: qué tipo entra, dónde (`zona`), cuánto dura y cuándo salen de ahí. Si las dos chocan, gana `## Reglas`.

## Paso 6 · Armar y revisar

1. `armar <video>` convierte el storyboard en la composición. Si hay errores (casi siempre una frase que no encuentra), arreglá el storyboard y volvé a armar.
2. `revisar <video>` corre el lint de HyperFrames y deja `edicion/<nombre>/revision/hoja.jpg`: una foto de cada animación con la cara en amarillo, la caja de la animación en celeste y la franja de subtítulos en rojo. **Abrila y mirala.** Revisá que nada celeste tape la cara, que el texto se lea y que cada animación cuadre con lo que se dice.
3. Arreglá cada aviso: «queda chico» se arregla anclando la animación en un momento con el plano más abierto, acortándola con `duracion` (en menos tiempo la cara se mueve menos), con otra `zona` o con menos palabras. Volvé a armar y revisar, hasta tres vueltas; si sigue chica pero se lee, dejala y decíselo a la persona.

## Paso 7 · Render y entrega

1. Avisale que tarda unos minutos y corré `render <video>`.
2. Verificá el resultado: `cuadros <nombre>-editado.mp4 --cada 2` y abrí la hoja. Tienen que verse las animaciones, la cara libre y ningún cuadro negro.
3. Entregá la ruta del video y, en 3 a 5 líneas: cuánto aire se cortó, qué animaciones hay (segundo y qué es) y «Revisalo y decime qué cambio, como a un editor».

## Paso 8 · Cuando corrige algo (así aprende cómo editás)

Cada corrección son tres cosas: **(1)** hacé el cambio; **(2)** guardalo como regla en `## Reglas` de `mi-estilo.md`, con la fecha y sus palabras, y si corresponde a un ajuste de arriba cambialo también; **(3)** rehacé solo los pasos necesarios y entregá de nuevo.

Ejemplo de regla: `- 2026-10-25 · «las letras más grandes» → tamano_texto: 1.3`

Si pasa otro video de referencia («editalo como este»), corré `referencia` con ese video y reemplazá `## Reglas de la referencia`; las reglas de sus correcciones se quedan.

| Si dice… | Cambiá | Rehacé |
|---|---|---|
| «letras más grandes» o «más chicas» | `tamano_texto` ± 0.3; si `armar` avisa que en ese lugar no pueden crecer, acortá esos textos a 1 o 2 palabras | armar, revisar, render |
| «más rápido», «sacá más pausas» | `silencio_max` 0.1 menos que el actual (mínimo 0.15; el ritmo rápido arranca en 0.25, medio en 0.4, pausado en 0.7) | cortar y lo que sigue |
| «no cortes tanto», «dejá respirar» | `silencio_max` 0.2 más que el actual | cortar y lo que sigue |
| «menos» o «más animaciones» | `densidad` | storyboard y lo que sigue |
| «otro color», «otra fuente» | `color_acento`, `fuente` | armar y lo que sigue |
| «sin zoom» | `zoom_en_cortes: no` y `zoom_cada: 0` | armar y lo que sigue |
| «más zooms» o «menos zooms» | `zoom_cada` (segundos entre zooms: menos = más zooms; 0 = solo en los cortes) | armar y lo que sigue |
| «que duren más» o «menos» en pantalla | `duracion_animaciones` ± 0.5 | armar y lo que sigue |
| «con» o «sin subtítulos» | `captions` | armar y lo que sigue |
| «ahí dice otra cosa» (una palabra mal escrita en los subtítulos) | el texto de esa palabra en `transcript-cortado.json` (nunca los tiempos) | armar y lo que sigue |
| gustos sin ajuste («no me tapes las manos», «los íconos no») | solo la regla, en palabras | storyboard y lo que sigue |

Si una corrección nueva contradice una regla vieja, reemplazá la vieja. La próxima vez las reglas se leen en el paso 1 y se cumplen en el paso 5, sin que la persona lo repita.

## Si algo falla

- «Falta instalar el motor»: corré `instalar`.
- Whisper no aparece: `instalar` muestra cómo instalarlo según el sistema.
- No encuentra una frase del storyboard: copiala de `transcript-cortado.txt`; las tildes y los signos no importan, las palabras sí.
- El render falla: el error dice dónde está el log. Volvé a correr `render`, que retoma desde donde quedó; en compus de 8 GB conviene cerrar otras apps.
- Sin internet, la fuente se reemplaza por una del sistema y `armar` lo avisa.
- `referencia` sin Mac: mide los cortes y transcribe, pero los zooms y los textos sacalos vos de las hojas.
