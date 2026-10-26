// Dónde puede ir cada animación sin tapar la cara, los subtítulos ni la interfaz de la app.

// Márgenes que tapa la interfaz de Reels/TikTok/Shorts (vertical) o que conviene dejar (horizontal).
export function zonaSegura(W, H) {
  if (H > W) return { arriba: Math.round(H * 0.09), abajo: Math.round(H * 0.8), izq: Math.round(W * 0.11), der: Math.round(W * 0.89) };
  return { arriba: Math.round(H * 0.07), abajo: Math.round(H * 0.93), izq: Math.round(W * 0.05), der: Math.round(W * 0.95) };
}

// Franja de subtítulos (px desde arriba): donde la app de la persona suele ponerlos.
// centro: altura del medio de la franja (0-1); lineas: 1 si los subtítulos son de 1 o 2 palabras;
// escala: tamano_subtitulos (subtítulos más grandes = franja más alta)
export function franjaCaptions(W, H, modo, { centro = null, lineas = 2, escala = 1 } = {}) {
  if (modo === "no") return null;
  if (H > W) {
    const alto = (lineas === 1 ? 0.085 : 0.125) * Math.max(1, escala);
    const c = Math.min(0.8 - alto / 2, Math.max(0.55, centro ?? 0.6775));
    return [Math.round(H * (c - alto / 2)), Math.round(H * (c + alto / 2))];
  }
  if (W > H) return [Math.round(H * 0.8), Math.round(H * 0.93)];
  return [Math.round(H * 0.72), Math.round(H * 0.88)];
}

// Descarta muestras raras (un póster o un logo confundido con una cara): lejos de la mediana local.
export function filtrarCaras(caras) {
  const m = (caras?.muestras || []).filter((x) => Array.isArray(x.caja));
  if (m.length < 3) return m;
  const med = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  return m.filter((x) => {
    const vec = m.filter((y) => Math.abs(y.t - x.t) <= 0.75);
    if (vec.length < 3) return true;
    const cx = med(vec.map((y) => y.caja[0] + y.caja[2] / 2));
    const cy = med(vec.map((y) => y.caja[1] + y.caja[3] / 2));
    const area = med(vec.map((y) => y.caja[2] * y.caja[3]));
    return Math.hypot(x.caja[0] + x.caja[2] / 2 - cx, x.caja[1] + x.caja[3] / 2 - cy) < 0.18 && x.caja[2] * x.caja[3] > area * 0.35;
  });
}

// transformar(t0, t1) → [{ s, ox, oy }]: los zooms del video activos en ese tramo (la cara crece con el zoom)
export function crearZonas({ W, H, caras, captions, transformar = null, ajustes = null }) {
  const SEG = zonaSegura(W, H);
  const franja = franjaCaptions(W, H, captions, ajustes ? { centro: ajustes.altura_subtitulos / 100, lineas: ajustes.palabras_por_subtitulo <= 2 ? 1 : 2, escala: ajustes.tamano_subtitulos || 1 } : {});
  const MARGEN = Math.round(Math.min(W, H) * 0.035);
  const advertencias = [];
  const filtradas = filtrarCaras(caras);
  const fija = Array.isArray(caras?.fija) ? caras.fija : null;

  // con zoom, la cara se agranda alrededor del origen del zoom: se usa la unión de la cara sin y con zoom
  function cajaCara(t0, t1) {
    const c = cajaCaraCruda(t0, t1);
    const ts = transformar ? transformar(t0, t1).filter((x) => x.s > 1.001) : [];
    if (!ts.length) return c;
    const out = { ...c, nucleo: { ...c.nucleo } };
    for (const { s, ox, oy } of ts) {
      const X = (x) => ox + (x - ox) * s, Y = (y) => oy + (y - oy) * s;
      out.x0 = Math.max(0, Math.min(out.x0, X(c.x0))); out.x1 = Math.min(W, Math.max(out.x1, X(c.x1)));
      out.y0 = Math.max(0, Math.min(out.y0, Y(c.y0))); out.y1 = Math.min(H, Math.max(out.y1, Y(c.y1)));
      out.nucleo.y0 = Math.max(0, Math.min(out.nucleo.y0, Y(c.nucleo.y0))); out.nucleo.y1 = Math.min(H, Math.max(out.nucleo.y1, Y(c.nucleo.y1)));
    }
    return out;
  }

  // caja de la cara entre t0 y t1 en px, con pelo arriba y cuello abajo; «nucleo» = ojos a mentón (nunca se tapa)
  function cajaCaraCruda(t0, t1) {
    let cajas = filtradas.filter((m) => m.t >= t0 - 0.5 && m.t <= t1 + 0.5).map((m) => m.caja);
    if (!cajas.length && fija) cajas = [fija];
    if (!cajas.length && filtradas.length) cajas = filtradas.map((m) => m.caja);
    if (!cajas.length) {
      // sin datos: la franja donde suele estar una cara en un video hablado
      return { x0: W * 0.25, x1: W * 0.75, y0: H * 0.18, y1: H * 0.55, nucleo: { y0: H * 0.24, y1: H * 0.5 }, detectada: false };
    }
    // la unión de todas las muestras del tramo (las falsas ya las sacó filtrarCaras): la cara nunca queda afuera
    const x0 = Math.min(...cajas.map((c) => c[0])), y0 = Math.min(...cajas.map((c) => c[1]));
    const x1 = Math.max(...cajas.map((c) => c[0] + c[2])), y1 = Math.max(...cajas.map((c) => c[1] + c[3]));
    // los márgenes (pelo arriba, cuello abajo) se miden con el alto de UNA cara, no con el de la unión:
    // si en el tramo el plano cambia, la unión es alta pero el pelo no crece
    const altos = cajas.map((c) => c[3]).sort((a, b) => a - b);
    const alto = altos[Math.floor(altos.length / 2)] * H;
    return {
      x0: x0 * W, x1: x1 * W,
      y0: Math.max(0, y0 * H - alto * 0.35),
      y1: Math.min(H, y1 * H + alto * 0.15),
      nucleo: { y0: y0 * H + alto * 0.08, y1: y1 * H },
      centro: [((x0 + x1) / 2) * W, ((y0 + y1) / 2) * H],
      detectada: true,
    };
  }

  const rect = (x0, y0, x1, y1) => ({ x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) });

  // Lugares libres alrededor de la cara. Se elige el que deja la animación más grande para su proporción.
  function candidatos(c, apretada) {
    const techo = franja ? franja[0] - MARGEN : SEG.abajo;
    const lista = [
      ["arriba", rect(SEG.izq, SEG.arriba, SEG.der, Math.min(c.y0 - MARGEN, techo))],
      ["abajo", rect(SEG.izq, c.y1 + MARGEN, SEG.der, techo)],
      ["izquierda", rect(SEG.izq, SEG.arriba, c.x0 - MARGEN, techo)],
      ["derecha", rect(c.x1 + MARGEN, SEG.arriba, SEG.der, techo)],
    ];
    if (franja) lista.push(["abajo", rect(SEG.izq, Math.max(c.y1 + MARGEN, franja[1] + MARGEN), SEG.der, SEG.abajo)]);
    return lista.filter(([, r]) => r.w > 40 && r.h > 40).map(([nombre, r]) => ({ nombre, r, apretada }));
  }

  const pisa = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 8 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 8;

  // zona: auto | arriba | abajo | izquierda | derecha · evitar: cajas de otras animaciones que están en pantalla al mismo tiempo
  // apretada (0.5-1): cuánto vale un lugar que pisa pelo o cuello (nunca ojos-boca-mentón) frente a uno que no;
  // sube cuando la persona pidió letras más grandes
  function lugar(t0, t1, { aspecto = 1.6, zona = "auto", id = "", minimo = 180, evitar = [], apretada = 0.5 } = {}) {
    const cara = cajaCara(t0, t1);
    let todos = candidatos(cara, false);
    // primer plano: si nada entra, se deja libre solo ojos-boca-mentón (puede pisar pelo o cuello)
    todos = todos.concat(candidatos({ ...cara, y0: cara.nucleo.y0, y1: cara.nucleo.y1 }, true));
    const puntuar = (x) => {
      const w = Math.min(x.r.w, x.r.h * aspecto);
      const choca = evitar.some((e) => pisa(e, x.r));
      return { ...x, visto: w, choca, puntaje: w * (w / aspecto) * (x.apretada ? apretada : 1) * (choca ? 0.02 : 1) };
    };
    let opciones = todos.map(puntuar);
    if (zona !== "auto") {
      const pedidas = opciones.filter((o) => o.nombre === zona);
      if (pedidas.length) opciones = pedidas;
      else advertencias.push(`${id}: no hay lugar «${zona}» sin tapar la cara; lo puse donde entra`);
    }
    opciones.sort((a, b) => b.puntaje - a.puntaje);
    const mejor = opciones[0];
    if (!mejor) {
      advertencias.push(`${id}: no hay lugar libre sin tapar la cara; va abajo`);
      return { ...rect(SEG.izq, SEG.abajo - 260, SEG.der, SEG.abajo), cara, lugar: "abajo" };
    }
    if (mejor.choca) advertencias.push(`${id}: se pisa con otra animación que está en pantalla al mismo tiempo; separalas en el tiempo`);
    if (mejor.visto < minimo) advertencias.push(`${id}: queda chico (${Math.round(mejor.visto)} px de ancho) porque casi no hay lugar sin tapar la cara: anclalo en un momento con el plano más abierto, acortalo con «duracion» (la cara se mueve menos) o probá otra «zona»`);
    // la animación ocupa el lugar libre; solo se recorta si sobra mucho para su proporción
    const r = mejor.r;
    const w = Math.round(Math.min(r.w, r.h * aspecto * 1.6));
    const h = Math.round(Math.min(r.h, (w / aspecto) * 1.6));
    return { x: Math.round(r.x + (r.w - w) / 2), y: Math.round(r.y + (r.h - h) / 2), w, h, cara, lugar: mejor.nombre };
  }

  return { lugar, cajaCara, cajaCaraCruda, advertencias, franja, seguro: SEG };
}
