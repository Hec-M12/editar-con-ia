# editar · tu editor de video con IA

Una skill para Claude Code (también sirve en Codex). Le pasás un video donde hablás a cámara y te lo devuelve editado: sin el aire entre frases y con animaciones encima que no te tapan la cara. Antes de tocar tu video, te pregunta qué estilo querés (si le pasás un video que te gusta, mide cómo está editado y lo copia), y cada vez que le corregís algo, lo aprende.

Son cuatro herramientas, y tres son gratis:

- **Whisper** anota cada palabra que decís con su segundo exacto. Gratis, corre en tu compu.
- **FFmpeg** corta el aire entre frases sin tocar lo que dijiste. Gratis.
- **HyperFrames** convierte código en animaciones encima del video. Gratis (open source).
- **Claude** dirige a las otras tres. Es lo único pago: usa tu plan de Claude (o el de ChatGPT, si usás Codex).

## 1. Instalá esto (una sola vez)

| | Mac | Windows | Linux |
|---|---|---|---|
| **Node 22 o más nuevo** | [nodejs.org](https://nodejs.org) | [nodejs.org](https://nodejs.org) | [nodejs.org](https://nodejs.org) |
| **FFmpeg** | `brew install ffmpeg` | `winget install Gyan.FFmpeg` | `sudo apt install ffmpeg` |
| **Whisper** (whisper.cpp) | `brew install whisper-cpp` | bajá `whisper-bin-x64.zip` de [github.com/ggml-org/whisper.cpp/releases](https://github.com/ggml-org/whisper.cpp/releases), descomprimilo y poné la ruta de `whisper-cli.exe` en la variable de entorno `HYPERFRAMES_WHISPER_PATH` | compilá [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (`cmake -B build && cmake --build build -j`) y poné `build/bin/whisper-cli` en tu PATH |
| **yt-dlp** (opcional: solo para pasarle links de videos que te gustan) | `brew install yt-dlp` | `winget install yt-dlp` | `pip install yt-dlp` |

En Mac, si no tenés `brew`, instalalo primero desde [brew.sh](https://brew.sh). Y obvio, Claude Code (o Codex).

## 2. Copiá la carpeta

Copiá la carpeta `editar` a la carpeta de skills:

- **Claude Code:** `~/.claude/skills/editar` (en Windows, `C:\Users\<vos>\.claude\skills\editar`)
- **Codex:** `~/.codex/skills/editar`

En Mac o Linux, desde donde bajaste la carpeta:

```
mkdir -p ~/.claude/skills && cp -r editar ~/.claude/skills/
```

## 3. Primera frase

Abrí Claude Code en la carpeta donde está tu video y escribile:

```
Editá mi-video.mp4
```

(También funciona `/editar mi-video.mp4`.)

La primera vez instala el motor (uno o dos minutos) y te hace seis preguntas de estilo, de a una: qué cuentas te gustan, el ritmo, qué animaciones querés, tus colores, cuántas animaciones y si querés subtítulos. Guarda tus respuestas en `mi-estilo.md`, en la carpeta de tu video, y la próxima vez no te pregunta. Al final te deja `mi-video-editado.mp4` al lado del original.

¿Tenés un video que te encanta cómo está editado? En la primera pregunta pasale el archivo o el link. Lo mira cuadro por cuadro y anota cada cuánto corta, cuántos zooms hace y cuánto acercan, qué textos e íconos aparecen, dónde y cuánto duran. Con eso escribe las reglas en tu `mi-estilo.md` y edita tu video así. Solo lo mide: no copia nada de ese video al tuyo.

Cuando lo veas, pedile cambios como a un editor: «las letras más grandes», «cortá más rápido», «menos animaciones». Cada corrección queda como regla en `mi-estilo.md` y la respeta en los videos que siguen.

## ¿Qué modelo de Whisper conviene?

| Tu compu | Modelo | Descarga (la primera vez) |
|---|---|---|
| 8 GB de RAM (la mayoría de las laptops) | `small` (viene por defecto) | 490 MB |
| 16 GB o más | `medium`: se equivoca menos con nombres y palabras raras | 1.5 GB |
| vieja o muy lenta | `base` | 150 MB |

Se cambia en `mi-estilo.md`, en la línea `whisper:`.

## Bueno saber

- **Cuánto tarda:** en una MacBook Air M2 con 8 GB, una toma cruda del iPhone (4K, 48 segundos): prepararla 33 segundos, Whisper 8, cortar y mirar la cara 8, y el render de los 13 segundos que quedaron, 36. Un video de 28 segundos se renderiza en un minuto y poco. Medir un video de referencia de un minuto tarda unos 3. El resto es Claude pensando el plan.
- **La primera vez necesita internet** para bajar el motor (165 MB), el Chrome con el que HyperFrames dibuja cada cuadro (190 MB), el modelo de Whisper y la fuente. Después, tu video nunca sale de tu compu.
- **La cara:** en Mac la detecta sola (y en un video de referencia, también lee los textos). En Windows y Linux, Claude mira fotos del video y lo ubica él.
- **Subtítulos:** opcionales. Te los pone la skill, los ponés vos en tu app (deja libre ese espacio) o van sin.
- **Nunca cambia lo que dijiste:** corta aire, no frases.

Hecha por @hectormej.ia. Usa HyperFrames (Apache 2.0), GSAP (gratis, con su propia licencia), Three.js (MIT), whisper.cpp (MIT) y FFmpeg (LGPL).
