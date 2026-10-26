// cortar — FFmpeg saca el aire entre frases y los «eh». No toca lo que dijiste: corta aire, no frases.
//
//   node editar.mjs cortar <video> [--plan] [--silencio 0.4] [--quitar 12.3-14.1,20-21.5] [--con-muletillas]
//
//   --plan            muestra qué sacaría, sin tocar el video
//   --silencio        pausas más largas que esto (s) se acortan (default: el de mi-estilo.md)
//   --quitar          rangos extra a sacar (segundos del video preparado): arranques falsos o tomas repetidas que pida la persona
//   --con-muletillas  deja los «eh», «em», «mmm»
// Los silencios salen de dos lados: los huecos entre palabras de Whisper y la energía real del audio
// (el umbral se adapta al ruido del lugar). Manda el audio: Whisper a veces estira palabras sobre las pausas.
// Con «velocidad: 1.1» en mi-estilo.md el video cortado va 10 % más rápido, sin cambiar el tono de la voz.
// Escribe: cortado.mp4, transcript-cortado.json, cortes.json
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { rutas, duracion, arg, tiene, mmss, argGrafo } from "../lib/comun.mjs";
import { cargarPalabras, normalizar, frases } from "../lib/transcript.mjs";
import { cargarEstilo, buscarEstilo } from "../lib/estilo.mjs";

const MULETILLAS = new Set(["eh", "ehh", "ehhh", "em", "emm", "ehm", "mm", "mmm", "hmm", "hm", "um", "uh", "uhm", "erm"]);

// energía del audio en dB por ventana de 20 ms (audio.wav: 16 kHz mono de preparar)
export function energia(wavPath, paso = 0.02) {
  const buf = readFileSync(wavPath);
  let off = 12, datos = null, sr = 16000, canales = 1;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4), tam = buf.readUInt32LE(off + 4);
    if (id === "fmt ") { canales = buf.readUInt16LE(off + 10); sr = buf.readUInt32LE(off + 12); }
    if (id === "data") { datos = buf.subarray(off + 8, off + 8 + tam); break; }
    off += 8 + tam + (tam % 2);
  }
  if (!datos) throw new Error("audio.wav sin datos");
  const n = Math.floor(sr * paso) * canales;
  const db = [];
  for (let i = 0; i + n * 2 <= datos.length; i += n * 2) {
    let suma = 0;
    for (let j = 0; j < n; j++) { const x = datos.readInt16LE(i + j * 2) / 32768; suma += x * x; }
    db.push(10 * Math.log10(suma / n + 1e-10));
  }
  return { db, paso };
}

// silencios reales: por debajo del piso de ruido + margen (adentro el piso es −50 dB; afuera con viento, −27 dB)
export function silenciosPorEnergia({ db, paso }, minimo = 0.15) {
  const orden = [...db].sort((a, b) => a - b);
  const pct = (p) => orden[Math.floor((orden.length - 1) * p)];
  const piso = pct(0.1), voz = pct(0.9);
  if (voz - piso < 10) return { silencios: [], piso, voz, umbral: null };
  const umbral = piso + Math.max(6, (voz - piso) * 0.3);
  const silencios = [];
  let ini = null;
  db.forEach((x, i) => {
    if (x < umbral) { if (ini === null) ini = i; }
    else if (ini !== null) { if ((i - ini) * paso >= minimo) silencios.push({ a: ini * paso, b: i * paso }); ini = null; }
  });
  if (ini !== null && (db.length - ini) * paso >= minimo) silencios.push({ a: ini * paso, b: db.length * paso });
  return { silencios, piso, voz, umbral };
}

// Saca de un hueco todo tramo donde el audio tiene voz (con margen): así un corte por silencio nunca
// se come una palabra, aunque Whisper haya dado mal los tiempos.
function sinVoz(hueco, voz, { antes = 0.1, despues = 0.16 } = {}) {
  let partes = [{ ...hueco }];
  for (const v of voz) {
    if (v.b + despues <= hueco.a || v.a - antes >= hueco.b) continue;
    const a = v.a - antes, b = v.b + despues;
    partes = partes.flatMap((p) => {
      if (b <= p.a || a >= p.b) return [p];
      const out = [];
      if (a > p.a) out.push({ a: p.a, b: a });
      if (b < p.b) out.push({ a: b, b: p.b });
      return out;
    });
  }
  return partes;
}

// tramos con voz según la energía del audio (lo que supera el umbral, unido si hay huecos chiquitos)
export function tramosConVoz(en) {
  if (!en || en.umbral === null) return null;
  const out = [];
  let ini = null;
  en.db.forEach((x, i) => {
    if (x >= en.umbral) { if (ini === null) ini = i; }
    else if (ini !== null) { out.push({ a: ini * en.paso, b: i * en.paso }); ini = null; }
  });
  if (ini !== null) out.push({ a: ini * en.paso, b: en.db.length * en.paso });
  const unidos = [];
  for (const t of out) {
    const u = unidos[unidos.length - 1];
    if (u && t.a - u.b < 0.06) u.b = t.b;
    else unidos.push({ ...t });
  }
  return unidos.filter((t) => t.b - t.a >= 0.04);
}

export function planificar(palabras, dur, { silencio = 0.4, quitar = [], muletillas = true, silencios = null, energiaAudio = null } = {}) {
  // márgenes: antes de cada palabra y después; al final de una frase se deja respirar un poco más.
  // Con ritmo rápido el aire que queda es más corto, con pausado más largo (la voz igual queda protegida por sinVoz)
  const ritmo = Math.min(1.5, Math.max(0.6, silencio / 0.4));
  const PAD_IN = 0.08, PAD_OUT = 0.16 * ritmo, PAD_FIN_FRASE = 0.26 * ritmo, AIRE = 0.12;
  const quitadas = new Set();
  const pedidas = new Set();
  const muletillasDejadas = [];
  palabras.forEach((w, i) => {
    if (muletillas && MULETILLAS.has(normalizar(w.text))) {
      // si la muletilla está pegada a otra palabra (los tiempos se pisan), se deja: nunca cortar media palabra
      const pisa = palabras.some((o, j) => j !== i && !MULETILLAS.has(normalizar(o.text)) && Math.min(o.end, w.end) - Math.max(o.start, w.start) > 0.3 * Math.max(0.05, o.end - o.start));
      if (pisa) muletillasDejadas.push(w.text);
      else quitadas.add(i);
    }
    for (const [a, b] of quitar) if (w.start >= a - 0.02 && w.end <= b + 0.02) { quitadas.add(i); pedidas.add(i); }
  });
  const huecos = [];
  const vivas = palabras.map((w, i) => ({ ...w, i })).filter((w) => !quitadas.has(w.i));
  const padSalida = (t) => {
    const antes = vivas.filter((w) => w.start < t).pop();
    return antes && /[.!?…]$/.test(antes.text) ? PAD_FIN_FRASE : PAD_OUT;
  };
  for (let k = 0; k < vivas.length - 1; k++) {
    const a = vivas[k].end, b = vivas[k + 1].start;
    if (b - a >= silencio + AIRE) huecos.push({ a: a + padSalida(a + 0.001), b: b - PAD_IN });
  }
  if (vivas.length) {
    if (vivas[0].start - PAD_IN > 0.12) huecos.push({ a: 0, b: vivas[0].start - PAD_IN });
    const fin = vivas[vivas.length - 1].end + PAD_OUT + 0.25;
    if (dur - fin > 0.05) huecos.push({ a: fin, b: dur });
  }
  const primera = vivas.length ? vivas[0].start : 0;
  const ultima = vivas.length ? vivas[vivas.length - 1].end : dur;
  for (const s of silencios || []) {
    if (s.b - s.a < silencio + AIRE) continue;
    if (s.b <= primera || s.a >= ultima) continue;
    huecos.push({ a: s.a + padSalida(s.a), b: s.b - PAD_IN });
  }
  // los huecos de silencio no pueden tener voz adentro (los pedidos a propósito, muletillas y --quitar, sí)
  // un ruidito corto y débil donde Whisper no oyó ninguna palabra (un clic, un respiro, el viento) no se protege
  const voz = tramosConVoz(energiaAudio)?.filter((v) => {
    if (v.b - v.a >= 0.4 || energiaAudio.nivelVoz === undefined) return true;
    const pico = Math.max(...energiaAudio.db.slice(Math.floor(v.a / energiaAudio.paso), Math.ceil(v.b / energiaAudio.paso) + 1));
    return pico >= energiaAudio.nivelVoz - 12 || palabras.some((w) => w.end > v.a - 0.1 && w.start < v.b + 0.1);
  }) ?? null;
  const huecosSilencio = voz ? huecos.flatMap((h) => sinVoz(h, voz)) : huecos;
  const intencionales = [];
  palabras.forEach((w, i) => { if (quitadas.has(i)) intencionales.push({ a: w.start, b: w.end }); });
  for (const [a, b] of quitar) intencionales.push({ a, b });
  const hs = [...huecosSilencio, ...intencionales].filter((h) => h.b - h.a > 0.08).sort((x, y) => x.a - y.a);
  const unidos = [];
  for (const h of hs) {
    const u = unidos[unidos.length - 1];
    if (u && h.a <= u.b + 0.05) u.b = Math.max(u.b, h.b);
    else unidos.push({ ...h });
  }
  const segmentos = [];
  let cursor = 0;
  for (const h of unidos) { if (h.a - cursor > 0.12) segmentos.push({ a: +cursor.toFixed(3), b: +h.a.toFixed(3) }); cursor = Math.max(cursor, h.b); }
  if (dur - cursor > 0.12) segmentos.push({ a: +cursor.toFixed(3), b: +dur.toFixed(3) });
  // un pedacito suelto sin ninguna palabra que se queda (el borde de algo que se sacó) no vale un corte más
  for (let k = segmentos.length - 1; k >= 0; k--) {
    const g = segmentos[k];
    if (segmentos.length > 1 && g.b - g.a < 0.25 && !vivas.some((w) => w.end > g.a && w.start < g.b)) segmentos.splice(k, 1);
  }
  const offs = [];
  let off = 0;
  for (const s of segmentos) { offs.push(off); off += s.b - s.a; }
  const mapear = (t) => {
    for (let k = 0; k < segmentos.length; k++) {
      if (t < segmentos[k].a) return offs[k];
      if (t <= segmentos[k].b) return offs[k] + t - segmentos[k].a;
    }
    return off;
  };
  // control: cuánta VOZ de cada palabra que se queda cae en un corte (con audio) o cuánto tiempo (sin audio)
  const recortadas = [];
  const nuevas = [];
  const enCorte = (a, b) => b - a - segmentos.reduce((s, g) => s + Math.max(0, Math.min(g.b, b) - Math.max(g.a, a)), 0);
  palabras.forEach((w, i) => {
    if (quitadas.has(i)) return;
    let perdido;
    if (voz) perdido = voz.reduce((s, v) => s + (Math.min(v.b, w.end) > Math.max(v.a, w.start) ? enCorte(Math.max(v.a, w.start), Math.min(v.b, w.end)) : 0), 0);
    else perdido = enCorte(w.start, w.end) > 0.34 * (w.end - w.start) ? enCorte(w.start, w.end) : 0;
    if (perdido > 0.05) recortadas.push({ texto: w.text, t: +w.start.toFixed(2), segundos: +perdido.toFixed(2) });
    const a = mapear(w.start), b = Math.max(mapear(w.end), a + 0.05);
    nuevas.push({ text: w.text, start: +a.toFixed(3), end: +b.toFixed(3) });
  });
  const puntos = offs.slice(1).map((o) => +o.toFixed(3));
  const quitados = [];
  let prev = 0;
  for (const s of segmentos) { if (s.a - prev > 0.05) quitados.push({ a: +prev.toFixed(3), b: s.a }); prev = s.b; }
  if (dur - prev > 0.05) quitados.push({ a: +prev.toFixed(3), b: +dur.toFixed(3) });
  return {
    segmentos, palabras: nuevas, puntos, quitados, final: +off.toFixed(3),
    muletillas: [...quitadas].filter((i) => !pedidas.has(i)).map((i) => palabras[i].text),
    pedidas: [...pedidas].sort((x, y) => x - y).map((i) => palabras[i].text),
    muletillasDejadas, recortadas,
  };
}

// la voz más rápida (velocidad > 1): los tiempos del transcript y de los cortes se achican igual que el video
function acelerarTiempos(palabras, v) {
  if (v <= 1.001) return palabras;
  return palabras.map((w) => ({ ...w, start: +(w.start / v).toFixed(3), end: +(w.end / v).toFixed(3) }));
}

export function cortar(video, opts = {}) {
  const R = rutas(video);
  if (!existsSync(R.fuente)) throw new Error("Falta preparar el video primero: node editar.mjs preparar <video>");
  const est = cargarEstilo(buscarEstilo(R.proyecto, opts.estilo));
  const silencio = opts.silencio ?? est.ajustes.silencio_max;
  const muletillas = opts.muletillas ?? est.ajustes.quitar_muletillas;
  const palabras = cargarPalabras(R.transcript);
  const dur = duracion(R.fuente);
  const v = opts.velocidad ?? est.ajustes.velocidad ?? 1;
  if (!silencio && v <= 1.001) {
    // el estilo dice no cortar: el cortado es el mismo video
    copyFileSync(R.fuente, R.cortado);
    writeFileSync(R.transcriptCortado, JSON.stringify(palabras, null, 1));
    writeFileSync(R.cortes, JSON.stringify({ original: +dur.toFixed(3), final: +dur.toFixed(3), silencio: 0, puntos: [], segmentos: [{ a: 0, b: +dur.toFixed(3) }], quitados: [], muletillas: [] }, null, 1));
    return { resumen: "sin cortes (silencio_max: 0 en mi-estilo.md)", quitados: [], recortadas: [], puntos: [] };
  }
  let silencios = null, nota = "", energiaAudio = null;
  if (existsSync(R.audio) && !opts.soloTranscript) {
    const en = energia(R.audio);
    const r = silenciosPorEnergia(en);
    silencios = r.silencios;
    energiaAudio = { ...en, umbral: r.umbral, nivelVoz: r.voz };
    nota = r.umbral === null ? " · el audio no tiene contraste voz/ruido: corté solo por el transcript" : "";
  }
  const plan = silencio
    ? planificar(palabras, dur, { silencio, quitar: opts.quitar || [], muletillas, silencios, energiaAudio })
    : { palabras, segmentos: [{ a: 0, b: +dur.toFixed(3) }], puntos: [], quitados: [], muletillas: [], muletillasDejadas: [], recortadas: [], final: +dur.toFixed(3) };
  const pct = dur > 0 ? ((dur - plan.final) / dur) * 100 : 0;
  const resumen = `de ${dur.toFixed(1)} s a ${plan.final.toFixed(1)} s · ${plan.puntos.length} cortes · ${(dur - plan.final).toFixed(1)} s de aire fuera (${pct.toFixed(0)} %)${plan.muletillas.length ? ` · muletillas fuera: ${plan.muletillas.join(", ")}` : ""}${plan.pedidas?.length ? ` · sacado a pedido (${plan.pedidas.length} palabras): «${plan.pedidas.join(" ")}»` : ""}${plan.muletillasDejadas.length ? ` · muletillas que dejé (pegadas a otra palabra): ${plan.muletillasDejadas.join(", ")}` : ""}${nota}`;
  const resumenV = v > 1.001 ? `${resumen} · voz ${Math.round((v - 1) * 100)} % más rápida (velocidad: ${v}): queda en ${(plan.final / v).toFixed(1)} s` : resumen;
  if (opts.plan) return { ...plan, resumen: resumenV, pct };
  const n = plan.segmentos.length;
  const sinCambios = n === 1 && plan.segmentos[0].a < 0.01 && plan.segmentos[0].b > dur - 0.01 && v <= 1.001;
  if (sinCambios) {
    // no hay aire que sacar: el cortado es el mismo video (no se recodifica)
    copyFileSync(R.fuente, R.cortado);
    writeFileSync(R.transcriptCortado, JSON.stringify(plan.palabras, null, 1));
    writeFileSync(join(R.trabajo, "transcript-cortado.txt"), frases(plan.palabras).map((f) => `[${mmss(f.start)}–${mmss(f.end)}] ${f.texto}`).join("\n") + "\n");
    writeFileSync(R.cortes, JSON.stringify({ original: +dur.toFixed(3), final: +dur.toFixed(3), silencio, puntos: [], segmentos: plan.segmentos, quitados: [], muletillas: [] }, null, 1));
    return { ...plan, resumen: resumen + " · no había aire que sacar: el video queda igual", pct };
  }
  const F = 0.008; // micro fundido de audio en cada corte: evita el «click»
  const partes = plan.segmentos.map((s, k) =>
    `[0:v]trim=start=${s.a}:end=${s.b},setpts=PTS-STARTPTS[v${k}];` +
    `[0:a]atrim=start=${s.a}:end=${s.b},asetpts=PTS-STARTPTS,afade=t=in:d=${F},afade=t=out:st=${Math.max(0, s.b - s.a - F).toFixed(3)}:d=${F}[a${k}];`).join("");
  // con velocidad > 1: setpts acelera la imagen (y fps=30 la deja pareja) y atempo la voz, sin cambiarle el tono
  const concat = plan.segmentos.map((_, k) => `[v${k}][a${k}]`).join("") + `concat=n=${n}:v=1:a=1` +
    (v > 1.001 ? `[vc][ac];[vc]setpts=PTS/${v},fps=30[v];[ac]atempo=${v}[a]` : "[v][a]");
  const grafo = join(R.trabajo, "cortes.ffgraph");
  writeFileSync(grafo, partes + concat);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", R.fuente, ...argGrafo(grafo), "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-g", "30", "-keyint_min", "30", "-sc_threshold", "0", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", R.cortado], { stdio: "inherit" });
  const palabrasFinal = acelerarTiempos(plan.palabras, v);
  const puntos = v > 1.001 ? plan.puntos.map((x) => +(x / v).toFixed(3)) : plan.puntos;
  writeFileSync(R.transcriptCortado, JSON.stringify(palabrasFinal, null, 1));
  writeFileSync(join(R.trabajo, "transcript-cortado.txt"), frases(palabrasFinal).map((f) => `[${mmss(f.start)}–${mmss(f.end)}] ${f.texto}`).join("\n") + "\n");
  // segmentos y quitados quedan en segundos del video preparado; puntos y final, en los del video cortado
  writeFileSync(R.cortes, JSON.stringify({ original: +dur.toFixed(3), final: +(plan.final / v).toFixed(3), silencio, velocidad: v, puntos, segmentos: plan.segmentos, quitados: plan.quitados, muletillas: plan.muletillas }, null, 1));
  return { ...plan, resumen: resumenV, pct };
}

export function main() {
  const video = process.argv[3];
  const quitar = (arg("--quitar") || "").split(",").filter(Boolean).map((r) => r.split("-").map(Number));
  const s = arg("--silencio");
  const r = cortar(video, {
    plan: tiene("--plan"), silencio: s === null ? undefined : Number(s), quitar,
    muletillas: tiene("--con-muletillas") ? false : undefined, soloTranscript: tiene("--solo-transcript"),
    estilo: arg("--estilo"),
  });
  console.log(`${tiene("--plan") ? "📋 Plan" : "✅ Cortado"}: ${r.resumen}`);
  if (tiene("--plan")) r.quitados.forEach((q) => console.log(`   − ${q.a.toFixed(2)} → ${q.b.toFixed(2)}  (${(q.b - q.a).toFixed(2)} s)`));
  if (r.recortadas?.length) console.log(`⚠️  Palabras que pierden voz en un corte (revisalas escuchando): ${r.recortadas.map((x) => `«${x.texto}» ${x.t}s (${x.segundos}s)`).join(", ")}`);
  else console.log("   Control: ninguna palabra pierde voz en los cortes.");
  if (!tiene("--plan") && r.pct > 25) console.log("⚠️  Saqué más del 25 %: mostrale el plan a la persona por si alguna pausa era a propósito.");
}
