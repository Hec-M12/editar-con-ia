// Whisper local con el segundo exacto de cada palabra.
//
// whisper.cpp reparte los tiempos dentro de cada frase: en una toma cruda (pausas largas, arranques en falso,
// viento) una palabra puede quedar corrida varios segundos. Con DTW, whisper.cpp alinea cada palabra contra
// el audio y el tiempo queda donde realmente se dice. Acá se corre whisper-cli con DTW y se ajusta el final de
// cada palabra con la energía del audio. Si algo de eso no está (otra versión de whisper.cpp, otro modelo),
// quedan los tiempos de siempre.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { energia, silenciosPorEnergia, tramosConVoz } from "../pasos/cortar.mjs";

export function buscarWhisper() {
  if (process.env.HYPERFRAMES_WHISPER_PATH && existsSync(process.env.HYPERFRAMES_WHISPER_PATH)) return process.env.HYPERFRAMES_WHISPER_PATH;
  const cmd = process.platform === "win32" ? "where" : "which";
  for (const nombre of ["whisper-cli", "whisper-cpp"]) {
    const r = spawnSync(cmd, [nombre], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split(/\r?\n/)[0];
  }
  for (const p of ["/opt/homebrew/bin/whisper-cli", "/usr/local/bin/whisper-cli"]) if (existsSync(p)) return p;
  return null;
}

// nombre del modelo para DTW en whisper.cpp
const DTW = {
  tiny: "tiny", base: "base", small: "small", medium: "medium",
  "tiny.en": "tiny.en", "base.en": "base.en", "small.en": "small.en", "medium.en": "medium.en",
  "large-v3": "large.v3", "large-v3-turbo": "large.v3.turbo",
};

// el modelo que ya bajó HyperFrames (la primera transcripción lo baja)
export function modeloLocal(modelo) {
  const dirs = [process.env.HYPERFRAMES_WHISPER_MODELS, join(homedir(), ".cache", "hyperframes", "whisper", "models")].filter(Boolean);
  for (const d of dirs) {
    const f = join(d, `ggml-${modelo}.bin`);
    if (existsSync(f)) return f;
  }
  return null;
}

// piezas de texto de whisper-cli → palabras (una pieza que empieza con espacio arranca palabra nueva)
function palabrasDePiezas(j) {
  const out = [];
  for (const seg of j.transcription || []) {
    let nuevaFrase = true;
    for (const tk of seg.tokens || []) {
      const t = tk.text || "";
      if (/^\s*\[.*\]\s*$/.test(t)) continue; // [_BEG_], [_TT_150], [Música]…
      if (typeof tk.t_dtw !== "number" || tk.t_dtw < 0) return null; // DTW no corrió
      const ini = tk.t_dtw / 100;
      if (nuevaFrase || /^\s/.test(t) || !out.length) out.push({ text: t.trim(), start: ini });
      else out[out.length - 1].text += t;
      nuevaFrase = false;
    }
  }
  return out.filter((w) => w.text);
}

// el final de cada palabra: hasta que arranca la siguiente, sin pasar lo que dura decirla, y cortado donde
// el audio ya no tiene voz
function ponerFinales(palabras, voz) {
  for (let i = 0; i < palabras.length; i++) {
    const w = palabras[i];
    if (i > 0 && w.start < palabras[i - 1].start + 0.03) w.start = +(palabras[i - 1].start + 0.03).toFixed(3);
  }
  palabras.forEach((w, i) => {
    const sig = palabras[i + 1];
    const letras = w.text.replace(/[^\p{L}\p{N}]/gu, "").length || 1;
    const dura = Math.min(1.0, Math.max(0.14, 0.075 * letras + 0.06));
    let fin = w.start + dura;
    if (sig) fin = sig.start - w.start < dura + 0.08 ? sig.start : Math.min(fin, sig.start - 0.02);
    if (voz) {
      // si la voz sigue un poco más (vocal larga), se estira hasta donde termina; si se corta antes, ahí termina
      const tramo = voz.find((v) => v.a <= w.start + 0.15 && v.b >= w.start);
      if (tramo && !(sig && sig.start <= tramo.b)) fin = Math.max(w.start + 0.12, Math.min(fin + 0.35, tramo.b + 0.04, sig ? sig.start - 0.02 : Infinity));
    }
    w.end = +Math.max(w.start + 0.08, fin).toFixed(3);
    w.start = +w.start.toFixed(3);
  });
  return palabras;
}

// palabras con tiempos alineados al audio, o null si no se puede (y se quedan los tiempos de siempre)
// info (opcional) se llena con el idioma que Whisper detectó, si se le pasó idioma «auto»
export function transcribirFino(wav, { modelo, idioma, dir, info = null }) {
  const bin = buscarWhisper();
  const m = modeloLocal(modelo);
  if (!bin || !m || !DTW[modelo]) return null;
  const base = join(dir, "whisper-dtw");
  const correr = (extra) => spawnSync(bin, ["-m", m, "-f", wav, "-l", idioma, "-ojf", "-of", base, "-dtw", DTW[modelo], "-np", ...extra], { encoding: "utf8", maxBuffer: 64 << 20 });
  // las versiones nuevas necesitan apagar flash attention para DTW; las viejas no conocen la opción
  let r = correr(["-nfa"]);
  if (r.status !== 0) r = correr([]);
  const archivo = base + ".json";
  if (r.status !== 0 || !existsSync(archivo)) return null;
  let j = null;
  try { j = JSON.parse(readFileSync(archivo, "utf8")); } catch { /* abajo */ }
  rmSync(archivo, { force: true });
  if (info && j) info.idioma = j.result?.language || idioma;
  const palabras = j && palabrasDePiezas(j);
  if (!palabras || !palabras.length) return null;
  let voz = null;
  try {
    const en = energia(wav);
    const umbral = silenciosPorEnergia(en).umbral;
    voz = tramosConVoz({ ...en, umbral });
  } catch { /* sin energía, solo los tiempos de DTW */ }
  return ponerFinales(palabras, voz);
}
