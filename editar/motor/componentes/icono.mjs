// ICONO — un ícono de línea que se dibuja solo, grande, sin fondo. Con «etiqueta» lleva 1-3 palabras abajo.
// Con «emoji» muestra un emoji grande en vez del ícono (en Linux puede no haber fuente de emojis).
import { ICONOS, NOMBRES_ICONOS } from "../lib/iconos.mjs";
import { esc } from "../lib/anim.mjs";

export default {
  tipo: "icono",
  categoria: "icono",
  resumen: `Ícono que se dibuja solo, grande y sin fondo. Hay: ${NOMBRES_ICONOS.join(", ")}. O un emoji.`,
  params: {
    icono: NOMBRES_ICONOS.join(" | "),
    emoji: "opcional, en vez de icono: un emoji (ej. «🔥»)",
    etiqueta: "opcional: 1-3 palabras debajo (ej. el nombre de lo que se nombra)",
    color: "acento (default) | texto",
  },
  minimo: 220, // px de ancho por debajo de los cuales avisa que queda chico
  durDefault: 2.2,
  aspecto: (el) => (el.etiqueta ? 0.72 : 1), // con etiqueta es más alto que ancho: ícono arriba, 1-2 líneas abajo
  build({ id, el, ajustes, M, z, t0, t1, escala }) {
    const tieneEtiqueta = !!el.etiqueta;
    const alto = Math.round(z.h);
    const lado = Math.round(Math.min(z.w * 0.8, (tieneEtiqueta ? alto * 0.68 : alto * 0.92), 420 * escala));
    const color = el.color === "texto" ? "var(--texto)" : "var(--acento)";
    const tamEtiqueta = Math.round(Math.min(96, 64 * ajustes.tamano_texto) * escala);
    let cuerpo, tl = "", css = "";
    if (el.emoji) {
      cuerpo = `<div class="emo" style="font-size:${Math.round(lado * 0.82)}px;line-height:1">${esc(el.emoji)}</div>`;
      tl += `tl.fromTo("#${id} .emo",{opacity:0,scale:0.3,rotation:-12},{opacity:1,scale:1,rotation:0,duration:${M.t(M.dur * 1.1)},ease:"back.out(2.6)"},${M.t(t0)});`;
      tl += `tl.to("#${id} .emo",{scale:1.08,duration:0.18,yoyo:true,repeat:1,ease:"sine.inOut"},${M.t(t0 + M.dur + 0.3)});`;
      css += `#${id} .emo{filter:drop-shadow(0 12px 28px rgba(0,0,0,.45));}`;
    } else {
      const ic = ICONOS[el.icono];
      if (!ic) throw new Error(`ícono «${el.icono}» no existe. Hay: ${NOMBRES_ICONOS.join(", ")}`);
      const grosor = 6.5;
      const trazos = ic.trazos.map((d, k) => `<path class="tr t${k}" d="${d}" pathLength="1"/>`).join("");
      const rellenos = ic.relleno ? ic.trazos.map((d) => `<path class="rl" d="${d}"/>`).join("") : "";
      cuerpo = `<svg class="ic" viewBox="-6 -6 112 112" width="${lado}" height="${lado}">${rellenos}${trazos}</svg>`;
      css += `
#${id} .ic{overflow:visible;filter:drop-shadow(0 0 ${Math.round(14 * escala)}px var(--acento-suave)) drop-shadow(0 10px 26px rgba(0,0,0,.5));}
#${id} .tr{fill:none;stroke:${color};stroke-width:${grosor};stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1;}
#${id} .rl{fill:${color};opacity:0;}
`;
      // se dibuja trazo por trazo
      const dibujo = Math.max(0.35, Math.min(0.9, (t1 - t0) * 0.35));
      const paso = dibujo / ic.trazos.length;
      tl += `tl.fromTo("#${id} .ic",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${M.t(M.dur)},ease:"${M.en.pop}"},${M.t(t0)});`;
      ic.trazos.forEach((_, k) => {
        tl += `tl.fromTo("#${id} .t${k}",{strokeDashoffset:1},{strokeDashoffset:0,duration:${M.t(paso * 1.4)},ease:"power2.out"},${M.t(t0 + 0.05 + k * paso)});`;
      });
      const fin = t0 + 0.1 + dibujo;
      if (ic.relleno) tl += `tl.fromTo("#${id} .rl",{opacity:0},{opacity:0.9,duration:0.25,immediateRender:false},${M.t(fin)});`;
      const quedan = Math.max(0.3, t1 - fin - 0.4);
      switch (ic.final) {
        case "gira":
          tl += `tl.fromTo("#${id} .t1",{rotation:0},{rotation:360,svgOrigin:"50 50",immediateRender:false,duration:${M.t(quedan)},ease:"none"},${M.t(fin)});`;
          break;
        case "sacude":
          tl += `tl.fromTo("#${id} .ic",{x:0},{x:${Math.round(12 * escala)},immediateRender:false,duration:0.06,yoyo:true,repeat:5,ease:"none"},${M.t(fin)});`;
          break;
        case "late":
          tl += `tl.to("#${id} .ic",{scale:1.12,duration:0.2,yoyo:true,repeat:${Math.max(1, Math.floor(quedan / 0.4)) * 2 - 1},ease:"sine.inOut"},${M.t(fin)});`;
          break;
        case "sube":
          tl += `tl.to("#${id} .ic",{y:${-Math.round(18 * escala)},duration:0.35,ease:"power2.out"},${M.t(fin)});`;
          break;
        case "baja":
          tl += `tl.to("#${id} .ic",{y:${Math.round(18 * escala)},duration:0.35,ease:"power2.in"},${M.t(fin)});`;
          break;
        case "empuja":
          tl += `tl.to("#${id} .ic",{x:${Math.round(22 * escala)},duration:0.25,yoyo:true,repeat:1,ease:"power2.out"},${M.t(fin)});`;
          break;
        case "salta":
          tl += `tl.to("#${id} .ic",{y:${-Math.round(26 * escala)},duration:0.18,yoyo:true,repeat:1,ease:"power2.out"},${M.t(fin)});`;
          break;
        case "onda":
          ic.trazos.forEach((_, k) => {
            tl += `tl.to("#${id} .t${k}",{scaleY:${(0.45 + ((k * 37) % 50) / 100).toFixed(2)},transformOrigin:"50% 50%",duration:0.16,yoyo:true,repeat:${Math.max(1, Math.floor(quedan / 0.32)) * 2 - 1},ease:"sine.inOut"},${M.t(fin + k * 0.03)});`;
          });
          break;
        case "corta":
          tl += `tl.fromTo("#${id} .t2",{rotation:0},{rotation:-9,svgOrigin:"58 56",immediateRender:false,duration:0.12,yoyo:true,repeat:3,ease:"power1.inOut"},${M.t(fin)});`;
          tl += `tl.fromTo("#${id} .t3",{rotation:0},{rotation:9,svgOrigin:"58 44",immediateRender:false,duration:0.12,yoyo:true,repeat:3,ease:"power1.inOut"},${M.t(fin)});`;
          break;
        case "destello":
          tl += `tl.to("#${id} .ic",{scale:1.14,duration:0.16,yoyo:true,repeat:1,ease:"power2.out"},${M.t(fin)});`;
          break;
        case "pulso":
        default:
          tl += `tl.to("#${id} .ic",{scale:1.08,duration:0.18,yoyo:true,repeat:1,ease:"sine.inOut"},${M.t(fin)});`;
      }
    }
    const etiqueta = tieneEtiqueta ? `<div class="et fit" data-max="${tamEtiqueta}" data-min="${Math.round(tamEtiqueta * 0.5)}" data-maxh="${Math.round(tamEtiqueta * 2.25)}">${esc(el.etiqueta)}</div>` : "";
    if (tieneEtiqueta) {
      css += `#${id} .et{font-family:var(--fuente),sans-serif;font-weight:800;color:var(--texto);text-shadow:var(--sombra);text-transform:var(--transformar);text-align:center;margin-top:${Math.round(14 * escala)}px;white-space:normal;line-height:1.05;width:100%;}`;
      tl += M.entrada(`#${id} .et`, t0 + 0.25, { tipo: ajustes.entrada === "maquina" ? "sube" : ajustes.entrada });
    }
    const html = `<div class="ico-w">${cuerpo}${etiqueta}</div>`;
    css += `#${id} .ico-w{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;}`;
    tl += M.salida(`#${id} .ico-w`, t1);
    return { html, css, tl };
  },
};
