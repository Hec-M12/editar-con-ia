// TEXTO — una palabra clave o una frase corta (máx. 5 palabras) que entra grande. *así* = palabra en el color de acento.
import { palabrasHtml, contarPalabras } from "../lib/anim.mjs";
import { normalizar } from "../lib/transcript.mjs";

// Tamaño de letra que va a entrar en la caja (estimado: ~0.62 em por letra, 0.74 en mayúsculas).
function tamanoQueEntra(texto, max, w, h, mayus) {
  const ws = String(texto).replace(/\*/g, "").split(/\s+/).filter(Boolean);
  const k = mayus ? 0.74 : 0.62;
  for (let f = max; f > 20; f -= 2) {
    let lineas = 1, ancho = 0, entra = true;
    for (const p of ws) {
      const a = p.length * k * f;
      if (a > w) { entra = false; break; }
      if (!ancho) ancho = a;
      else if (ancho + 0.28 * f + a <= w) ancho += 0.28 * f + a;
      else { lineas++; ancho = a; }
    }
    if (entra && lineas * 1.04 * f <= h) return f;
  }
  return 20;
}

export default {
  tipo: "texto",
  categoria: "texto",
  resumen: "Palabra clave o frase corta (máx. 5 palabras) grande, encima del video. *palabra* sale en el color de acento.",
  params: {
    texto: "lo que se lee (máx. 5 palabras). Solo palabras que la persona dice o un resumen fiel",
    al_decirlo: "true = cada palabra entra justo cuando la persona la dice",
    panel: "true = con fondo detrás (default: el de mi-estilo.md)",
  },
  minimo: 360, // px de ancho por debajo de los cuales avisa que queda chico
  durDefault: 2.2,
  aspecto: (el) => (contarPalabras(el.texto || "") <= 2 ? 2.6 : 1.9),
  build({ id, el, ajustes, M, z, t0, t1, palabras, escala }) {
    if (!el.texto) throw new Error("falta «texto»");
    const n = contarPalabras(el.texto);
    if (n > 7) throw new Error(`«${el.texto}» tiene ${n} palabras: el texto en pantalla va corto (máx. 5)`);
    const base = Math.round((n <= 1 ? 170 : n <= 2 ? 150 : n <= 4 ? 118 : 96) * ajustes.tamano_texto * escala);
    const panel = el.panel ?? ajustes.panel;
    const mascara = ajustes.entrada === "mascara";
    const html = `<div class="tx fit${panel ? " con-panel" : ""}" data-max="${base}" data-min="${Math.round(base * 0.42)}" data-maxh="${Math.round(z.h)}">${palabrasHtml(el.texto, { mascara })}</div>`;
    const css = `
#${id} .tx{font-family:var(--fuente),sans-serif;font-weight:900;color:var(--texto);text-shadow:var(--sombra);text-transform:var(--transformar);line-height:1.04;letter-spacing:-0.01em;text-align:center;width:100%;}
#${id} .tx .w{display:inline-block;}
#${id} .tx .hl{color:var(--acento);}
#${id} .tx.con-panel{background:var(--panel);color:var(--sobre-panel);border-radius:${Math.round(28 * escala)}px;padding:.18em .45em .24em;text-shadow:none;width:auto;max-width:100%;}
#${id} .tx.con-panel .hl{color:var(--acento-panel);background:var(--marcador-panel);border-radius:.14em;padding:0 .08em;}`;
    const sel = `#${id} .w`;
    let tl = "";
    const plano = String(el.texto).replace(/\*/g, "");
    const sonidos = [];
    if (el.al_decirlo) {
      // cada palabra entra cuando se dice: se busca en orden en el transcript, desde t0
      const ws = String(el.texto).replace(/\*/g, "").split(/\s+/).filter(Boolean);
      let k = palabras.findIndex((w) => w.start >= t0 - 0.3);
      if (k < 0) k = 0;
      let ultimo = t0;
      ws.forEach((w, i) => {
        const objetivo = normalizar(w);
        let at = null;
        for (let j = k; j < Math.min(palabras.length, k + 12); j++) {
          if (normalizar(palabras[j].text) === objetivo) { at = palabras[j].start - 0.05; k = j + 1; break; }
        }
        at = Math.max(ultimo, at ?? ultimo + M.stagger * 2);
        ultimo = at;
        tl += M.entrada(`js:document.querySelectorAll("#${id} .w")[${i}]`, at, { stagger: 0 });
        sonidos.push(i === 0 ? { t: at, tipo: "pop", que: `texto «${plano}»` } : { t: at, tipo: "click suave", que: `«${w}»`, extra: true });
      });
    } else {
      tl += M.entrada(sel, t0, { stagger: M.stagger });
      sonidos.push({ t: t0, tipo: "pop", que: `texto «${plano}»` });
    }
    if (panel) tl = `tl.fromTo("#${id} .tx",{opacity:0},{opacity:1,duration:0.2},${M.t(t0)});` + tl;
    tl += M.salida(`#${id} .tx`, t1);
    // si pidió letras más grandes y en este lugar no crecen, se avisa (el arreglo es acortar el texto)
    let aviso = null;
    if (ajustes.tamano_texto > 1.05) {
      const entra = tamanoQueEntra(el.texto, base, z.w, z.h, ajustes.mayusculas);
      if (entra < base / ajustes.tamano_texto) aviso = `${id}: en este lugar las letras no pueden crecer más sin tapar la cara (quedan en ~${entra} px): acortalo a 1 o 2 palabras o anclalo con el plano más abierto`;
    }
    return { html, css, tl, aviso, sonidos };
  },
};
