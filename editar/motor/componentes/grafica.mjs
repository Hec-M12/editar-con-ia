// GRAFICA — gráficas que se dibujan solas, sin fondo, encima del video.
//   barras  → barras que crecen una por una (valores y etiquetas opcionales)
//   linea   → una línea que sube o se desploma (direccion: sube | baja)
//   numero  → un número grande que cuenta hasta su valor (prefijo/sufijo: «$», «%», «x»)
//   anillo  → un anillo que se llena hasta un porcentaje, con el número adentro
// Números: SOLO los que la persona dice en el video. Nunca inventar datos.
import { esc } from "../lib/anim.mjs";

function puntosLinea(direccion, x0, x1, y0, y1, N = 120) {
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const onda = Math.sin(u * 17) * 0.035 + Math.sin(u * 6.1) * 0.03;
    const v = direccion === "baja"
      ? (u < 0.72 ? 0.42 + u * 0.5 + onda : 0.42 + 0.72 * 0.5 - ((u - 0.72) / 0.28) * 0.74)
      : 0.1 + u * 0.78 + onda;
    pts.push([+(x0 + u * (x1 - x0)).toFixed(1), +(y1 - Math.max(0.02, Math.min(1, v)) * (y1 - y0)).toFixed(1)]);
  }
  return pts;
}

export default {
  tipo: "grafica",
  categoria: "grafica",
  resumen: "Gráfica animada sin fondo: barras que crecen, línea que sube o baja, número que cuenta, anillo de porcentaje.",
  params: {
    forma: "barras | linea | numero | anillo",
    valores: "barras: lista de números (alturas relativas), ej. [2, 5, 9]",
    etiquetas: "barras: lista opcional de 1 palabra por barra",
    direccion: "linea: sube | baja",
    hasta: "numero/anillo: el número final (el que se dice en el video). Acá «hasta» es el número: para que salga antes o después, usá «duracion»",
    desde: "numero: desde dónde cuenta (default 0)",
    prefijo: "numero: texto antes, ej. «$» o «+»",
    sufijo: "numero: texto después, ej. «%», «x», « h»",
    etiqueta: "numero/anillo: 1-4 palabras debajo (opcional)",
  },
  minimo: 320, // px de ancho por debajo de los cuales avisa que queda chico
  durDefault: 3,
  aspecto: (el) => ({ barras: 1.5, linea: 1.6, numero: 1.6, anillo: 1 }[el.forma] || 1.5),
  build({ id, el, ajustes, M, z, t0, t1, escala }) {
    const forma = el.forma || "barras";
    const W = Math.round(z.w), H = Math.round(z.h);
    const tIn = t0 + 0.08;
    const tFin = Math.max(tIn + 0.7, t1 - 0.5);
    const sombra = `drop-shadow(0 0 ${Math.round(14 * escala)}px var(--acento-suave)) drop-shadow(0 12px 30px rgba(0,0,0,.5))`;
    const tamEt = Math.round(Math.min(84, 58 * ajustes.tamano_texto) * escala);
    const etiquetaHtml = el.etiqueta ? `<div class="et fit" data-max="${tamEt}" data-min="${Math.round(tamEt * 0.5)}" data-maxh="${Math.round(tamEt * 2.25)}">${esc(el.etiqueta)}</div>` : "";
    let html = "", css = "", tl = "";
    const sonidos = [];
    css += `#${id} .et{font-family:var(--fuente),sans-serif;font-weight:800;color:var(--texto);text-shadow:var(--sombra);text-transform:var(--transformar);text-align:center;white-space:normal;line-height:1.05;width:100%;margin-top:${Math.round(10 * escala)}px;}`;

    if (forma === "numero" || forma === "anillo") {
      const hasta = Number(el.hasta ?? el.porcentaje);
      if (!Number.isFinite(hasta)) throw new Error("falta «hasta» (el número que se dice en el video)");
      const desde = Number(el.desde ?? 0);
      const dec = Number.isInteger(el.decimales) ? el.decimales : (String(hasta).split(".")[1] || "").length;
      const pre = esc(el.prefijo || ""), suf = esc(el.sufijo ?? (forma === "anillo" ? "%" : ""));
      const tamNum = Math.round(Math.min(forma === "anillo" ? H * 0.26 : H * (el.etiqueta ? 0.62 : 0.8), 300 * escala) * ajustes.tamano_texto);
      const cuenta = `(function(){var o={v:${desde}},n=document.querySelector("#${id} .num-v");
        function pintar(){n.textContent=o.v.toLocaleString("es",{minimumFractionDigits:${dec},maximumFractionDigits:${dec}});}
        tl.set(o,{v:${desde},onUpdate:pintar},${M.t(t0)});
        tl.fromTo(o,{v:${desde}},{v:${hasta},duration:${M.t(Math.min(1.4, tFin - tIn))},ease:"power2.out",onUpdate:pintar,immediateRender:false},${M.t(tIn)});})();`;
      const num = `<div class="num fit" data-max="${tamNum}" data-min="${Math.round(tamNum * 0.45)}"><span class="pre">${pre}</span><span class="num-v">${desde}</span><span class="suf">${suf}</span></div>`;
      css += `#${id} .num{font-family:var(--fuente),sans-serif;font-weight:900;color:var(--acento);text-shadow:var(--sombra);line-height:1;text-align:center;white-space:nowrap;font-variant-numeric:tabular-nums;width:100%;}
#${id} .num .pre,#${id} .num .suf{color:var(--texto);font-size:.62em;}`;
      if (forma === "numero") {
        html = `<div class="g">${num}${etiquetaHtml}</div>`;
        tl += M.entrada(`#${id} .num`, t0, { tipo: "pop" });
      } else {
        const lado = Math.round(Math.min(W, H * (el.etiqueta ? 0.78 : 0.95)));
        const r = 42, L = 2 * Math.PI * r;
        const pct = Math.max(0, Math.min(100, hasta)) / 100;
        html = `<div class="g"><div class="anillo" style="width:${lado}px;height:${lado}px">
          <svg viewBox="0 0 100 100" width="${lado}" height="${lado}"><circle class="a-fondo" cx="50" cy="50" r="${r}"/><circle class="a-arco" cx="50" cy="50" r="${r}" transform="rotate(-90 50 50)"/></svg>
          <div class="a-num">${num}</div></div>${etiquetaHtml}</div>`;
        css += `#${id} .anillo{position:relative;filter:${sombra};}
#${id} .a-fondo{fill:none;stroke:rgba(255,255,255,.22);stroke-width:9;}
#${id} .a-arco{fill:none;stroke:var(--acento);stroke-width:9;stroke-linecap:round;stroke-dasharray:${L.toFixed(2)};stroke-dashoffset:${L.toFixed(2)};}
#${id} .a-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 18%;}`;
        tl += `tl.fromTo("#${id} .anillo",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:${M.t(M.dur)},ease:"${M.en.pop}"},${M.t(t0)});`;
        tl += `tl.fromTo("#${id} .a-arco",{strokeDashoffset:${L.toFixed(2)}},{strokeDashoffset:${(L * (1 - pct)).toFixed(2)},duration:${M.t(Math.min(1.4, tFin - tIn))},ease:"power2.out"},${M.t(tIn)});`;
      }
      tl += cuenta;
      const nombre = `${el.prefijo || ""}${hasta}${el.sufijo ?? (forma === "anillo" ? "%" : "")}`;
      sonidos.push(desde !== hasta
        ? { t: t0, tipo: "conteo", cuenta: [+tIn.toFixed(3), +(tIn + Math.min(1.4, tFin - tIn)).toFixed(3)], que: `el ${nombre}` }
        : { t: t0, tipo: "golpe", que: `el ${nombre}` });
      if (el.etiqueta) tl += M.entrada(`#${id} .et`, t0 + 0.3, { tipo: "sube" });
    } else if (forma === "barras") {
      const vals = (Array.isArray(el.valores) && el.valores.length ? el.valores : [3, 5, 7, 10]).map(Number).slice(0, 8);
      const max = Math.max(...vals, 1);
      const etiquetas = Array.isArray(el.etiquetas) ? el.etiquetas : [];
      const hEt = etiquetas.length ? Math.round(Math.min(64, 46 * ajustes.tamano_texto) * escala) : 0;
      const n = vals.length;
      const pad = Math.round(Math.min(W, H) * 0.05);
      const x0 = pad, x1 = W - pad, y0 = pad, y1 = H - pad - (hEt ? hEt * 1.5 : 0);
      const hueco = ((x1 - x0) * 0.24) / n;
      const ancho = ((x1 - x0) - hueco * (n - 1)) / n;
      let barras = "", textos = "";
      vals.forEach((v, k) => {
        const x = x0 + k * (ancho + hueco), h = Math.max(6, (y1 - y0) * (v / max)), y = y1 - h;
        barras += `<rect class="b b${k}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${ancho.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.round(ancho * 0.14)}"/>`;
        if (etiquetas[k]) textos += `<text class="bt" x="${(x + ancho / 2).toFixed(1)}" y="${(y1 + hEt * 1.15).toFixed(1)}" font-size="${hEt}">${esc(etiquetas[k])}</text>`;
      });
      html = `<div class="g"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" overflow="visible">
        <defs><linearGradient id="${id}-gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--acento);stop-opacity:1"/><stop offset="1" style="stop-color:var(--acento);stop-opacity:.55"/></linearGradient></defs>
        <line class="base" x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}"/>${barras}${textos}</svg></div>`;
      css += `#${id} svg{filter:${sombra};overflow:visible;}
#${id} .b{fill:url(#${id}-gr);}
#${id} .base{stroke:var(--texto);stroke-opacity:.5;stroke-width:${Math.max(3, Math.round(4 * escala))};stroke-linecap:round;}
#${id} .bt{fill:var(--texto);font-family:var(--fuente),sans-serif;font-weight:800;text-anchor:middle;}`;
      const paso = Math.max(0.12, (tFin - tIn - 0.4) / n);
      tl += `tl.fromTo("#${id} svg",{opacity:0},{opacity:1,duration:0.2},${M.t(t0)});`;
      sonidos.push({ t: t0, tipo: "whoosh", que: "entra la gráfica de barras" });
      vals.forEach((_, k) => {
        sonidos.push({ t: +(tIn + 0.1 + k * paso).toFixed(3), tipo: "pop", que: `barra ${k + 1}` });
        tl += `tl.fromTo("#${id} .b${k}",{scaleY:0,transformOrigin:"50% 100%"},{scaleY:1,transformOrigin:"50% 100%",duration:${M.t(M.dur * 0.9)},ease:"back.out(1.5)"},${M.t(tIn + 0.1 + k * paso)});`;
      });
      if (textos) tl += `tl.fromTo("#${id} .bt",{opacity:0,y:12},{opacity:1,y:0,duration:0.3,stagger:${M.t(paso)}},${M.t(tIn + 0.25)});`;
    } else if (forma === "linea") {
      const dir = el.direccion === "baja" ? "baja" : "sube";
      const pad = Math.round(Math.min(W, H) * 0.07);
      const x0 = pad, x1 = W - pad, y0 = pad, y1 = H - pad;
      const grosor = Math.max(8, Math.round(Math.min(W, H) * 0.03));
      const pts = puntosLinea(dir, x0, x1, y0, y1);
      const d = "M" + pts.map((p) => p.join(",")).join(" L");
      const area = `${d} L${x1},${y1} L${x0},${y1} Z`;
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(+(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])).toFixed(2));
      html = `<div class="g"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" overflow="visible">
        <defs><linearGradient id="${id}-gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--acento);stop-opacity:.5"/><stop offset="1" style="stop-color:var(--acento);stop-opacity:0"/></linearGradient>
        <clipPath id="${id}-clip"><rect class="clip-r" x="-40" y="-40" width="0" height="${H + 80}"/></clipPath></defs>
        <line class="base" x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}"/>
        <path class="area" d="${area}" fill="url(#${id}-gr)" clip-path="url(#${id}-clip)"/>
        <path class="lin" d="${d}" clip-path="url(#${id}-clip)"/>
        <circle class="dot" cx="${pts[0][0]}" cy="${pts[0][1]}" r="${Math.round(grosor * 1.2)}"/></svg></div>`;
      css += `#${id} svg{filter:${sombra};overflow:visible;}
#${id} .base{stroke:var(--texto);stroke-opacity:.5;stroke-width:${Math.max(3, Math.round(grosor * 0.35))};stroke-linecap:round;}
#${id} .lin{fill:none;stroke:var(--${dir === "baja" ? "texto" : "acento"});stroke-width:${grosor};stroke-linecap:round;stroke-linejoin:round;}
#${id} .dot{fill:var(--texto);stroke:var(--acento);stroke-width:${Math.round(grosor * 0.5)};}`;
      tl += `tl.fromTo("#${id} svg",{opacity:0},{opacity:1,duration:0.2},${M.t(t0)});`;
      tl += `(function(){var P=${JSON.stringify(pts)},C=${JSON.stringify(cum)},L=${cum[cum.length - 1]};
        var dot=document.querySelector("#${id} .dot"),clip=document.querySelector("#${id} .clip-r");
        function pos(p){var d=p*L,i=1;while(i<C.length-1&&C[i]<d)i++;var f=(d-C[i-1])/((C[i]-C[i-1])||1);return [P[i-1][0]+(P[i][0]-P[i-1][0])*f,P[i-1][1]+(P[i][1]-P[i-1][1])*f];}
        var o={p:0};function pintar(){var q=pos(o.p);dot.setAttribute("cx",q[0]);dot.setAttribute("cy",q[1]);clip.setAttribute("width",q[0]+42);}
        tl.set(o,{p:0,onUpdate:pintar},${M.t(t0)});
        tl.fromTo(o,{p:0},{p:1,duration:${M.t(tFin - tIn)},ease:"${dir === "baja" ? "power2.in" : "power1.inOut"}",onUpdate:pintar,immediateRender:false},${M.t(tIn)});})();`;
      sonidos.push({ t: t0, tipo: "whoosh", que: `entra la línea que ${dir}` });
      if (dir === "baja") sonidos.push({ t: +tFin.toFixed(3), tipo: "golpe", que: "la línea toca fondo" });
      if (dir === "baja") tl += `tl.fromTo("#${id} svg",{x:0},{x:${Math.round(9 * escala)},immediateRender:false,duration:0.05,yoyo:true,repeat:5,ease:"none"},${M.t(tFin)});`;
    } else {
      throw new Error(`forma «${forma}» no existe: barras | linea | numero | anillo`);
    }
    css += `#${id} .g{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;}`;
    tl += M.salida(`#${id} .g`, t1);
    return { html, css, tl, sonidos };
  },
};
