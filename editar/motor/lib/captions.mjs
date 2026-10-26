// Subtítulos por palabra («captions: yo», lo normal): grupos cortos sincronizados con los tiempos de Whisper y la
// palabra que se está diciendo en el color de acento (resaltar_palabra). Van en la franja de subtítulos
// (altura_subtitulos) con la fuente y los colores de mi-estilo.md, y nunca tapan la cara ni una animación:
//   · si en ese tramo la cara baja hasta la franja → debajo del mentón; si abajo no entra, arriba de los ojos;
//   · si una animación pisa ese lugar → abajo o arriba de ella; si no hay lugar, encima con un fondo oscuro.
// Con «captions: app» no se dibujan, pero la franja queda libre (los pone la persona en su app); con «no», nada.
// Sombra con text-shadow y no con filter: decenas de filtros encima del video hacen lento el render.
import { esc } from "./anim.mjs";
import { luminancia } from "./estilo.mjs";

const MARGEN = 24;
const MIN_GRUPO = 0.3; // un subtítulo que dura menos que esto parpadea: se le suma la palabra que sigue
// palabras chicas que se leen pegadas a la que sigue («en 3», «y al final», «the best»): no cierran un subtítulo
const FUNCION = new Set(("a al el la lo los las un una unos unas y e o u de del en con por para que qué tu tus su sus mi mis te me se le les " +
  "no ni ya muy más mas como cómo es son si sí sin sobre entre hasta desde hacia pero porque cuando donde " +
  "the an of to in on at and or for with is it my your").split(" "));
// la palabra que se pide comentar va en MAYÚSCULA: «comentá EDITAR», «escribí LISTA», «comment GUIDE»
const PIDE = /^(coment[aá]|comentame|coment[aá]me|comenta|escrib[ií]|escribe|escribime|escr[ií]beme|pon[eé]|mand[aá]|mandame|comment|type)$/i;
const minus = (t) => t.toLowerCase();

// lo que se muestra de cada palabra: sin ¿? ni puntos ni comas (sí ¡!)
export function limpiarPalabra(t) {
  return String(t || "").trim().replace(/^[\s"'«»“”(\[¿?.,;:…-]+/, "").replace(/[\s"'«»“”)\]¿?.,;:…-]+$/, "");
}

// arranca una oración: Whisper a veces no pone puntos, pero sí la mayúscula («real | Cada corte»). Las siglas (IA) no cuentan.
const arrancaOracion = (w) => /^\p{Lu}\p{Ll}/u.test(w.crudo.replace(/^[¿¡"«“(]+/, ""));

export function agruparFrases(ws, { porGrupo = 3, maxLetras = 99, D = Infinity } = {}) {
  // porGrupo cuenta palabras con contenido: las chicas («y», «de», «una») van pegadas a la que sigue
  const chica = (w) => FUNCION.has(minus(w.texto));
  const contenido = (g) => g.ws.filter((x) => !chica(x)).length;
  const tope = porGrupo === 1 ? 3 : porGrupo + 2;
  const letras = (lista) => lista.reduce((n, x) => n + x.texto.length + 1, 0);
  const grupos = [];
  let g = null;
  ws.forEach((w, i) => {
    const prev = ws[i - 1];
    const pausa = prev ? w.start - prev.end : 0;
    const finOracion = !!prev && (/[.!?…;:]$/.test(prev.crudo) || arrancaOracion(w));
    const corta = !g
      || (contenido(g) >= porGrupo && w.start - g.t0 >= MIN_GRUPO)
      || g.ws.length >= tope
      || pausa > 0.3
      || finOracion
      || (/,$/.test(prev.crudo) && g.ws.length >= 2)
      || g.letras + w.texto.length > maxLetras
      || w.end - g.t0 > 1.8;
    if (corta) {
      let movidas = [];
      // las palabras chicas del final pasan al grupo que sigue («con una» | «sola cámara» → «con una sola cámara»),
      // salvo que ahí termine una oración o haya una pausa larga; el grupo que queda se ve al menos 0.25 s
      // (hasta que arranca la primera palabra que pasa al siguiente)
      if (g && !finOracion && pausa <= 0.8 && !/,$/.test(prev.crudo)) {
        let corte = g.ws.length;
        while (corte > 1 && chica(g.ws[corte - 1])) corte--;
        while (corte < g.ws.length && g.ws[corte].start - g.t0 < 0.25) corte++;
        movidas = g.ws.splice(corte);
        g.letras = letras(g.ws);
      }
      g = { t0: (movidas[0] || w).start, ws: movidas, letras: letras(movidas) };
      grupos.push(g);
    }
    g.ws.push(w);
    g.letras += w.texto.length + 1;
  });
  // cada grupo queda hasta que arranca el siguiente si la pausa es corta (sin parpadeo entre grupos), y nunca hay dos a la vez
  grupos.forEach((x, k) => {
    const ult = x.ws[x.ws.length - 1];
    const sig = grupos[k + 1];
    let fin = ult.end + 0.25;
    if (sig && sig.t0 - ult.end < 0.6) fin = sig.t0;
    fin = Math.max(fin, x.t0 + 0.25);
    if (sig) fin = Math.min(fin, sig.t0);
    x.t1 = +Math.min(D, fin).toFixed(3);
    x.t0 = +Math.max(0, x.t0 - 0.03).toFixed(3); // aparece un pelo antes de que suene (se lee a tiempo)
  });
  return grupos.filter((x) => x.t0 < D - 0.05 && x.t1 - x.t0 >= 0.1);
}

const choca = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// elementos: las animaciones ya ubicadas ({ id, t0, t1, caja }) · familia: la fuente ya cargada (con comillas)
export function construirCaptions({ palabras, ajustes, zonas, W, H, D, elementos = [], primerTrack = 200, familia = "sans-serif" }) {
  const vacio = { hosts: [], css: "", tl: "", frases: 0, grupos: [], advertencias: [] };
  const franja = zonas.franja;
  if (ajustes.captions !== "yo" || !franja || !palabras.length) return vacio;
  const advertencias = [];
  const SEG = zonas.seguro;
  const escala = Math.min(W, H) / 1080;
  const porGrupo = Math.max(1, Math.min(6, Math.round(ajustes.palabras_por_subtitulo || 3)));
  // de a una o dos palabras van más grandes
  const tam = Math.round((porGrupo <= 1 ? 84 : porGrupo === 2 ? 76 : 66) * (ajustes.tamano_subtitulos || 1) * escala);
  const anchoMax = Math.round(SEG.der - SEG.izq);
  const letraPx = tam * (ajustes.mayusculas_subtitulos ? 0.76 : 0.66); // ancho medio de una letra en una fuente gruesa (900)
  // de a 1 o 2 palabras, un solo renglón (la franja es de un renglón); de a 3 o más, hasta dos
  const renglonesMax = porGrupo <= 2 ? 1 : 2;
  const maxLetras = Math.max(6, Math.floor((anchoMax / letraPx) * renglonesMax));
  const ws = palabras
    .map((w) => ({ texto: limpiarPalabra(w.text), crudo: String(w.text || "").trim(), start: w.start, end: w.end }))
    .filter((w) => w.texto && w.start < D);
  ws.forEach((w, k) => { if (k > 0 && PIDE.test(ws[k - 1].texto)) { w.pide = true; w.texto = w.texto.toUpperCase(); } });
  const grupos = agruparFrases(ws, { porGrupo, maxLetras, D });
  const centroFranja = (franja[0] + franja[1]) / 2;
  const graficos = elementos.filter((r) => r.caja && !(r.caja.w >= W * 0.95 && r.caja.h >= H * 0.95)).map((r) => ({ ...r, a: r.t0 - 0.05, b: r.t1 + 0.1 }));

  const medidas = (g) => {
    const largo = g.ws.reduce((s, w) => s + w.texto.length, 0) + g.ws.length - 1;
    const renglones = Math.min(renglonesMax, Math.max(1, Math.ceil((largo * letraPx) / anchoMax)));
    return { w: Math.min(anchoMax, largo * letraPx + tam * 0.5), h: Math.round(renglones * tam * 1.12 + tam * 0.3), renglones };
  };
  const caja = (yc, m) => ({ x: (W - m.w) / 2, y: yc - m.h / 2, w: m.w, h: m.h });
  const entra = (yc, m) => yc - m.h / 2 >= SEG.arriba && yc + m.h / 2 <= SEG.abajo;
  const enPantalla = (g) => graficos.filter((r) => Math.min(r.b, g.t1) - Math.max(r.a, g.t0) > 0.05);

  const avisosCara = [], avisosFondo = [];
  for (const g of grupos) {
    const m = medidas(g);
    g.alto = m.h; g.ancho = Math.round(m.w);
    let yc = centroFranja, donde = "franja";
    // la cara: ojos, boca y mentón no se tapan nunca
    const c = zonas.cajaCara(g.t0, g.t1);
    const nucleo = c.detectada ? { x: c.x0, y: c.nucleo.y0 - MARGEN, w: c.x1 - c.x0, h: c.nucleo.y1 - c.nucleo.y0 + 2 * MARGEN } : null;
    if (nucleo && choca(caja(yc, m), nucleo)) {
      const abajo = nucleo.y + nucleo.h + m.h / 2 + 6;
      const arriba = nucleo.y - m.h / 2 - 6;
      if (entra(abajo, m)) { yc = abajo; donde = "debajo del mentón"; }
      else if (entra(arriba, m)) { yc = arriba; donde = "arriba de los ojos"; }
      else { yc = SEG.abajo - m.h / 2; donde = "lo más abajo posible"; avisosCara.push(g.t0); }
    }
    // las animaciones que están en pantalla en ese momento
    const otras = enPantalla(g);
    const encima = otras.filter((r) => choca(caja(yc, m), r.caja));
    if (encima.length) {
      const libre = (y) => entra(y, m) && !(nucleo && choca(caja(y, m), nucleo)) && !otras.some((r) => choca(caja(y, m), r.caja));
      const yAbajo = Math.max(...encima.map((r) => r.caja.y + r.caja.h)) + MARGEN + m.h / 2;
      const yArriba = Math.min(...encima.map((r) => r.caja.y)) - MARGEN - m.h / 2;
      if (libre(yAbajo)) { yc = yAbajo; donde = "debajo de la animación"; }
      else if (libre(yArriba)) { yc = yArriba; donde = "arriba de la animación"; }
      else { g.fondo = true; donde += " (encima de una animación, con fondo)"; avisosFondo.push(`${g.t0.toFixed(1)} s (${encima.map((r) => r.id).join("+")})`); }
    }
    g.y = Math.round(yc);
    g.donde = donde;
  }
  if (avisosCara.length) advertencias.push(`subtítulos: en ${avisosCara.length} tramo(s) la cara ocupa casi toda la pantalla y van lo más abajo posible (desde ${avisosCara[0].toFixed(1)} s): mirá la hoja de revisar`);
  if (avisosFondo.length) advertencias.push(`subtítulos: van encima de una animación, con fondo oscuro, en ${avisosFondo.join(", ")}: separá esa animación o movela de zona`);

  const blanco = ajustes.color_texto, acento = ajustes.color_acento; // hex: GSAP no entiende var(--x) en un color
  const borde = luminancia(blanco) > 0.4 ? "#000" : "#FFF";
  const grosor = Math.max(5, Math.round(tam * 0.18));
  const css = `
.cap .ct{max-width:${anchoMax}px;text-align:center;font-family:${familia},sans-serif;font-weight:900;font-size:${tam}px;line-height:1.12;color:${blanco};-webkit-text-stroke:${grosor}px ${borde};paint-order:stroke fill;text-shadow:0 ${Math.round(tam * 0.08)}px 0 rgba(0,0,0,.45);text-transform:${ajustes.mayusculas_subtitulos ? "uppercase" : "none"};letter-spacing:-0.005em;word-spacing:0.14em;}
.cap .cw{display:inline-block;}
.cap .cw-pide{text-transform:uppercase;}
.cap.fondo .ct{background:rgba(0,0,0,.62);border-radius:${Math.round(22 * escala)}px;padding:.04em .34em .1em;}`;
  const resaltar = ajustes.resaltar_palabra !== false;
  const t = (x) => +Number(x).toFixed(3);
  const hosts = [];
  let tl = "";
  grupos.forEach((g, k) => {
    const id = `cap${k}`;
    const top = Math.round(g.y - g.alto / 2);
    const spans = g.ws.map((w, j) => `<span class="cw w${j}${w.pide ? " cw-pide" : ""}">${esc(w.texto)}</span>`).join(" ");
    hosts.push(`<div id="${id}" class="host clip cap${g.fondo ? " fondo" : ""}" data-start="${t(g.t0)}" data-duration="${t(g.t1 - g.t0)}" data-track-index="${primerTrack + k}" style="left:${SEG.izq}px;top:${top}px;width:${anchoMax}px;height:${g.alto}px;z-index:${500 + k};"><div class="cont"><div class="ct">${spans}</div></div></div>`);
    tl += ajustes.energia === "calma"
      ? `tl.fromTo("#${id} .ct",{opacity:0,y:8},{opacity:1,y:0,duration:0.12,ease:"power2.out",immediateRender:false},${t(g.t0)});`
      : `tl.fromTo("#${id} .ct",{opacity:0,scale:0.86},{opacity:1,scale:1,duration:0.1,ease:"power2.out",immediateRender:false},${t(g.t0)});`;
    if (resaltar && g.ws.length > 1) {
      g.ws.forEach((w, j) => {
        const desde = Math.max(g.t0, w.start);
        tl += `tl.set("#${id} .w${j}",{color:"${acento}"},${t(desde)});`;
        if (j < g.ws.length - 1) tl += `tl.set("#${id} .w${j}",{color:"${blanco}"},${t(Math.max(desde + 0.02, g.ws[j + 1].start))});`;
      });
    }
    tl += "\n";
  });
  return {
    hosts, css, tl, frases: hosts.length, advertencias,
    grupos: grupos.map((g) => ({ t0: g.t0, t1: g.t1, texto: g.ws.map((w) => w.texto).join(" "), y: g.y, alto: g.alto, ancho: g.ancho, donde: g.donde, fondo: !!g.fondo })),
  };
}
