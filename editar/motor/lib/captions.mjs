// Subtítulos (solo si mi-estilo.md dice «captions: yo»): frases de hasta 4 palabras, la palabra que se
// está diciendo en el color de acento. Van en la franja de subtítulos; si la cara baja hasta ahí, van
// debajo del mentón. Si la persona prefiere ponerlos en su app («captions: app»), no se dibujan pero
// la franja queda libre de animaciones.
import { esc } from "./anim.mjs";

export function agruparFrases(palabras, { maxPalabras = 4, maxLetras = 99, pausa = 0.35, maxDur = 1.8 } = {}) {
  const out = [];
  let actual = [];
  const letras = (g) => g.reduce((n, w) => n + w.text.length, 0) + Math.max(0, g.length - 1);
  palabras.forEach((w, i) => {
    const prev = palabras[i - 1];
    const cortar = actual.length && (
      actual.length >= maxPalabras ||
      letras(actual) + 1 + w.text.length > maxLetras ||
      w.start - prev.end > pausa ||
      /[.,;:!?…]$/.test(prev.text) ||
      w.end - actual[0].start > maxDur
    );
    if (cortar) { out.push(actual); actual = []; }
    actual.push(w);
  });
  if (actual.length) out.push(actual);
  return out;
}

export function construirCaptions({ palabras, ajustes, zonas, W, H, D, primerTrack = 200 }) {
  const franja = zonas.franja;
  if (ajustes.captions !== "yo" || !franja || !palabras.length) return { hosts: [], css: "", tl: "", frases: 0 };
  const alto = franja[1] - franja[0];
  const tam = Math.round(Math.min(alto * 0.55, 66) * ajustes.tamano_texto * (Math.min(W, H) / 1080));
  // frases que entran en una línea a ese tamaño (~0.62 em por letra)
  const maxLetras = Math.max(8, Math.floor((zonas.seguro.der - zonas.seguro.izq) / (0.62 * tam)));
  const grupos = agruparFrases(palabras, { maxPalabras: ajustes.palabras_por_subtitulo || 4, maxLetras });
  const t = (x) => +Number(x).toFixed(3);
  const hosts = [];
  let tl = "";
  grupos.forEach((g, k) => {
    const sig = grupos[k + 1];
    const t0 = Math.max(0, g[0].start - 0.04);
    const t1 = Math.min(D - 0.02, sig ? sig[0].start - 0.02 : g[g.length - 1].end + 0.5);
    if (t1 - t0 < 0.1) return;
    // si el mentón baja hasta la franja, los subtítulos van debajo de la cara
    const cara = zonas.cajaCara(t0, t1);
    let y = franja[0];
    if (cara.detectada && cara.nucleo.y1 + 16 > franja[0]) y = Math.min(Math.round(cara.nucleo.y1 + 24), zonas.seguro.abajo - alto);
    const id = `cap${k}`;
    const palabrasHtml = g.map((w, j) => `<span class="cw cw${j}">${esc(w.text)}</span>`).join(" ");
    hosts.push(`<div id="${id}" class="host clip cap" data-start="${t(t0)}" data-duration="${t(t1 - t0)}" data-track-index="${primerTrack + k}" style="left:${zonas.seguro.izq}px;top:${y}px;width:${zonas.seguro.der - zonas.seguro.izq}px;height:${alto}px;z-index:${500 + k};"><div class="cont"><div class="capt fit" data-max="${tam}" data-min="${Math.round(tam * 0.55)}" data-maxh="${alto}">${palabrasHtml}</div></div></div>`);
    tl += `tl.fromTo("#${id} .capt",{opacity:0,y:10},{opacity:1,y:0,duration:0.1,ease:"power2.out",immediateRender:false},${t(t0)});`;
    g.forEach((w, j) => {
      const fin = g[j + 1] ? g[j + 1].start : Math.min(t1, w.end + 0.25);
      tl += `tl.fromTo("#${id} .cw${j}",{color:"${ajustes.color_texto}",scale:1},{color:"${ajustes.color_acento}",scale:1.06,duration:0.01,immediateRender:false},${t(Math.max(t0, w.start))});`;
      tl += `tl.fromTo("#${id} .cw${j}",{color:"${ajustes.color_acento}",scale:1.06},{color:"${ajustes.color_texto}",scale:1,duration:0.01,immediateRender:false},${t(Math.max(t0 + 0.02, fin))});`;
    });
  });
  const css = `
.capt{font-family:var(--fuente),sans-serif;font-weight:800;color:var(--texto);text-transform:var(--transformar);text-align:center;line-height:1.12;width:100%;
  text-shadow:0 0 3px rgba(0,0,0,.9),0 2px 6px rgba(0,0,0,.8),0 6px 18px rgba(0,0,0,.5);}
.capt .cw{display:inline-block;margin:0 .09em;}`;
  return { hosts, css, tl, frases: hosts.length };
}
