# storyboard.json

Es el plan de animaciones del video. Lo escribe Claude en `edicion/<nombre>/storyboard.json` y `armar` lo convierte en código de HyperFrames. Para ver todos los parámetros: `node <skill>/motor/editar.mjs componentes`.

## Formato

```json
{
  "notas": "una línea con la idea del plan",
  "elementos": [
    { "id": "e1", "tipo": "texto", "ancla": "frase exacta del transcript", "texto": "Dos *palabras*", "porque": "qué dice ahí que lo justifica" }
  ]
}
```

Campos de todos los tipos:

| Campo | Qué es |
|---|---|
| `id` | corto y único: `e1`, `e2`… |
| `tipo` | `texto`, `icono`, `grafica`, `lista`, `objeto3d`, `zoom`, `imagen` o `custom` |
| `ancla` | la frase donde entra, **copiada tal cual** de `transcript-cortado.txt` (2 a 6 palabras alcanzan). Entra 0.12 s antes de que se diga |
| `porque` | qué dice la persona ahí. Si no hay un porqué, no va la animación |
| `hasta` | opcional: frase donde sale. Si no, dura lo normal del tipo (2 a 3 s) |
| `duracion` | opcional: segundos que dura |
| `zona` | opcional: `arriba`, `abajo`, `izquierda` o `derecha`. Por defecto se ubica sola donde no tapa la cara ni los subtítulos |
| `ocurrencia` | opcional: si la frase se dice varias veces, cuál (1 = la primera) |

## Tipos

- **texto**: palabra clave o frase corta, grande. `texto` (máx. 5 palabras, una entre `*asteriscos*` sale en el color de acento), `al_decirlo: true` hace entrar cada palabra cuando se dice, `panel: true` le pone franja oscura.
- **icono**: ícono de línea que se dibuja solo. `icono` (check, x, reloj, rayo, corazon, estrella, chispa, fuego, dinero, regalo, sube, baja, flecha, foco, mic, onda, tijera, codigo, play, camara, chat, persona, calendario, candado, telefono, ojo, robot, pregunta, alerta) o `emoji`, más `etiqueta` opcional de 1 a 3 palabras.
- **grafica**: `forma: numero` (cuenta hasta `hasta`, con `prefijo` y `sufijo` como «$» o «%»), `anillo` (porcentaje), `barras` (`valores` y `etiquetas`) o `linea` (`direccion: sube` o `baja`). Solo números que la persona dice.
- **lista**: de 2 a 5 `items`, cada uno con su `ancla` para que entre cuando se nombra. `marca: check`, `numero` o `flecha`; `titulo` opcional.
- **objeto3d**: objeto 3D que entra girando en el color de acento. `forma`: cubo, esfera, dona, diamante, moneda, piramide, estrella o corazon; `etiqueta` opcional.
- **zoom**: acerca el video a la cara en un remate. `forma: golpe` (de una) o `empuje` (suave), `escala` de 1.12 a 1.3. No lleva caja.
- **imagen**: un archivo de la persona (logo, captura): `archivo` relativo a la carpeta del video, `marco: true` para capturas.
- **custom**: HTML, CSS y GSAP a mano para lo que nada de lo anterior cubre (`html`, `css`, `js`; `{{id}}`, `{{t0}}` y `{{t1}}` se reemplazan).

## Qué animación va dónde

- Cuando nombra una herramienta, un objeto o una idea: **icono** u **objeto3d**.
- Cuando dice un número: **grafica** (`numero`, `anillo` o `barras`).
- Cuando enumera («son tres cosas…»): **lista**, con cada ítem anclado a cuando lo dice.
- La frase que resume el video o el gancho: **texto**.
- El remate o la frase más fuerte: **zoom**.
- Si el plano está muy cerrado (la cara llena la pantalla), mejor un **zoom** o un **texto** corto arriba que algo grande.

## Ejemplo

Video: «Tres errores al grabar con el celular. El primero: grabar contra la ventana. El segundo: el micrófono lejos. Y el tercero, el que más vistas te cuesta: no mirar al lente. Arreglando esto, mis videos pasaron de 300 a 3,000 vistas.»

```json
{
  "notas": "gancho con texto, lista de los tres errores, remate con número",
  "elementos": [
    { "id": "e1", "tipo": "texto", "ancla": "Tres errores al grabar", "texto": "3 *errores*", "porque": "el gancho del video" },
    { "id": "e2", "tipo": "lista", "ancla": "El primero", "marca": "numero",
      "items": [
        { "texto": "Contra la ventana", "ancla": "contra la ventana" },
        { "texto": "Micrófono lejos", "ancla": "el micrófono lejos" },
        { "texto": "No mirar al lente", "ancla": "no mirar al lente" }
      ], "porque": "enumera los tres errores" },
    { "id": "e3", "tipo": "zoom", "ancla": "el que más vistas te cuesta", "forma": "golpe", "porque": "el remate" },
    { "id": "e4", "tipo": "grafica", "ancla": "pasaron de 300", "forma": "barras", "valores": [300, 3000], "etiquetas": ["Antes", "Después"], "porque": "dice los dos números" }
  ]
}
```
