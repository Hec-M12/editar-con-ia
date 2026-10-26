// referencia — mira un video que le gusta a la persona y mide cómo está editado, para copiarle el estilo.
//
//   node editar.mjs referencia <tu-video> <video-o-link> [--hasta 90] [--idioma en]
//
//   --idioma  el que se habla en la referencia (si no se dice, Whisper lo detecta solo: puede ser otro que el tuyo)
//
// Deja en <carpeta de tu video>/referencias/<nombre>/:
//   medidas.txt   el resumen con números: cortes, zooms, números en pantalla, textos, subtítulos, ritmo y en qué
//                 palabras pasa cada cosa
//   medidas.json  lo mismo, completo (cada corte, zoom y texto con su segundo)
//   hoja-1.jpg…   un cuadro por segundo, para ver íconos, gráficas, colores y fuente
//   momentos.jpg  cuadro a cuadro de los momentos clave: cómo entran y salen los textos y los zooms
// Con eso Claude escribe las reglas en mi-estilo.md. La referencia solo se mide: no se copia nada de ella
// al video de la persona ni se publica.
//
// Cómo mide: FFmpeg encuentra los cambios de plano; en Mac, Vision mira la cara y lee el texto en pantalla
// cuatro veces por segundo (si la cara crece de golpe sin cambiar de lugar, es un zoom); Whisper anota qué
// se dice en cada segundo. En Windows o Linux no hay cara ni texto automáticos: Claude los saca de las hojas.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join, basename, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { rutas, slug, arg, tiene, duracion, ffprobe, hyperframes } from "../lib/comun.mjs";
import { cargarEstilo, buscarEstilo } from "../lib/estilo.mjs";
import { arreglarPalabras } from "../lib/transcript.mjs";
import { transcribirFino } from "../lib/whisper.mjs";
import { compilarSwift } from "./caras.mjs";
import { hojaDeCuadros } from "./cuadros.mjs";

const CADA = 0.25; // segundos entre muestras de cara y texto

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ$%]+/g, " ").trim();
const mediana = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const r1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x === null || x === undefined ? null : Math.round(x * 100) / 100);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const NUMEROS = new Set("cero uno una dos tres cuatro cinco seis siete ocho nueve diez once doce quince veinte treinta cuarenta cincuenta cien ciento cientos doscientos trescientos quinientos mil miles millon millones billon one two three four five six seven eight nine ten twenty fifty hundred thousand million millions billion dolares dolar dollars pesos lempiras".split(" "));
const esNumero = (texto) => /\d|[$%]/.test(texto) || norm(texto).split(" ").some((w) => NUMEROS.has(w));
// un texto que es solo una cifra ($1,000,000 · 10k · 45%); el lector a veces lee la O por 0 y la l por 1
const soloNumero = (texto) => { const s = String(texto).replace(/[Oo]/g, "0").replace(/[lI|]/g, "1").replace(/\s/g, ""); return /\d/.test(s) && /^[$€£+\-]?[\d.,]+[kKmM%]?$/.test(s); };
const valorNumero = (texto) => String(texto).replace(/[Oo]/g, "0").replace(/[lI|]/g, "1").replace(/[^\d]/g, "");

function bajar(url, dir) {
  const w = spawnSync(process.platform === "win32" ? "where" : "which", ["yt-dlp"], { encoding: "utf8" });
  if (w.status !== 0) throw new Error("Para bajar un link hace falta yt-dlp: brew install yt-dlp (Mac) · winget install yt-dlp (Windows) · pip install yt-dlp (Linux). O bajá el video vos y pasame el archivo.");
  console.log("▸ Bajando la referencia con yt-dlp…");
  const r = spawnSync("yt-dlp", ["-f", "bv*+ba/b", "-S", "res:1080,vcodec:h264,acodec:aac", "--merge-output-format", "mp4", "--no-playlist", "-o", join(dir, "video.%(ext)s"), url], { encoding: "utf8" });
  const f = existsSync(dir) ? readdirSync(dir).find((x) => /^video\.(mp4|mkv|webm|mov)$/.test(x)) : null;
  if (r.status !== 0 || !f) throw new Error(`yt-dlp no pudo bajarlo:\n${String(r.stderr || "").slice(-600)}`);
  return join(dir, f);
}

// Vision (macOS) no decodifica todos los formatos: un video en AV1 o VP9 (lo que baja YouTube muchas veces) lo
// lee en negro, sin cara ni texto. Para esos se hace una copia liviana en H.264, solo para mirarlo.
function paraVision(video, dir, hasta) {
  const codec = ffprobe(video, ["-select_streams", "v:0", "-show_entries", "stream=codec_name"]).streams?.[0]?.codec_name || "";
  if (["h264", "hevc", "prores", "mjpeg"].includes(codec)) return video;
  const copia = join(dir, "para-vision.mp4");
  if (existsSync(copia) && duracion(copia) >= hasta - 0.3) return copia; // la de una medida más corta no sirve
  console.log(`▸ La referencia viene en ${codec || "otro formato"}: hago una copia en H.264 para mirarla…`);
  for (const cv of [["-c:v", "libx264", "-preset", "veryfast", "-crf", "18"], ["-c:v", "h264_videotoolbox", "-b:v", "8M"]]) {
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-t", String(hasta), "-i", video, "-an", ...cv, "-pix_fmt", "yuv420p", copia]);
    if (r.status === 0 && existsSync(copia)) return copia;
    rmSync(copia, { force: true });
  }
  return video;
}

function nombreDeLink(url) {
  try {
    const u = new URL(url);
    return slug(u.searchParams.get("v") || u.pathname.split("/").filter(Boolean).pop() || u.hostname);
  } catch { return "referencia"; }
}

// cambios de plano según FFmpeg (puntaje 0-1: más alto = más distinto el cuadro siguiente)
function cambiosDePlano(video, hasta) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-t", String(hasta), "-i", video, "-an", "-vf", "scale=320:-2,select='gt(scene,0.08)',metadata=print:file=-", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 << 20 });
  const out = [];
  let t = null;
  for (const linea of String(r.stdout || "").split("\n")) {
    const m = linea.match(/pts_time:([\d.]+)/);
    if (m) t = +m[1];
    const s = linea.match(/lavfi\.scene_score=([\d.]+)/);
    if (s && t !== null) { out.push({ t, puntaje: +s[1] }); t = null; }
  }
  return out;
}

function transcribir(video, dir, hasta, modelo, idioma) {
  const wav = join(dir, "audio.wav");
  spawnSync("ffmpeg", ["-v", "error", "-y", "-t", String(hasta), "-i", video, "-vn", "-ac", "1", "-ar", "16000", wav]);
  if (!existsSync(wav)) return [];
  const archivo = join(dir, "transcript.json");
  const info = {};
  let crudo = transcribirFino(wav, { modelo, idioma, dir, info });
  if (!crudo) {
    const res = hyperframes(["transcribe", wav, "-d", dir, "--json", "--model", modelo, ...(idioma !== "auto" ? ["--language", idioma] : []), "--engine", "whisper"], { cwd: dir });
    crudo = transcribirFino(wav, { modelo, idioma, dir, info }) || (res.status === 0 && existsSync(archivo) ? JSON.parse(readFileSync(archivo, "utf8")) : null);
  }
  rmSync(wav, { force: true });
  if (!crudo) { console.log("⚠️  Whisper no pudo transcribir la referencia: sigo sin el texto hablado."); return []; }
  const palabras = arreglarPalabras(crudo, info.idioma || idioma);
  writeFileSync(archivo, JSON.stringify(palabras, null, 1));
  if (info.idioma) writeFileSync(join(dir, "idioma.txt"), info.idioma + "\n");
  return palabras;
}

const palabraEn = (palabras, t) => {
  let mejor = null;
  for (const w of palabras) {
    if (t >= w.start - 0.15 && t <= w.end + 0.15) return w;
    if (w.start > t && w.start - t < 0.35 && !mejor) mejor = w;
  }
  return mejor;
};

const centro = (c) => [c[0] + c[2] / 2, c[1] + c[3] / 2];

// Cambios de imagen: «corte» (otro plano, b-roll o captura), «salto con zoom» (mismo plano, la cara de golpe
// más grande o más chica: un jump cut con zoom) o «salto» (mismo plano y tamaño: se cortó un pedazo).
function cortesYZooms(planos, muestras) {
  const lado = (t, a, b) => muestras.filter((m) => m.caja && m.t >= t + a && m.t <= t + b);
  const resumen = (ms) => ({ h: mediana(ms.map((m) => m.caja[3])), x: mediana(ms.map((m) => centro(m.caja)[0])), y: mediana(ms.map((m) => centro(m.caja)[1])), parejo: ms.length >= 2 && Math.max(...ms.map((m) => m.caja[3])) / Math.min(...ms.map((m) => m.caja[3])) < 1.1 });
  const crudos = [];
  for (const p of planos) {
    const A = lado(p.t, -0.6, -0.04), B = lado(p.t, 0.04, 0.6);
    let tipo = null, escala = null;
    if (A.length >= 2 && B.length >= 2) {
      const a = resumen(A), b = resumen(B);
      const mov = Math.hypot(a.x - b.x, a.y - b.y);
      escala = b.h / a.h;
      const mismoPlano = mov < 0.12 && escala > 0.6 && escala < 1.6;
      if (mismoPlano && a.parejo && b.parejo && Math.abs(escala - 1) >= 0.07 && p.puntaje >= 0.1) tipo = "salto con zoom";
      else if (mismoPlano && p.puntaje >= 0.2) tipo = "salto";
      else if (p.puntaje >= 0.25) tipo = "corte";
    } else if (p.puntaje >= 0.25) tipo = "corte";
    if (tipo) crudos.push({ t: r2(p.t), tipo, puntaje: r2(p.puntaje), escala: escala ? r2(escala) : null });
  }
  // un cambio puede disparar dos cuadros seguidos: queda el más fuerte
  const eventos = [];
  for (const e of crudos) {
    const prev = eventos[eventos.length - 1];
    if (prev && e.t - prev.t < 0.2) { if (e.puntaje > prev.puntaje) eventos[eventos.length - 1] = e; }
    else eventos.push(e);
  }
  return eventos;
}

// zooms suaves: dentro de un plano, la cara crece (o se achica) parejo más de un 10 %
function zoomsSuaves(muestras, cortes, hasta) {
  const bordes = [0, ...cortes.map((c) => c.t), hasta];
  const out = [];
  for (let k = 0; k < bordes.length - 1; k++) {
    const tramo = muestras.filter((m) => m.caja && m.t > bordes[k] + 0.1 && m.t < bordes[k + 1] - 0.1);
    if (tramo.length < 5) continue;
    const h = tramo.map((m, i) => mediana(tramo.slice(Math.max(0, i - 1), i + 2).map((x) => x.caja[3])));
    const subidas = h.slice(1).filter((x, i) => x > h[i] * 1.002).length, bajadas = h.slice(1).filter((x, i) => x < h[i] * 0.998).length;
    const ratio = h[h.length - 1] / h[0];
    if (Math.abs(ratio - 1) >= 0.1 && Math.max(subidas, bajadas) >= (h.length - 1) * 0.7) {
      out.push({ t0: r2(tramo[0].t), t1: r2(tramo[tramo.length - 1].t), escala: r2(ratio) });
    }
  }
  return out;
}

const soloLetras = (x) => norm(x).replace(/[^a-z0-9ñ]/g, "");
// parecido entre dos textos (0-1), para seguir un texto aunque el lector lo lea un poco distinto en cada cuadro
function parecido(a, b) {
  const A = soloLetras(a), B = soloLetras(b);
  if (A === B) return 1;
  if (A.length < 2 || B.length < 2) return 0;
  const pares = (x) => { const m = new Map(); for (let i = 0; i < x.length - 1; i++) { const k = x.slice(i, i + 2); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const pa = pares(A), pb = pares(B);
  let comun = 0;
  for (const [k, v] of pa) comun += Math.min(v, pb.get(k) || 0);
  return (2 * comun) / (A.length + B.length - 2);
}

// textos en pantalla: se siguen de una muestra a la otra (mismo texto, mismo lugar) y se juntan las líneas de un mismo bloque.
// Una cifra que cuenta (281,250 → 1,000,000) sigue siendo el mismo texto aunque cambien los dígitos.
function textosEnPantalla(muestras, palabras, H) {
  const abiertos = [], cerrados = [];
  for (const m of muestras) {
    const usados = new Set();
    for (const x of m.textos || []) {
      if (soloLetras(x.t).length < 2 && !soloNumero(x.t)) continue;
      if ((x.c ?? 1) < 0.5 && !soloNumero(x.t)) continue; // lo que el lector no ve claro
      const [cx, cy] = centro(x.caja);
      let mejor = null, pm = 0;
      for (const a of abiertos) {
        const dist = Math.hypot(a.cx - cx, a.cy - cy);
        if (usados.has(a) || m.t - a.t1 > 0.8 || dist > 0.1) continue;
        let p = parecido(a.texto, x.t);
        if (soloNumero(a.texto) && soloNumero(x.t) && dist <= 0.08) p = Math.max(p, 0.9);
        if (p >= 0.6 && p > pm) { mejor = a; pm = p; }
      }
      if (mejor) { mejor.t1 = m.t; mejor.altos.push(x.caja[3]); mejor.anchos.push(x.caja[2]); mejor.cx = cx; mejor.cy = cy; mejor.variantes.set(x.t, (mejor.variantes.get(x.t) || 0) + 1); usados.add(mejor); }
      else { const nuevo = { texto: x.t, t0: m.t, t1: m.t, cx, cy, altos: [x.caja[3]], anchos: [x.caja[2]], variantes: new Map([[x.t, 1]]) }; abiertos.push(nuevo); usados.add(nuevo); }
    }
    for (let i = abiertos.length - 1; i >= 0; i--) if (m.t - abiertos[i].t1 > 0.8) cerrados.push(...abiertos.splice(i, 1));
  }
  cerrados.push(...abiertos);
  const lineas = cerrados
    .map((a) => {
      const valores = new Set([...a.variantes.keys()].filter(soloNumero).map(valorNumero));
      return { ...a, texto: [...a.variantes.entries()].sort((x, y) => y[1] - x[1])[0][0], dur: a.t1 - a.t0 + CADA, alto: mediana(a.altos), altoMax: Math.max(...a.altos), anchoMax: Math.max(...a.anchos), cuenta: valores.size >= 3 };
    })
    .filter((a) => a.dur >= CADA * 1.5 || soloNumero(a.texto));
  // ¿repite lo que dice? (cada palabra del texto contra lo que se dice cerca, con tolerancia a errores de lectura)
  const repite = (texto, t0, t1) => {
    const dicho = palabras.filter((w) => w.end >= t0 - 0.8 && w.start <= t1 + 0.8).map((w) => w.text);
    const ws = norm(texto).split(" ").filter((w) => soloLetras(w).length > 1 || /\d/.test(w));
    if (!ws.length) return 0;
    return ws.filter((w) => dicho.some((d) => parecido(w, d) >= 0.75)).length / ws.length;
  };
  lineas.forEach((l) => { l.repite = repite(l.texto, l.t0, l.t1 + CADA); });
  // subtítulos: la fila donde aparecen seguido textos cortos que repiten lo que se dice
  const cand = lineas.filter((l) => l.dur <= 2.5 && l.repite >= 0.5);
  const filas = new Map();
  cand.forEach((l) => { const k = Math.round(l.cy / 0.03); filas.set(k, (filas.get(k) || 0) + 1); });
  const [filaTop, cuantos] = [...filas.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const ySub = cuantos >= Math.max(4, (H / 60) * 6) ? filaTop * 0.03 : null;
  lineas.forEach((l) => { l.subtitulo = ySub !== null && Math.abs(l.cy - ySub) <= 0.045 && l.dur <= 2.5 && !soloNumero(l.texto); });
  // bloques: líneas que entran y salen juntas, una debajo de la otra
  lineas.sort((a, b) => a.t0 - b.t0 || a.cy - b.cy);
  const bloques = [];
  for (const l of lineas) {
    const b = bloques.find((x) => x.subtitulo === l.subtitulo && Math.abs(x.t0 - l.t0) <= CADA * 1.5 && Math.abs(x.t1 - l.t1) <= CADA * 2 && Math.abs(x.cyFin - l.cy) < l.alto * 2.2 && soloNumero(x.lineas[0].texto) === soloNumero(l.texto));
    if (b) { b.lineas.push(l); b.cyFin = l.cy; }
    else bloques.push({ t0: l.t0, t1: l.t1, cy: l.cy, cyFin: l.cy, subtitulo: l.subtitulo, lineas: [l] });
  }
  return bloques.map((b) => {
    const t0 = b.t0, t1 = Math.max(...b.lineas.map((l) => l.t1)) + CADA;
    const texto = b.lineas.map((l) => l.texto).join(" / ");
    const ws = norm(texto).split(" ").filter((w) => soloLetras(w).length > 1 || /\d/.test(w));
    const letras = texto.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
    return {
      texto, t0: r2(t0), t1: r2(t1), dur: r2(t1 - t0),
      y: r2(b.cy), alto: r2(mediana(b.lineas.map((l) => l.alto))), lineas: b.lineas.length,
      alto_max: r2(Math.max(...b.lineas.map((l) => l.altoMax))), ancho_max: r2(Math.max(...b.lineas.map((l) => l.anchoMax))),
      palabras: ws.length,
      repite_lo_dicho: r2(repite(texto, t0, t1)),
      subtitulo: b.subtitulo,
      mayusculas: letras.length >= 2 && letras === letras.toUpperCase(),
      numero: esNumero(texto), solo_numero: b.lineas.every((l) => soloNumero(l.texto)), cuenta: b.lineas.some((l) => l.cuenta),
    };
  }).filter((b) => b.palabras > 0);
}

export function referencia(video, fuente, { hasta = 90, idioma = null, rehacer = false } = {}) {
  if (!video || !fuente) throw new Error("Uso: node editar.mjs referencia <tu-video> <video-o-link-de-referencia>");
  const R = rutas(video);
  const esLink = /^https?:\/\//i.test(fuente);
  const nombre = esLink ? nombreDeLink(fuente) : slug(basename(fuente, extname(fuente)));
  const dir = join(R.proyecto, "referencias", nombre);
  mkdirSync(dir, { recursive: true });
  const ref = esLink ? bajar(fuente, dir) : resolve(fuente);
  if (!existsSync(ref)) throw new Error(`No encuentro la referencia: ${ref}`);
  const est = cargarEstilo(buscarEstilo(R.proyecto));
  const dur = duracion(ref);
  const H = Math.min(dur, Number(hasta) || 90);
  const s = ffprobe(ref, ["-select_streams", "v:0", "-show_entries", "stream=width,height"]).streams?.[0] || {};
  console.log(`▸ Midiendo ${H.toFixed(0)} s de la referencia (${s.width}×${s.height})…`);

  // 1. planos, cara y texto
  // (si ya se midió esta referencia, se reusa lo pesado: la lectura de cuadros y el transcript; --rehacer lo repite)
  const planos = cambiosDePlano(ref, H);
  let muestras = [], vision = false;
  const salidaVision = join(dir, "vision.json");
  const previa = !rehacer && existsSync(salidaVision) ? JSON.parse(readFileSync(salidaVision, "utf8")) : null;
  const leyoAlgo = (p) => (p.muestras || []).some((m) => m.caja || (m.textos || []).length);
  if (previa && previa.cada === CADA && previa.duracion >= H - 0.3 && previa.preciso && leyoAlgo(previa)) { muestras = previa.muestras || []; vision = true; }
  else {
    const bin = compilarSwift();
    if (bin) {
      const r = spawnSync(bin, [paraVision(ref, dir, H), salidaVision, String(CADA), "--texto", "--preciso", "--hasta", String(H)], { encoding: "utf8" });
      if (r.status === 0 && existsSync(salidaVision)) { muestras = JSON.parse(readFileSync(salidaVision, "utf8")).muestras || []; vision = true; }
    }
  }
  // 2. qué se dice
  const archivoT = join(dir, "transcript.json");
  const palabras = !rehacer && existsSync(archivoT) ? JSON.parse(readFileSync(archivoT, "utf8")) : transcribir(ref, dir, H, est.ajustes.whisper || "small", idioma || "auto");

  // 3. medidas
  const eventos = cortesYZooms(planos, muestras);
  const cortes = eventos.filter((e) => e.tipo === "corte");
  const zoomsGolpe = eventos.filter((e) => e.tipo === "salto con zoom");
  const saltos = eventos.filter((e) => e.tipo === "salto");
  const suaves = vision ? zoomsSuaves(muestras, eventos, H) : [];
  const bordes = [0, ...eventos.map((c) => c.t), H];
  const planosDur = bordes.slice(1).map((b, i) => b - bordes[i]).filter((x) => x > 0.05);
  const textos = vision ? textosEnPantalla(muestras, palabras, H) : [];
  // texto fijo (título o marca que queda todo el video), subtítulos y el resto: los textos que entran y salen.
  // Se descarta lo que el lector leyó mal o es letra chica de una captura (palabras raras que nadie dice).
  const fijos = [];
  for (const x of textos.filter((t) => t.dur >= H * 0.4)) if (!fijos.some((f) => parecido(f.texto, x.texto) >= 0.7)) fijos.push(x);
  const pareceFijo = (x) => textos.some((f) => f.dur >= H * 0.4 && (() => { const a = soloLetras(x.texto), b = soloLetras(f.texto); return (a.length >= 3 && b.includes(a)) || parecido(x.texto, f.texto) >= 0.7; })());
  const rara = (tok) => /[^\p{L}\p{N}¿?¡!.,:;'"%$&()\-]/u.test(tok) || /\p{Ll}\p{Lu}/u.test(tok) || /\p{L}[.,]\p{L}/u.test(tok) || (/\d/.test(tok) && /\p{L}/u.test(tok) && !/^\d+([kmx%]|mil)$/i.test(tok));
  const limpio = (x) => soloLetras(x.texto).replace(/\d/g, "").length >= 3 && x.dur >= 0.75 && !x.texto.split(/[\s/]+/).filter(Boolean).some(rara);
  const subtitulos = textos.filter((x) => x.dur < H * 0.4 && x.subtitulo);
  const numeros = textos.filter((x) => x.dur < H * 0.4 && !x.subtitulo && x.solo_numero && x.dur >= 0.4 && x.alto >= 0.025);
  const grandes = textos.filter((x) => x.dur < H * 0.4 && !x.subtitulo && !x.solo_numero && !pareceFijo(x) && (x.repite_lo_dicho >= 0.5 || limpio(x)));
  const conCara = muestras.filter((m) => m.caja);
  const minutos = H / 60;
  const gaps = palabras.slice(1).map((w, i) => w.start - palabras[i].end).filter((g) => g >= 0);
  const zoomsConPalabra = zoomsGolpe.map((z) => { const w = palabraEn(palabras, z.t); return { ...z, palabra: w ? w.text : null, numero: w ? esNumero(w.text) : false }; });
  const numerosDichos = numeros.map((x) => ({ ...x, lo_dice: palabras.some((w) => w.end >= x.t0 - 1 && w.start <= x.t1 + 0.3 && esNumero(w.text)) }));
  const pxLetra = (alto) => Math.round((alto * 1920) / 0.72); // tamaño de letra aproximado en un video de 1080×1920
  const lugarY = (y) => (y < 0.34 ? "arriba" : y < 0.62 ? "centro" : "abajo");
  const contar = (arr, f) => arr.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});

  const medidas = {
    referencia: esLink ? fuente : basename(ref),
    analizado_s: r1(H), ancho: s.width, alto: s.height, vision,
    cambios: {
      total: eventos.length, por_minuto: r1(eventos.length / minutos),
      cortes: cortes.length, saltos_con_zoom: zoomsGolpe.length, saltos_sin_zoom: saltos.length,
      plano_medio_s: r1(mediana(planosDur)), plano_mas_corto_s: r1(Math.min(...planosDur)), plano_mas_largo_s: r1(Math.max(...planosDur)),
      lista: eventos,
    },
    zooms: {
      de_golpe: zoomsGolpe.length, suaves: suaves.length,
      por_minuto: r1((zoomsGolpe.length + suaves.length) / minutos),
      cuanto_mediana_pct: zoomsGolpe.length ? Math.round((mediana(zoomsGolpe.map((z) => Math.max(z.escala, 1 / z.escala))) - 1) * 100) : null,
      en_numeros: zoomsConPalabra.filter((z) => z.numero).length,
      lista: zoomsConPalabra, lista_suaves: suaves,
    },
    numeros: {
      total: numerosDichos.length, por_minuto: r1(numerosDichos.length / minutos),
      duran_mediana_s: r1(mediana(numerosDichos.map((x) => x.dur))),
      alto_mediana_pct: numerosDichos.length ? r1(mediana(numerosDichos.map((x) => x.alto_max)) * 100) : null,
      letra_px: numerosDichos.length ? pxLetra(mediana(numerosDichos.map((x) => x.alto_max))) : null,
      ancho_mediana_pct: numerosDichos.length ? Math.round(mediana(numerosDichos.map((x) => x.ancho_max)) * 100) : null,
      cuentan: numerosDichos.filter((x) => x.cuenta).length,
      cuando_lo_dice: numerosDichos.filter((x) => x.lo_dice).length,
      donde: contar(numerosDichos, (x) => lugarY(x.y)),
      lista: numerosDichos,
    },
    textos_grandes: {
      total: grandes.length, por_minuto: r1(grandes.length / minutos),
      duran_mediana_s: r1(mediana(grandes.map((x) => x.dur))),
      palabras_mediana: mediana(grandes.map((x) => x.palabras)),
      alto_mediana_pct: grandes.length ? Math.round(mediana(grandes.map((x) => x.alto)) * 100) : null,
      donde: contar(grandes, (x) => lugarY(x.y)),
      en_mayusculas_pct: pct(grandes.filter((x) => x.mayusculas).length, grandes.length),
      repiten_lo_dicho_pct: pct(grandes.filter((x) => x.repite_lo_dicho >= 0.5).length, grandes.length),
      con_numero: grandes.filter((x) => x.numero).length,
      lista: grandes,
    },
    subtitulos: {
      hay: subtitulos.length >= Math.max(3, minutos * 6),
      apariciones: subtitulos.length,
      palabras_mediana: mediana(subtitulos.map((x) => x.palabras)),
      alto_mediana_pct: subtitulos.length ? Math.round(mediana(subtitulos.map((x) => x.alto)) * 100) : null,
      altura_pct: subtitulos.length ? Math.round(mediana(subtitulos.map((x) => x.y)) * 100) : null,
      en_mayusculas_pct: pct(subtitulos.filter((x) => x.mayusculas).length, subtitulos.length),
    },
    textos_fijos: fijos.map((x) => ({ texto: x.texto, y: x.y, dur: x.dur })),
    cara: { en_pantalla_pct: pct(conCara.length, muestras.length), alto_mediana_pct: conCara.length ? Math.round(mediana(conCara.map((m) => m.caja[3])) * 100) : null },
    ritmo: { idioma: existsSync(join(dir, "idioma.txt")) ? readFileSync(join(dir, "idioma.txt"), "utf8").trim() : null, palabras_por_minuto: palabras.length ? Math.round(palabras.length / ((palabras[palabras.length - 1].end - palabras[0].start) / 60)) : null, pausa_mediana_s: r2(mediana(gaps)), pausas_largas: gaps.filter((g) => g > 0.35).length },
  };
  writeFileSync(join(dir, "medidas.json"), JSON.stringify(medidas, null, 1));

  // 4. hojas: un cuadro por segundo, y cuadro a cuadro los momentos clave
  const hojas = [];
  const seg = []; for (let t = 0.5; t < H - 0.05; t += 1) seg.push(+t.toFixed(2));
  for (let k = 0; k * 24 < seg.length && k < 6; k++) {
    hojas.push(hojaDeCuadros(ref, { en: seg.slice(k * 24, k * 24 + 24), salida: join(dir, `hoja-${k + 1}.jpg`), ancho: s.height > s.width ? 200 : 300 }).salida);
  }
  const momentos = [];
  for (const x of numerosDichos.slice(0, 1)) momentos.push(...[x.t0 - 0.2, x.t0, x.t0 + 0.1, x.t0 + 0.25, x.t1 - 0.15, x.t1 + 0.1]);
  for (const x of grandes.filter((g) => g.dur >= 0.5).slice(0, 2)) momentos.push(...[x.t0 - 0.25, x.t0, x.t0 + 0.12, x.t0 + 0.25, x.t1 - 0.15, x.t1 + 0.1]);
  for (const z of zoomsGolpe.slice(0, 2)) momentos.push(...[z.t - 0.2, z.t - 0.05, z.t + 0.05, z.t + 0.15, z.t + 0.3, z.t + 0.6]);
  let hojaMomentos = null;
  if (momentos.length) hojaMomentos = hojaDeCuadros(ref, { en: momentos.map((t) => +Math.max(0, Math.min(H - 0.05, t)).toFixed(2)), salida: join(dir, "momentos.jpg"), ancho: s.height > s.width ? 200 : 300 }).salida;

  // 5. resumen para leer
  const M = medidas, L = [];
  L.push(`Referencia: ${M.referencia} · ${M.analizado_s} s medidos · ${M.ancho}×${M.alto}`);
  L.push(`Cambia la imagen ${M.cambios.total} veces (${M.cambios.por_minuto} por minuto): cada plano dura ${M.cambios.plano_medio_s} s de mediana (de ${M.cambios.plano_mas_corto_s} a ${M.cambios.plano_mas_largo_s} s)`);
  if (vision) L.push(`   ${M.cambios.cortes} cortes a otro plano o b-roll · ${M.cambios.saltos_con_zoom} saltos con zoom (misma toma, la cara de golpe más grande o más chica) · ${M.cambios.saltos_sin_zoom} saltos sin zoom`);
  if (vision) {
    L.push(`Zooms: ${M.zooms.de_golpe} de golpe y ${M.zooms.suaves} suaves (${M.zooms.por_minuto} por minuto)${M.zooms.cuanto_mediana_pct !== null ? ` · cambian ${M.zooms.cuanto_mediana_pct} % de mediana` : ""} · ${M.zooms.en_numeros} caen en un número`);
    const pz = zoomsConPalabra.filter((z) => z.palabra).slice(0, 12).map((z) => `${z.t}s «${z.palabra}»`);
    if (pz.length) L.push(`   en qué palabra: ${pz.join(" · ")}`);
    L.push(`Números en pantalla: ${M.numeros.total} (${M.numeros.por_minuto} por minuto) · duran ${M.numeros.duran_mediana_s ?? "?"} s · cuando entran, la letra mide ${M.numeros.alto_mediana_pct ?? "?"} % del alto (≈ ${M.numeros.letra_px ?? "?"} px en 1080×1920) · ${M.numeros.cuentan} cuentan · ${M.numeros.cuando_lo_dice} entran cuando dice una cifra`);
    if (numerosDichos.length) L.push(`   ${Object.entries(M.numeros.donde).map(([k, v]) => `${v} ${k}`).join(", ")} · ejemplos: ${numerosDichos.slice(0, 8).map((x) => `${x.t0}s «${x.texto}» (${x.dur} s)`).join(" · ")}`);
    L.push(`Textos encima (sin contar subtítulos, números sueltos ni el texto fijo): ${M.textos_grandes.total} (${M.textos_grandes.por_minuto} por minuto) · duran ${M.textos_grandes.duran_mediana_s} s · ${M.textos_grandes.palabras_mediana ?? 0} palabras · alto de letra ${M.textos_grandes.alto_mediana_pct ?? "?"} % del cuadro · ${Object.entries(M.textos_grandes.donde).map(([k, v]) => `${v} ${k}`).join(", ") || "—"}`);
    L.push(`   ${M.textos_grandes.en_mayusculas_pct} % en mayúsculas · ${M.textos_grandes.repiten_lo_dicho_pct} % repiten lo que dice · ${M.textos_grandes.con_numero} con número`);
    const ej = grandes.slice(0, 10).map((x) => `${x.t0}s «${x.texto}» (${x.dur} s)`);
    if (ej.length) L.push(`   ejemplos: ${ej.join(" · ")}`);
    L.push(M.subtitulos.hay ? `Subtítulos: sí · ${M.subtitulos.palabras_mediana} palabras por vez · letra ${M.subtitulos.alto_mediana_pct} % del cuadro · a ${M.subtitulos.altura_pct} % de la altura · ${M.subtitulos.en_mayusculas_pct} % en mayúsculas` : "Subtítulos: no (o muy pocos)");
    if (M.textos_fijos.length) L.push(`Texto fijo todo el video: ${M.textos_fijos.map((x) => `«${x.texto}» (${lugarY(x.y)})`).join(" · ")}`);
    L.push(`Cara en pantalla: ${M.cara.en_pantalla_pct} % del tiempo · alto de cara ${M.cara.alto_mediana_pct ?? "?"} % del cuadro (lo demás es b-roll, capturas o placas)`);
  } else {
    L.push("Zooms y textos: en esta compu no se miden solos. Sacalos de las hojas (mirá cuándo la cara crece de golpe y cuándo aparece texto).");
  }
  if (M.ritmo.palabras_por_minuto) L.push(`Habla${M.ritmo.idioma ? ` (en «${M.ritmo.idioma}»)` : ""}: ${M.ritmo.palabras_por_minuto} palabras por minuto · pausa típica entre palabras ${M.ritmo.pausa_mediana_s} s · ${M.ritmo.pausas_largas} pausas de más de 0.35 s`);
  // sugerencias: cómo se traduce cada número a mi-estilo.md (Claude decide mirando las hojas)
  const sug = [];
  const cadaCambio = M.cambios.total ? H / M.cambios.total : null;
  const plano = M.cambios.plano_medio_s ?? cadaCambio;
  if (plano !== null) sug.push(`${plano < 3 || (M.ritmo.pausa_mediana_s ?? 1) < 0.08 ? "ritmo: rapido" : plano > 6 ? "ritmo: pausado" : "ritmo: medio"} (la imagen cambia cada ${r1(plano)} s de mediana${M.ritmo.pausa_mediana_s !== null ? ` y la pausa típica entre palabras es de ${M.ritmo.pausa_mediana_s} s` : ""})`);
  if (M.cambios.plano_medio_s && M.cambios.plano_medio_s < 6) {
    sug.push(`zoom_cada: ${Math.max(1.2, Math.min(6, M.cambios.plano_medio_s))} (la imagen cambia cada ${M.cambios.plano_medio_s} s; en una toma sin cortes de plano, eso se imita con un zoom al arrancar una frase, sin cortar palabras)`);
    if (M.zooms.cuanto_mediana_pct !== null) sug.push(`zoom_escala: ${Math.max(1.05, Math.min(1.3, 1 + M.zooms.cuanto_mediana_pct / 100)).toFixed(2)} (los saltos con zoom cambian ${M.zooms.cuanto_mediana_pct} %)`);
  }
  if (vision) {
    const porMin = r1((M.textos_grandes.por_minuto || 0) + (M.numeros.por_minuto || 0));
    sug.push(`densidad: ${porMin >= 15 ? "muchas" : porMin >= 7 ? "normal" : "pocas"} (${porMin} textos y números por minuto; sumá los íconos e imágenes que veas en las hojas)`);
    const durs = [...numerosDichos, ...grandes].map((x) => x.dur);
    if (durs.length) sug.push(`duracion_animaciones: ${Math.max(0.8, Math.min(3, r1(mediana(durs))))}`);
    if (M.numeros.total) sug.push(`regla: cuando dice una cifra, la cifra entra grande${M.numeros.cuentan ? " y cuenta" : ""} → grafica con forma: numero en esa palabra; tipos: sumá grafica (${M.numeros.cuando_lo_dice} de ${M.numeros.total} entran al decirla; letra de ≈ ${M.numeros.letra_px} px)`);
    if (M.textos_grandes.total >= 3) sug.push(`mayusculas: ${M.textos_grandes.en_mayusculas_pct >= 60 ? "si" : "no"}`);
    if (M.subtitulos.hay) sug.push(`captions: yo · palabras_por_subtitulo: ${Math.max(1, Math.min(4, M.subtitulos.palabras_mediana || 3))}${M.subtitulos.altura_pct ? ` · altura_subtitulos: ${Math.max(55, Math.min(76, M.subtitulos.altura_pct))}` : ""}`);
    if (M.zooms.en_numeros) sug.push(`regla: zoom cuando dice un número (${M.zooms.en_numeros} de ${M.zooms.de_golpe} zooms caen en uno)`);
    if (M.textos_fijos.length) sug.push(`regla: título fijo ${lugarY(M.textos_fijos[0].y)} todo el video (un texto con hasta el final)`);
    if (M.cara.en_pantalla_pct < 70) sug.push(`aviso: la referencia tiene ${100 - M.cara.en_pantalla_pct} % de b-roll o capturas; esta skill no los genera (solo con imágenes o capturas que pase la persona)`);
  }
  L.push("");
  L.push("Sugerencias para mi-estilo.md:");
  sug.forEach((x) => L.push(`   · ${x}`));
  medidas.sugerencias = sug;
  writeFileSync(join(dir, "medidas.json"), JSON.stringify(medidas, null, 1));
  L.push("");
  L.push(`Hojas (un cuadro por segundo): ${hojas.join(" · ")}`);
  if (hojaMomentos) L.push(`Momentos clave cuadro a cuadro (cómo entran y salen): ${hojaMomentos}`);
  writeFileSync(join(dir, "medidas.txt"), L.join("\n") + "\n");
  return { dir, medidas, texto: L.join("\n") };
}

export function main() {
  const fuente = process.argv[4];
  const r = referencia(process.argv[3], fuente, { hasta: Number(arg("--hasta", 90)), idioma: arg("--idioma", null), rehacer: tiene("--rehacer") });
  console.log(`📏 ${r.texto.split("\n").join("\n   ")}`);
  console.log(`\nMedidas completas: ${join(r.dir, "medidas.json")}`);
  console.log("Ahora: mirá las hojas, escribí las reglas en mi-estilo.md (## Reglas de la referencia) y ajustá los valores de arriba.");
}
