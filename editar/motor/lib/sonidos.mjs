// Efectos de sonido puestos solos, en el segundo exacto de cada cosa que pasa en pantalla, y la voz nivelada.
//
// Cada animación avisa sus momentos (entra un texto, un ícono o una gráfica, un número cuenta, un zoom de golpe;
// quedan en armado.json) y acá se elige el sonido, el volumen (siempre debajo de la voz) y cuánto antes arranca el
// archivo, para que su golpe caiga en el cuadro exacto. Cuántos van lo dice mi-estilo.md: efectos (muchos | normal
// | pocos | ninguno), volumen_efectos y efectos_quitar. En la misma mezcla, con «voz: nivelada», a la voz se le
// sacan los graves de fondo (abajo de 70 Hz) y se la deja a −14 LUFS, el volumen de Reels, TikTok y Shorts.
//
// De dónde salen los sonidos: HyperFrames trae 19 efectos y los baja «instalar» junto con el motor. Son de Pixabay,
// con su licencia de contenido: se pueden usar gratis dentro de tus videos, también comerciales y sin dar crédito,
// pero no repartir los archivos sueltos; por eso no vienen en la carpeta de la skill. Si no están, se arman con
// FFmpeg (más simples) y quedan en ~/.cache/editar-skill/sfx.
import { existsSync, readdirSync, mkdirSync, writeFileSync, renameSync, rmSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { MOTOR, argGrafo, duracion, mmss } from "./comun.mjs";

// tipo que avisa una animación → archivo de HyperFrames, volumen y «ataque»: segundos desde que arranca el archivo
// hasta su golpe (medido en cada archivo: pop 0.11, click 0.04, ping 0.32, golpe 0.12, error 0.6, tecleo 0.45).
// El whoosh arranca justo en el momento: su pico, 0.16 s después, cae cuando la cosa termina de entrar.
// dur: el archivo se corta ahí, con un fundido corto. Volúmenes medidos con la voz a −16 LUFS: quedan debajo de ella.
export const SONIDOS = {
  whoosh: { archivo: "whoosh-short", vol: 0.22, ataque: 0, clase: "whoosh" },
  pop: { archivo: "pop", vol: 0.22, ataque: 0.11, clase: "pop" },
  click: { archivo: "click", vol: 0.3, ataque: 0.04, clase: "click" },
  "click suave": { archivo: "click-soft", vol: 0.22, ataque: 0.04, clase: "click" },
  golpe: { archivo: "impact-bass-1", vol: 0.1, ataque: 0.12, dur: 0.9, clase: "golpe" },
  ding: { archivo: "ping", vol: 0.3, ataque: 0.32, clase: "ding" },
  notificacion: { archivo: "notification", vol: 0.25, ataque: 0.08, dur: 1.2, clase: "notificacion" },
  error: { archivo: "error", vol: 0.6, ataque: 0.6, clase: "error" },
  tecleo: { archivo: "typing", vol: 0.4, ataque: 0.45, dur: 1.0, clase: "click" },
};
const TICK = { archivo: "key-press", vol: 0.45, ataque: 0, desde: 0.06, repetir: 0.075, clase: "conteo" }; // un tic cada 75 ms mientras cuenta
const ZOOM = { archivo: "whoosh-short", vol: 0.1, ataque: 0.16, clase: "zoom" }; // salto de zoom (con efectos: muchos): el pico cae en el salto
const PRIORIDAD = { golpe: 5, whoosh: 4, pop: 3, ding: 3, notificacion: 3, error: 3, click: 2, zoom: 0 };
export const NIVELES = ["ninguno", "pocos", "normal", "muchos"];
export const TIPOS_SONIDO = Object.keys(SONIDOS);

// cómo puede nombrar la persona cada clase en efectos_quitar
const CLASES = {
  whoosh: "whoosh", whooshes: "whoosh", woosh: "whoosh", swoosh: "whoosh", swish: "whoosh",
  pop: "pop", pops: "pop", click: "click", clicks: "click", clic: "click", clics: "click",
  golpe: "golpe", golpes: "golpe", boom: "golpe", bajo: "golpe", bajos: "golpe",
  ding: "ding", dings: "ding", campana: "ding", campanita: "ding",
  conteo: "conteo", tic: "conteo", tics: "conteo", "tic tic": "conteo", "tic-tic": "conteo", ticks: "conteo",
  zoom: "zoom", zooms: "zoom", error: "error", errores: "error",
  notificacion: "notificacion", "notificación": "notificacion", notificaciones: "notificacion",
  tecleo: "click", teclado: "click", "whoosh de los zooms": "zoom",
};
export const claseDe = (x) => CLASES[String(x).toLowerCase().trim()] || String(x).toLowerCase().trim();

// Los de reemplazo, hechos con FFmpeg: misma idea que cada archivo de HyperFrames, con el golpe casi al principio.
// gan: lo que hay que multiplicar su volumen para que suene como el original (medido en su golpe, la ventana de
// 50 ms más fuerte), así sirven los mismos volúmenes de arriba. El archivo queda sin pasarse de 0 dBFS.
const SINTETICOS = {
  "whoosh-short": { dur: 0.5, expr: "(2*random(0)-1)*if(lt(t,0.16),pow(t/0.16,2),exp(-(t-0.16)/0.08))", filtros: "highpass=f=500,lowpass=f=5000", ataque: 0, gan: 1.98 },
  pop: { dur: 0.22, expr: "sin(2*PI*(330*t+40*(1-exp(-t/0.025))))*exp(-t/0.045)*(1-exp(-t/0.002))", ataque: 0.004, gan: 0.63 },
  click: { dur: 0.06, expr: "(2*random(0)-1)*exp(-t/0.004)", filtros: "highpass=f=1800", ataque: 0.001, gan: 0.8 },
  "click-soft": { dur: 0.06, expr: "(2*random(0)-1)*exp(-t/0.005)", filtros: "highpass=f=900,lowpass=f=4000", ataque: 0.001, gan: 1.93 },
  "impact-bass-1": { dur: 1.0, expr: "sin(2*PI*(42*t+6*(1-exp(-t/0.06))))*exp(-t/0.3)+0.4*(2*random(0)-1)*exp(-t/0.012)", filtros: "lowpass=f=1200", ataque: 0.004, gan: 1.46 },
  ping: { dur: 1.2, expr: "(0.6*sin(2*PI*1568*t)*exp(-t/0.35)+0.3*sin(2*PI*3136*t)*exp(-t/0.18)+0.2*sin(2*PI*2349*t)*exp(-t/0.25))*(1-exp(-t/0.002))", ataque: 0.003, gan: 0.2 },
  notification: { dur: 0.9, expr: "0.6*sin(2*PI*1047*t)*exp(-t/0.12)*lt(t,0.12)+0.6*sin(2*PI*1568*(t-0.12))*exp(-(t-0.12)/0.3)*gte(t,0.12)", ataque: 0.002, gan: 0.55 },
  error: { dur: 0.6, expr: "0.5*(sin(2*PI*311*t)+0.4*sin(2*PI*622*t))*lt(t,0.18)+0.5*(sin(2*PI*233*t)+0.4*sin(2*PI*466*t))*between(t,0.22,0.5)", filtros: "afade=t=out:st=0.45:d=0.12", ataque: 0.003, gan: 0.15 },
  "key-press": { dur: 0.06, expr: "(2*random(0)-1)*exp(-t/0.003)", filtros: "highpass=f=2500", ataque: 0.001, desde: 0, gan: 0.31 },
  typing: { dur: 1.0, expr: "(2*random(0)-1)*exp(-mod(t,0.11)/0.004)", filtros: "highpass=f=2000", ataque: 0.001, gan: 0.51 },
};
const CACHE = join(homedir(), ".cache", "editar-skill", "sfx");

function buscarCarpeta(dir, nivel = 0) {
  if (nivel > 7 || !existsSync(dir)) return null;
  let entradas;
  try { entradas = readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  if (entradas.some((e) => e.name === "whoosh-short.mp3")) return dir;
  for (const e of entradas) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const r = buscarCarpeta(join(dir, e.name), nivel + 1);
    if (r) return r;
  }
  return null;
}

// De dónde salen: EDITAR_SFX=<carpeta> (archivos con los mismos nombres) · EDITAR_SFX=sinteticos · si no, HyperFrames
export function fuenteSonidos() {
  const pedido = process.env.EDITAR_SFX;
  if (pedido && pedido !== "sinteticos" && existsSync(join(pedido, "whoosh-short.mp3"))) return { tipo: "carpeta", dir: pedido };
  if (pedido !== "sinteticos") {
    const base = join(MOTOR, "node_modules", "hyperframes");
    const conocida = join(base, "dist", "skills", "media-use", "audio", "assets", "sfx");
    const dir = existsSync(join(conocida, "whoosh-short.mp3")) ? conocida : buscarCarpeta(base);
    if (dir) return { tipo: "hyperframes", dir };
  }
  return { tipo: "sinteticos", dir: CACHE };
}

function sintetizar(nombre) {
  const s = SINTETICOS[nombre];
  const ruta = join(CACHE, `${nombre}.wav`);
  if (existsSync(ruta)) return ruta;
  mkdirSync(CACHE, { recursive: true });
  const grafo = `aevalsrc='${s.expr}':s=48000:d=${s.dur}${s.filtros ? "," + s.filtros : ""}`;
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", grafo, "-c:a", "pcm_s16le", ruta + ".tmp.wav"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`no pude armar el sonido «${nombre}» con FFmpeg: ${(r.stderr || "").slice(-300)}`);
  renameSync(ruta + ".tmp.wav", ruta);
  return ruta;
}

// archivo, ataque y salto del comienzo de un sonido según de dónde salen
function archivoDe(def, fuente) {
  if (fuente.tipo !== "sinteticos") {
    const ruta = join(fuente.dir, `${def.archivo}.mp3`);
    if (existsSync(ruta)) return { ruta, ataque: def.ataque || 0, desde: def.desde || 0, gan: 1 };
  }
  const s = SINTETICOS[def.archivo];
  return { ruta: sintetizar(def.archivo), ataque: s.ataque, desde: s.desde ?? 0, gan: s.gan, sintetico: true };
}

// Qué suena y cuándo. eventos: los que avisaron las animaciones ({ t, tipo, que, id, cuenta?, extra? });
// saltos: los segundos donde el video salta de zoom; relVoz: cuánto subir o bajar los efectos para que queden
// igual de debajo de la voz que con una voz a −16 LUFS.
export function planearSonidos({ eventos = [], saltos = [], ajustes, D, relVoz = 1, fuente = fuenteSonidos() }) {
  const nivel = NIVELES.includes(ajustes.efectos) ? ajustes.efectos : "normal";
  const avisos = [];
  if (nivel === "ninguno") return { lista: [], nivel, avisos, fuente };
  const quitar = new Set((ajustes.efectos_quitar || []).map(claseDe));
  if (quitar.has("whoosh")) quitar.add("zoom"); // «sin whoosh» = también los de los zooms (es el mismo sonido)
  const gan = Math.max(0, Math.min(2.5, Number(ajustes.volumen_efectos ?? 1)));
  const momentos = [];
  const vistos = new Set();
  for (const s of [...eventos].sort((a, b) => a.t - b.t)) {
    const primero = !vistos.has(s.id);
    vistos.add(s.id);
    if (nivel === "pocos" && !primero) continue;
    if (s.extra && nivel !== "muchos") continue;
    if (s.tipo === "conteo") {
      const [c0, c1] = s.cuenta || [s.t + 0.1, s.t + 1.0];
      momentos.push({ momento: s.t, def: SONIDOS.whoosh, tipo: "whoosh", que: `entra ${s.que}`, id: s.id });
      if (nivel !== "pocos") momentos.push({ momento: c0, def: TICK, dur: Math.max(0.1, c1 - c0), tipo: "tic tic", que: `${s.que} cuenta`, id: s.id });
      momentos.push({ momento: c1, def: SONIDOS.ding, tipo: "ding", que: `${s.que} llega a su valor`, id: s.id });
      continue;
    }
    let def = SONIDOS[s.tipo];
    if (!def) { def = SONIDOS.whoosh; avisos.push(`sonido «${s.tipo}» (${s.id}) no existe: va un whoosh (hay: ${TIPOS_SONIDO.join(", ")})`); }
    momentos.push({ momento: s.t, def, tipo: s.tipo, que: s.que, id: s.id });
  }
  if (nivel === "muchos") {
    let ultimo = -9;
    for (const t of saltos) {
      if (t - ultimo < 2 || momentos.some((x) => x.def.clase !== "conteo" && Math.abs(x.momento - t) < 0.5)) continue;
      momentos.push({ momento: t, def: ZOOM, tipo: "whoosh suave", que: "salto de zoom", id: "zoom" });
      ultimo = t;
    }
  }
  let lista = momentos
    .filter((x) => !quitar.has(x.def.clase) && x.momento < D - 0.05)
    .map((x) => {
      const a = archivoDe(x.def, fuente);
      let t = x.momento - a.ataque, desde = a.desde;
      if (t < 0) { desde += -t; t = 0; }
      const ev = { t: +t.toFixed(3), momento: +x.momento.toFixed(3), archivo: a.ruta, sonido: x.def.archivo, vol: +(x.def.vol * a.gan * gan * relVoz).toFixed(3), clase: x.def.clase, tipo: x.tipo, que: x.que, id: x.id };
      if (desde > 0.0005) ev.desde = +desde.toFixed(3);
      if (x.def.repetir) { ev.repetir = x.def.repetir; ev.dur = +x.dur.toFixed(3); }
      else if (x.def.dur) ev.dur = x.def.dur;
      return ev;
    })
    .filter((x) => x.vol > 0);
  // dos golpes a menos de 0.1 s suenan como uno: queda el más importante (los tics de fondo no cuentan)
  lista.sort((a, b) => a.momento - b.momento);
  const final = [];
  for (const x of lista) {
    const prev = [...final].reverse().find((y) => y.clase !== "conteo");
    if (x.clase !== "conteo" && prev && x.momento - prev.momento < 0.1) {
      if ((PRIORIDAD[x.clase] ?? 1) > (PRIORIDAD[prev.clase] ?? 1)) final[final.indexOf(prev)] = x;
      continue;
    }
    final.push(x);
  }
  if (quitar.size) avisos.push(`sin ${[...quitar].join(", ")} (efectos_quitar)`);
  return { lista: final, nivel, avisos, fuente };
}

// Primera pasada del volumen de la voz: cuánto mide hoy (y con qué subirla a −14 LUFS sin tocar su dinámica).
export function medirVoz(video, { nivelada = true } = {}) {
  const af = `${nivelada ? "highpass=f=70," : ""}loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json`;
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", video, "-vn", "-af", af, "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 << 20 });
  const txt = String(r.stderr || "");
  const ini = txt.lastIndexOf("{");
  try {
    const j = JSON.parse(txt.slice(ini, txt.indexOf("}", ini) + 1));
    const n = (k) => Number(j[k]);
    if (![n("input_i"), n("input_tp"), n("input_lra"), n("input_thresh"), n("target_offset")].every(Number.isFinite)) return null;
    return { I: n("input_i"), TP: n("input_tp"), LRA: n("input_lra"), umbral: n("input_thresh"), offset: n("target_offset") };
  } catch {
    return null;
  }
}

// Mezcla los efectos en el video (la imagen no se toca: se copia tal cual).
// el limitador mira 5 ms adelante y atrasa todo el audio esos 5 ms; «latency» lo compensa (FFmpeg 5 o más nuevo)
let _latencia = null;
function latenciaLimitador() {
  if (_latencia === null) {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-h", "filter=alimiter"], { encoding: "utf8" });
    _latencia = /\blatency\b/.test(`${r.stdout || ""}${r.stderr || ""}`) ? ":latency=1" : "";
  }
  return _latencia;
}

export function mezclarSonidos({ base, salida, lista, voz = null, grafo }) {
  const entradas = ["-i", base];
  const partes = [];
  partes.push(`[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo${voz ? `,highpass=f=70,loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${voz.I}:measured_TP=${voz.TP}:measured_LRA=${voz.LRA}:measured_thresh=${voz.umbral}:offset=${voz.offset}:linear=true,aresample=48000` : ""}[voz]`);
  lista.forEach((e, i) => {
    const k = i + 1;
    entradas.push("-i", e.archivo);
    const d0 = e.desde || 0;
    let pre = "";
    if (e.repetir) {
      const p = e.repetir;
      pre = `atrim=start=${d0}:end=${+(d0 + p).toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,apad=whole_len=${Math.round(p * 48000)},aloop=loop=-1:size=${Math.round(p * 48000)},atrim=0:${e.dur},asetpts=PTS-STARTPTS,afade=t=out:st=${Math.max(0, e.dur - 0.08).toFixed(3)}:d=0.08,`;
    } else if (e.dur) {
      pre = `atrim=start=${d0}:end=${+(d0 + e.dur).toFixed(3)},asetpts=PTS-STARTPTS,afade=t=out:st=${Math.max(0, e.dur - 0.12).toFixed(3)}:d=0.12,`;
    } else if (d0) {
      pre = `atrim=start=${d0},asetpts=PTS-STARTPTS,`;
    }
    const ms = Math.round(e.t * 1000);
    partes.push(`[${k}:a]${pre}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${e.vol},adelay=${ms}|${ms}[s${k}]`);
  });
  const todas = "[voz]" + lista.map((_, i) => `[s${i + 1}]`).join("");
  partes.push(`${todas}${lista.length ? `amix=inputs=${lista.length + 1}:normalize=0:duration=first:dropout_transition=0,` : ""}alimiter=limit=0.89:attack=5:release=50:level=false${latenciaLimitador()}[a]`);
  writeFileSync(grafo, partes.join(";\n"));
  const tmp = salida + ".mezclando.mp4";
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...entradas, ...argGrafo(grafo), "-map", "0:v", "-map", "[a]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", tmp], { encoding: "utf8", maxBuffer: 64 << 20 });
  if (r.status !== 0 || !existsSync(tmp)) {
    rmSync(tmp, { force: true });
    throw new Error(`no pude mezclar los sonidos (el grafo está en ${grafo}): ${String(r.stderr || "").trim().slice(-500)}`);
  }
  renameSync(tmp, salida);
}

// Todo junto: mide la voz, planea los efectos desde armado.json y los mezcla sobre el render sin efectos.
// Devuelve el resumen y deja sonidos.json (lo que suena y cuándo) y sonidos.txt (para leérselo a la persona).
export function ponerSonidos({ armado, ajustes, base, salida, trabajo, json, txt }) {
  const nivelada = ajustes.voz !== "original";
  const voz = medirVoz(base, { nivelada });
  // los volúmenes de arriba se midieron con la voz a −16 LUFS: si la voz queda más fuerte o más suave, los efectos acompañan
  const vozFinal = voz ? (nivelada ? -14 : voz.I) : -16;
  const relVoz = Math.max(0.5, Math.min(1.6, Math.pow(10, (vozFinal + 16) / 20)));
  const plan = planearSonidos({ eventos: armado.sonidos || [], saltos: armado.saltos_zoom || [], ajustes, D: armado.duracion, relVoz });
  if (!plan.lista.length && !(nivelada && voz)) {
    copyFileSync(base, salida);
  } else {
    mezclarSonidos({ base, salida, lista: plan.lista, voz: nivelada && voz ? voz : null, grafo: join(trabajo, "sonidos.ffgraph") });
  }
  const dur = duracion(salida);
  const resumen = {
    efectos: plan.lista.length, nivel: plan.nivel, fuente: plan.fuente.tipo,
    voz: nivelada ? (voz ? `nivelada de ${voz.I} a −14 LUFS` : "no la pude medir: quedó como estaba") : `original (${voz ? voz.I + " LUFS" : "?"})`,
    avisos: plan.avisos, duracion: +dur.toFixed(3),
  };
  writeFileSync(json, JSON.stringify({ ...resumen, eventos: plan.lista.map(({ archivo, ...x }) => x) }, null, 2));
  const filas = plan.lista.map((s, i) => `${String(i + 1).padStart(2)}. ${mmss(s.momento)}  ${s.sonido}${s.repetir ? ` × ${Math.round(s.dur / s.repetir)}` : ""}  · ${s.que} (${s.id})`);
  writeFileSync(txt, [`${plan.lista.length} efectos de sonido (efectos: ${plan.nivel}, volumen ×${ajustes.volumen_efectos ?? 1}, de ${plan.fuente.tipo === "sinteticos" ? "reemplazo, hechos con FFmpeg" : "HyperFrames"}) · voz ${resumen.voz}`, ...filas, ""].join("\n"));
  return resumen;
}
