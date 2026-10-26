// armar — convierte storyboard.json en la composición de HyperFrames: código (HTML + GSAP) que se
// vuelve animación encima del video. Claude escribe el storyboard; este paso lo arma.
//
//   node editar.mjs armar <video>
//
// Lee: storyboard.json, mi-estilo.md, transcript-cortado.json, caras.json y cortes.json
// Escribe: edicion/<nombre>/public/ (index.html + video + gsap + fuentes) y armado.json (qué quedó dónde)
import { existsSync, mkdirSync, rmSync, writeFileSync, copyFileSync, linkSync, readFileSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { rutas, leerJson, ffprobe, MOTOR, duracion, mmss } from "../lib/comun.mjs";
import { cargarEstilo, buscarEstilo, cssVariables, SEPARACION } from "../lib/estilo.mjs";
import { cargarPalabras, buscarFrase } from "../lib/transcript.mjs";
import { crearZonas } from "../lib/zonas.mjs";
import { motion } from "../lib/anim.mjs";
import { prepararFuente } from "../lib/fuentes.mjs";
import { construirCaptions } from "../lib/captions.mjs";
import texto from "../componentes/texto.mjs";
import icono from "../componentes/icono.mjs";
import grafica from "../componentes/grafica.mjs";
import lista from "../componentes/lista.mjs";
import objeto3d from "../componentes/objeto3d.mjs";
import zoom from "../componentes/zoom.mjs";
import imagen from "../componentes/imagen.mjs";
import custom from "../componentes/custom.mjs";

export const COMPONENTES = { texto, icono, grafica, lista, objeto3d, zoom, imagen, custom };
const ALIAS = { "3d": "objeto3d", objeto: "objeto3d", grafico: "grafica", "gráfica": "grafica", "gráfico": "grafica", "ícono": "icono", palabra: "texto", frase: "texto", foto: "imagen", logo: "imagen" };
const SIEMPRE = new Set(["zoom", "custom"]);

function enlazarOCopiar(src, dst) {
  try { linkSync(src, dst); } catch { copyFileSync(src, dst); }
}

export async function armar(video, opciones = {}) {
  const R = rutas(video);
  const meta = leerJson(R.meta, null);
  if (!meta) throw new Error("Falta preparar el video primero: node editar.mjs preparar <video>");
  if (!existsSync(R.storyboard)) throw new Error(`Falta ${R.storyboard} (lo escribe Claude, ver referencia/storyboard.md)`);
  const usaCortado = existsSync(R.cortado);
  const videoBase = usaCortado ? R.cortado : R.fuente;
  const palabras = cargarPalabras(usaCortado ? R.transcriptCortado : R.transcript);
  const D = +duracion(videoBase).toFixed(3);
  const W = meta.ancho, H = meta.alto;
  const est = cargarEstilo(buscarEstilo(R.proyecto, opciones.estilo));
  const ajustes = est.ajustes;
  const caras = leerJson(R.caras, { muestras: [] });
  const cortes = usaCortado ? leerJson(R.cortes, { puntos: [] }) : { puntos: [] };
  let sb;
  try { sb = JSON.parse(readFileSync(R.storyboard, "utf8")); } catch (e) { throw new Error(`storyboard.json no es JSON válido: ${e.message}`); }
  const elementos = Array.isArray(sb) ? sb : sb.elementos || [];
  const advertencias = [];
  const errores = [];
  if (!est.existe) advertencias.push("no encontré mi-estilo.md: usé el estilo por defecto (preguntá el estilo primero)");
  const zonasCrudas = crearZonas({ W, H, caras, captions: ajustes.captions, ajustes });
  const M = motion(ajustes);
  const escala = Math.min(W, H) / 1080;

  // tiempo de una frase del transcript (con 0.12 s de adelanto: la animación entra justo antes de la palabra)
  const buscar = (frase, { desde = 0, ocurrencia = 1 } = {}) => buscarFrase(palabras, frase, { desde, ocurrencia });
  const resolver = (obj, def, id) => {
    if (typeof obj.en === "number") return obj.en;
    if (!obj.ancla) return def;
    const m = buscar(obj.ancla, { desde: obj.buscar_desde ?? 0, ocurrencia: obj.ocurrencia ?? 1 });
    if (!m) {
      errores.push(`${id}: no encuentro «${obj.ancla}» en el transcript cortado (copiá la frase tal cual de transcript-cortado.txt)`);
      return null;
    }
    return Math.max(0, m.start - 0.12);
  };

  const imagenes = {
    lista: [],
    info(archivo) {
      const src = resolve(R.proyecto, archivo);
      if (!existsSync(src)) throw new Error(`no encuentro la imagen ${archivo}`);
      const s = ffprobe(src, ["-show_entries", "stream=width,height"]).streams[0];
      return { src, ancho: s.width, alto: s.height, aspecto: s.width / s.height };
    },
    registrar(archivo) {
      const i = this.info(archivo);
      const nombre = `img-${this.lista.length + 1}${extname(i.src).toLowerCase()}`;
      this.lista.push({ src: i.src, nombre });
      return { publico: `img/${nombre}`, ancho: i.ancho, alto: i.alto };
    },
  };

  // 1. tiempos
  const planeados = [];
  elementos.forEach((el0, k) => {
    const el = { ...el0 };
    const id = String(el.id || `e${k + 1}`).replace(/[^a-zA-Z0-9_-]/g, "") || `e${k + 1}`;
    const tipo = ALIAS[String(el.tipo || "").toLowerCase()] || String(el.tipo || "").toLowerCase();
    const comp = COMPONENTES[tipo];
    if (!comp) { errores.push(`${id}: tipo «${el.tipo}» no existe (hay: ${Object.keys(COMPONENTES).join(", ")})`); return; }
    if (!el.porque) advertencias.push(`${id}: falta «porque» (qué dice la persona ahí que justifica la animación)`);
    if (!SIEMPRE.has(tipo) && !ajustes.tipos.includes(comp.categoria)) advertencias.push(`${id}: es «${comp.categoria}» y tu estilo pide solo ${ajustes.tipos.join(", ")}`);
    const t0 = resolver(el, null, id);
    if (t0 === null) { if (!el.ancla && typeof el.en !== "number") errores.push(`${id}: falta «ancla» (la frase donde entra)`); return; }
    let t1 = null;
    if (el.hasta) {
      const m = buscar(el.hasta, { desde: t0 });
      if (m) t1 = m.end + 0.3;
      else errores.push(`${id}: no encuentro «${el.hasta}» (hasta) después de ${t0.toFixed(1)} s`);
    }
    if (t1 === null && tipo === "lista" && Array.isArray(el.items)) {
      const ts = el.items.map((it, j) => (typeof it === "object" && it.ancla ? resolver({ ancla: it.ancla, buscar_desde: Math.max(0, t0 - 0.5) }, null, `${id}.items[${j}]`) : null)).filter((x) => x !== null);
      if (ts.length) t1 = Math.max(...ts) + 1.8;
    }
    if (t1 === null) t1 = t0 + (Number(el.duracion) || (!comp.sinCaja && ajustes.duracion_animaciones) || comp.durDefault);
    t1 = Math.min(t1, D - 0.05);
    if (t1 - t0 < 0.6) { advertencias.push(`${id}: dura ${(t1 - t0).toFixed(2)} s, muy poco para leerlo`); t1 = Math.min(D - 0.02, t0 + 0.6); }
    planeados.push({ id, tipo, comp, el, t0: +t0.toFixed(3), t1: +t1.toFixed(3), orden: k });
  });
  planeados.sort((a, b) => a.t0 - b.t0);
  // si una animación entra justo cuando la anterior está saliendo, la anterior se va un poco antes y la nueva
  // toma su lugar (como en los videos de ritmo rápido) en vez de irse a un rincón más chico
  const enCaja = planeados.filter((p) => !p.comp.sinCaja);
  for (let i = 1; i < enCaja.length; i++) {
    const prev = enCaja[i - 1], p = enCaja[i];
    if (!prev.el.hasta && !prev.el.duracion && p.t0 < prev.t1 && prev.t1 - p.t0 <= 0.5 && p.t0 - prev.t0 >= 0.6) prev.t1 = +(p.t0 - 0.05).toFixed(3);
  }

  // 2. densidad: lo que pidió la persona (pocas / normal / muchas)
  const sep = SEPARACION[ajustes.densidad];
  const conCaja = planeados.filter((p) => !p.comp.sinCaja);
  for (let i = 1; i < conCaja.length; i++) {
    const gap = conCaja[i].t0 - conCaja[i - 1].t0;
    if (gap < sep * 0.5) advertencias.push(`${conCaja[i].id}: entra ${gap.toFixed(1)} s después de ${conCaja[i - 1].id}; con densidad «${ajustes.densidad}» van ~${sep} s entre animaciones`);
  }
  const esperadas = Math.max(1, Math.round(D / sep));
  if (conCaja.length > esperadas * 1.6) advertencias.push(`hay ${conCaja.length} animaciones; para «${ajustes.densidad}» en ${D.toFixed(0)} s rondan ${esperadas}`);

  // 3. el video: zoom leve alternado en cada corte (disimula el salto) + los zooms del storyboard.
  // Cada zoom se centra en la cara de ese momento, y las animaciones se ubican sabiendo cuánto crece la cara.
  const resueltos = [];
  const zooms = [];
  for (const p of planeados.filter((x) => x.comp.sinCaja)) {
    try {
      const r = p.comp.build({ id: p.id, el: p.el, ajustes, M, z: null, t0: p.t0, t1: p.t1, palabras, escala, resolver, imagenes });
      (r.video || []).forEach((v) => zooms.push({ ...v, id: p.id }));
      resueltos.push({ id: p.id, tipo: p.tipo, t0: p.t0, t1: p.t1, lugar: "video", porque: p.el.porque || "" });
    } catch (e) { errores.push(`${p.id}: ${e.message}`); }
  }
  const T = (x) => +Number(x).toFixed(3);
  const px = (o) => `${Math.round(o[0])}px ${Math.round(o[1])}px`;
  const centroCara = (a, b) => {
    const c = zonasCrudas.cajaCaraCruda(a, b);
    return c.detectada ? [(c.x0 + c.x1) / 2, (c.nucleo.y0 + c.nucleo.y1) / 2] : [W / 2, H * 0.4];
  };
  let puntos = ajustes.zoom_en_cortes ? [...(cortes.puntos || [])] : [];
  // zoom_cada: saltos de zoom cada N segundos aunque no haya cortes (para copiar una referencia que corta mucho).
  // Caen justo antes de que arranque una frase, nunca a mitad de palabra.
  if (ajustes.zoom_cada > 0 && palabras.length) {
    const cada = Math.max(1, ajustes.zoom_cada);
    const arranques = palabras.filter((w, i) => i > 0 && (w.start - palabras[i - 1].end > 0.12 || /[.,;:!?…]$/.test(palabras[i - 1].text))).map((w) => w.start - 0.04);
    const todas = palabras.slice(1).map((w) => w.start - 0.04);
    const cercano = (lista, t, desde) => lista.filter((x) => x - desde >= cada * 0.6 && x < D - 0.8).reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a), Infinity);
    const extra = [];
    let ultimo = 0;
    for (let t = cada; t < D - 0.8;) {
      let c = cercano(arranques, t, ultimo);
      if (!isFinite(c) || Math.abs(c - t) > cada * 0.45) c = cercano(todas, t, ultimo);
      if (!isFinite(c)) break;
      extra.push(+c.toFixed(3));
      ultimo = c;
      t = c + cada;
    }
    puntos = [...puntos, ...extra].sort((a, b) => a - b).filter((x, i, arr) => i === 0 || x - arr[i - 1] > 0.5);
  }
  const bordes = [0, ...puntos, D];
  const tramos = bordes.slice(0, -1).map((a, k) => ({ a, b: bordes[k + 1], s: k % 2 ? ajustes.zoom_escala : 1, o: centroCara(a, bordes[k + 1]) }));
  const tramoEn = (t) => tramos.find((x) => t >= x.a - 1e-6 && t < x.b) || tramos[tramos.length - 1];
  zooms.sort((a, b) => a.t0 - b.t0);
  const zoomsOk = [];
  for (const zz of zooms) {
    const prev = zoomsOk[zoomsOk.length - 1];
    if (prev && zz.t0 < prev.t1 + 0.2) { advertencias.push(`${zz.id}: se pisa con el zoom ${prev.id}; lo saqué`); continue; }
    if (zz.t1 - zz.t0 < 0.5) { advertencias.push(`${zz.id}: zoom muy corto`); continue; }
    const tr = tramoEn(zz.t0);
    zz.b0 = tr.s;
    zz.o = tr.s > 1 ? tr.o : centroCara(zz.t0, zz.t1);
    zz.top = T(tr.s * zz.escala);
    zoomsOk.push(zz);
  }
  let vtl = `tl.set("#vz",{scale:1,transformOrigin:"${px(tramos[0].o)}"},0);`;
  for (const tr of tramos.slice(1)) {
    if (zoomsOk.some((zz) => tr.a >= zz.t0 - 0.05 && tr.a <= zz.t1)) continue;
    vtl += `tl.set("#vz",{scale:${tr.s},transformOrigin:"${px(tr.o)}"},${T(tr.a)});`;
  }
  for (const zz of zoomsOk) {
    const fin = tramoEn(zz.t1);
    const dIn = zz.forma === "golpe" ? 0.14 : Math.max(0.3, zz.t1 - zz.t0 - 0.3);
    if (zz.b0 === 1) vtl += `tl.set("#vz",{transformOrigin:"${px(zz.o)}"},${T(zz.t0)});`;
    vtl += `tl.fromTo("#vz",{scale:${zz.b0}},{scale:${zz.top},duration:${T(dIn)},ease:"${zz.forma === "golpe" ? "power3.out" : "sine.inOut"}",immediateRender:false},${T(zz.t0)});`;
    vtl += `tl.fromTo("#vz",{scale:${zz.top}},{scale:${fin.s},duration:0.3,ease:"power2.inOut",immediateRender:false},${T(zz.t1 - 0.3)});`;
    vtl += `tl.set("#vz",{scale:${fin.s},transformOrigin:"${px(fin.s > 1 ? fin.o : zz.o)}"},${T(zz.t1)});`;
  }
  const transformar = (a, b) => [
    ...tramos.filter((x) => x.s > 1 && x.b > a && x.a < b).map((x) => ({ s: x.s, ox: x.o[0], oy: x.o[1] })),
    ...zoomsOk.filter((zz) => zz.t1 > a && zz.t0 < b).map((zz) => ({ s: zz.top, ox: zz.o[0], oy: zz.o[1] })),
  ];
  const zonas = crearZonas({ W, H, caras, captions: ajustes.captions, transformar, ajustes });

  // 4. lugar y código de cada animación
  const hosts = [];
  let css = "", tl = "", modulos = [], vendor = new Set();
  const enPantalla = [];
  planeados.forEach((p, k) => {
    const { id, tipo, comp, el, t0, t1 } = p;
    try {
      if (comp.sinCaja) return;
      const info = tipo === "imagen" && el.archivo ? imagenes.info(el.archivo) : null;
      const aspecto = comp.aspecto ? comp.aspecto(el, info) : 1.6;
      const evitar = enPantalla.filter((o) => o.t1 > t0 && o.t0 < t1).map((o) => o.caja);
      // «letras más grandes» (tamano_texto > 1): el texto prefiere el lugar más grande aunque pise pelo o cuello (nunca ojos-boca-mentón)
      const apretada = ["texto", "lista", "grafica"].includes(tipo) ? 0.5 + Math.min(0.5, Math.max(0, (ajustes.tamano_texto - 1) * 1.5)) : 0.5;
      const z = zonas.lugar(t0, t1, { aspecto, zona: el.zona || "auto", id, evitar, minimo: (comp.minimo || 240) * escala, apretada });
      const r = comp.build({ id, el, ajustes, M, z, t0, t1, palabras, escala, resolver, imagenes });
      if (r.aviso) advertencias.push(r.aviso);
      const ini = Math.max(0, t0 - 0.05);
      const fin = Math.min(D, t1 + 0.1);
      hosts.push(`<div id="${id}" class="host clip" data-start="${ini.toFixed(3)}" data-duration="${(fin - ini).toFixed(3)}" data-track-index="${3 + k}" style="left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px;z-index:${10 + k};"><div class="cont">${r.html}</div></div>`);
      css += r.css || "";
      tl += `\n  /* ${id} · ${tipo} · ${mmss(t0)} */\n  ` + (r.tl || "");
      if (r.modulo) modulos.push(r.modulo);
      (r.vendor || []).forEach((v) => vendor.add(v));
      const caja = { x: z.x, y: z.y, w: z.w, h: z.h };
      enPantalla.push({ t0, t1, caja });
      resueltos.push({ id, tipo, t0, t1, lugar: z.lugar, caja, porque: el.porque || "", texto: el.texto || el.etiqueta || el.icono || el.forma || "" });
    } catch (e) {
      errores.push(`${id}: ${e.message}`);
    }
  });

  // 5. subtítulos (solo con «captions: yo»)
  const cap = construirCaptions({ palabras, ajustes, zonas, W, H, D });

  // 6. fuente
  const pub = R.publico;
  if (existsSync(pub)) rmSync(pub, { recursive: true, force: true });
  mkdirSync(join(pub, "img"), { recursive: true });
  const fuente = await prepararFuente(ajustes.fuente, join(pub, "fuentes"));
  if (fuente.aviso) advertencias.push(fuente.aviso);
  const familia = fuente.familia ? `"${fuente.familia}"` : "sans-serif";

  // 7. publicar
  enlazarOCopiar(videoBase, join(pub, "video.mp4"));
  const gsap = join(MOTOR, "node_modules", "gsap", "dist", "gsap.min.js");
  if (!existsSync(gsap)) throw new Error("Falta instalar el motor: node editar.mjs instalar");
  copyFileSync(gsap, join(pub, "gsap.min.js"));
  for (const v of vendor) copyFileSync(join(MOTOR, "node_modules", "three", "build", v), join(pub, v));
  for (const im of imagenes.lista) copyFileSync(im.src, join(pub, "img", im.nombre));

  const cssTodo = (`${fuente.css}
${cssVariables(ajustes)}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000;}
#root{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#000;}
#vw{position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;}
#vz{position:absolute;inset:0;transform-origin:${px(tramos[0].o)};}
#vz video{width:100%;height:100%;object-fit:cover;display:block;}
.host{position:absolute;pointer-events:none;display:flex;align-items:center;justify-content:center;}
.cont{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;transform-origin:center center;}
.mask{display:inline-block;overflow:hidden;vertical-align:bottom;padding:0 .05em .06em;margin:0 -.05em;}
${css}
${cap.css}`).replaceAll("var(--fuente)", familia);
  const pesos = ["400", "700", "800", "900"];
  const html = `<!doctype html>
<html lang="${ajustes.idioma || "es"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${W}, height=${H}">
<title>${R.nombre}</title>
<style>
${cssTodo}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${D}" data-fps="30" data-width="${W}" data-height="${H}">
  <div id="vw"><div id="vz"><video id="v" src="video.mp4" muted playsinline data-start="0" data-duration="${D}" data-track-index="1"></video></div></div>
  <audio id="voz" src="video.mp4" data-start="0" data-duration="${D}" data-track-index="2" data-volume="1"></audio>
${hosts.join("\n")}
${cap.hosts.join("\n")}
</div>
<script src="gsap.min.js"></script>
<script>
function __fit(){
  document.querySelectorAll(".fit").forEach(function(el){
    var max=+el.dataset.max, min=+el.dataset.min||30, maxh=+el.dataset.maxh||1e9, s=max, n=0;
    el.style.fontSize=s+"px";
    while(s>min && (el.scrollWidth>el.clientWidth+2 || el.scrollHeight>maxh) && n++<400){ s-=2; el.style.fontSize=s+"px"; }
  });
  document.querySelectorAll(".host > .cont").forEach(function(el){
    var host=el.parentElement, w=el.scrollWidth, h=el.scrollHeight;
    var k=Math.min(1,(host.clientWidth+2)/w,(host.clientHeight+2)/h);
    if(k<0.995){ el.style.transform="scale("+k.toFixed(4)+")"; el.dataset.encogido=k.toFixed(3); }
  });
}
var __cargas = ${fuente.familia ? JSON.stringify(pesos.map((w) => `${w} 60px ${familia}`)) : "[]"}.map(function(f){ return document.fonts.load(f).catch(function(){}); });
Promise.all(__cargas).then(function(){ return document.fonts.ready; }).then(function(){
  __fit();
  var tl = gsap.timeline({ paused: true });
  /* video: zoom en cortes y zooms */
  ${vtl}
  /* animaciones */
  ${tl}
  /* subtítulos */
  ${cap.tl}
  tl.set({}, {}, ${D});
  window.__timelines = window.__timelines || {};
  window.__timelines["main"] = tl;
  if (window.__hfForceTimelineRebind) window.__hfForceTimelineRebind();
});
</script>
${modulos.length ? `<script type="module">
/* objetos 3D: cada uno dibuja su cuadro a partir del tiempo que manda HyperFrames */
import * as THREE from "./three.module.js";
window.__hf = window.__hf || {}; window.__hf.buildReady = window.__hf.buildReady || {};
const __escenas = [];
${modulos.join("\n")}
function __dibujar(t){ for (const f of __escenas) f(t); }
window.addEventListener("hf-seek", (ev) => __dibujar(ev.detail.time));
__dibujar(window.__hfThreeTime || 0);
</script>` : ""}
</body>
</html>
`;
  writeFileSync(join(pub, "index.html"), html);
  resueltos.sort((a, b) => a.t0 - b.t0);
  const info = {
    video: videoBase, duracion: D, ancho: W, alto: H, estilo: est.archivo, fuente: fuente.familia || "reemplazo",
    captions: { modo: ajustes.captions, franja: zonas.franja, frases: cap.frases },
    zoom_en_cortes: puntos.length,
    zoom_video: { tramos: tramos.filter((x) => x.s > 1).map((x) => ({ a: x.a, b: x.b, s: x.s, o: x.o.map(Math.round) })), zooms: zoomsOk.map((zz) => ({ t0: zz.t0, t1: zz.t1, s: zz.top, o: zz.o.map(Math.round) })) },
    elementos: resueltos, advertencias: [...advertencias, ...zonas.advertencias], errores,
  };
  writeFileSync(R.armado, JSON.stringify(info, null, 2));
  return info;
}

export async function main() {
  const info = await armar(process.argv[3]);
  console.log(`✅ Armado: ${info.elementos.length} animaciones · ${info.duracion} s · fuente ${info.fuente} · subtítulos: ${info.captions.modo}${info.captions.frases ? ` (${info.captions.frases} frases)` : ""}`);
  for (const r of info.elementos) console.log(`   ${r.id.padEnd(5)} ${r.tipo.padEnd(9)} ${mmss(r.t0)}–${mmss(r.t1)}  ${String(r.lugar).padEnd(9)} ${r.texto || ""}`);
  if (info.advertencias.length) { console.log("⚠️  Advertencias:"); info.advertencias.forEach((a) => console.log("   · " + a)); }
  if (info.errores.length) { console.log("❌ Errores (arreglá el storyboard y volvé a armar):"); info.errores.forEach((a) => console.log("   · " + a)); process.exit(1); }
}
