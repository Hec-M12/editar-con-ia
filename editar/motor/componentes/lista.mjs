// LISTA — 2 a 5 ítems cortos que aparecen uno por uno, cada uno cuando se nombra (para «son cuatro: …»).
import { esc } from "../lib/anim.mjs";
import { ICONOS } from "../lib/iconos.mjs";

export default {
  tipo: "lista",
  categoria: "texto",
  resumen: "2-5 ítems cortos que aparecen uno por uno, cada uno cuando se nombra, con un ícono o número al lado.",
  params: {
    items: "lista de { texto, ancla } (ancla = la frase donde entra ese ítem) o de textos sueltos",
    marca: "check (default) | numero | flecha",
    titulo: "opcional, 1-3 palabras arriba",
  },
  minimo: 380, // px de ancho por debajo de los cuales avisa que queda chico
  durDefault: 6,
  aspecto: (el) => Math.max(0.9, 2.2 - 0.25 * (el.items?.length || 3)),
  build({ id, el, ajustes, M, z, t0, t1, resolver, escala }) {
    const items = (el.items || []).map((x) => (typeof x === "string" ? { texto: x } : x)).slice(0, 6);
    if (items.length < 2) throw new Error("una lista necesita al menos 2 ítems");
    const n = items.length;
    const filas = n + (el.titulo ? 1 : 0);
    const tam = Math.round(Math.min((z.h / filas) * 0.62, 92 * escala) * ajustes.tamano_texto);
    const marca = el.marca || "check";
    const icon = (k) => {
      if (marca === "numero") return `<span class="mk num">${k + 1}</span>`;
      const ic = ICONOS[marca === "flecha" ? "flecha" : "check"];
      const d = marca === "flecha" ? ic.trazos.join(" ") : ic.trazos[1];
      return `<svg class="mk" viewBox="0 0 100 100" width="${Math.round(tam * 0.95)}" height="${Math.round(tam * 0.95)}"><path d="${d}" pathLength="1"/></svg>`;
    };
    const titulo = el.titulo ? `<div class="li-t">${esc(el.titulo)}</div>` : "";
    const filasHtml = items.map((it, k) => `<div class="li li${k}">${icon(k)}<span class="li-x">${esc(it.texto)}</span></div>`).join("");
    const html = `<div class="lw" style="--tam:${tam}px">${titulo}${filasHtml}</div>`;
    const css = `
#${id} .lw{display:flex;flex-direction:column;align-items:flex-start;gap:${Math.round(tam * 0.32)}px;font-family:var(--fuente),sans-serif;}
#${id} .li-t{font-weight:900;font-size:${Math.round(tam * 0.8)}px;color:var(--acento);text-shadow:var(--sombra);text-transform:var(--transformar);}
#${id} .li{display:flex;align-items:center;gap:${Math.round(tam * 0.35)}px;font-weight:800;font-size:var(--tam);color:var(--texto);text-shadow:var(--sombra);text-transform:var(--transformar);white-space:nowrap;line-height:1.05;}
#${id} .mk{flex:none;overflow:visible;filter:drop-shadow(0 4px 12px rgba(0,0,0,.5));}
#${id} .mk path{fill:none;stroke:var(--acento);stroke-width:13;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1;}
#${id} .mk.num{display:inline-flex;align-items:center;justify-content:center;width:${Math.round(tam * 1.05)}px;height:${Math.round(tam * 1.05)}px;border-radius:50%;background:var(--acento);color:var(--sobre-acento);font-size:${Math.round(tam * 0.62)}px;font-weight:900;text-shadow:none;}`;
    let tl = "";
    if (el.titulo) tl += M.entrada(`#${id} .li-t`, t0, { tipo: "sube" });
    let previo = t0 + (el.titulo ? 0.3 : 0);
    const reparto = (t1 - 0.8 - previo) / n;
    items.forEach((it, k) => {
      let at = it.ancla ? resolver({ ancla: it.ancla, buscar_desde: Math.max(0, t0 - 0.5) }, null, `${id}.items[${k}]`) : null;
      if (at === null || at === undefined) at = previo + (k === 0 ? 0 : reparto);
      at = Math.max(at, previo);
      previo = at;
      tl += `tl.fromTo("#${id} .li${k}",{opacity:0,x:${-Math.round(40 * escala)}},{opacity:1,x:0,duration:${M.t(M.dur)},ease:"${M.en.curva}"},${M.t(at)});`;
      if (marca === "numero") tl += `tl.fromTo("#${id} .li${k} .mk",{scale:0.4},{scale:1,duration:${M.t(M.dur)},ease:"${M.en.pop}"},${M.t(at)});`;
      else tl += `tl.fromTo("#${id} .li${k} .mk path",{strokeDashoffset:1},{strokeDashoffset:0,duration:0.35,ease:"power2.out"},${M.t(at + 0.1)});`;
    });
    tl += M.salida(`#${id} .lw`, t1);
    return { html, css, tl };
  },
};
