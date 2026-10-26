// Cosas que usan todos los pasos: rutas, la carpeta de trabajo de cada video, FFmpeg y HyperFrames.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve, dirname, basename, extname } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const MOTOR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SKILL = resolve(MOTOR, "..");

// Nombre de carpeta sin espacios ni tildes: «Mi Video Final (1).mov» → «mi-video-final-1»
export function slug(texto) {
  return String(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "video";
}

// Cada video tiene su carpeta de trabajo al lado: <carpeta del video>/edicion/<nombre>/
export function rutas(video) {
  const original = resolve(video);
  const proyecto = dirname(original);
  const nombre = slug(basename(original, extname(original)));
  const trabajo = join(proyecto, "edicion", nombre);
  return {
    original,
    proyecto,
    nombre,
    trabajo,
    fuente: join(trabajo, "fuente.mp4"),
    audio: join(trabajo, "audio.wav"),
    transcript: join(trabajo, "transcript.json"),
    cortado: join(trabajo, "cortado.mp4"),
    transcriptCortado: join(trabajo, "transcript-cortado.json"),
    cortes: join(trabajo, "cortes.json"),
    caras: join(trabajo, "caras.json"),
    storyboard: join(trabajo, "storyboard.json"),
    publico: join(trabajo, "public"),
    armado: join(trabajo, "armado.json"),
    revision: join(trabajo, "revision"),
    meta: join(trabajo, "video.json"),
    final: join(proyecto, `${basename(original, extname(original))}-editado.mp4`),
  };
}

export function asegurarCarpeta(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function arg(nombre, def = null) {
  const i = process.argv.indexOf(nombre);
  return i > -1 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}
export const tiene = (nombre) => process.argv.includes(nombre);

export function ffprobe(archivo, campos) {
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", ...campos, "-of", "json", archivo]).toString());
}

export function duracion(archivo) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", archivo]).toString().trim();
  return Number(out);
}

// El CLI de HyperFrames que instaló la skill (versión fija en motor/package.json).
export function binHyperframes() {
  const bin = join(MOTOR, "node_modules", "hyperframes", "bin", "hyperframes.mjs");
  if (!existsSync(bin)) {
    throw new Error(`Falta instalar el motor. Corré: node "${join(MOTOR, "editar.mjs")}" instalar`);
  }
  return bin;
}

// Sin telemetría y sin mandar cuadros a servicios de afuera (snapshot usa Gemini si hay GEMINI_API_KEY).
export function entornoHyperframes(extra = {}) {
  const env = { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1", ...extra };
  delete env.GEMINI_API_KEY;
  delete env.GOOGLE_API_KEY;
  return env;
}

export function hyperframes(args, { cwd = MOTOR, env = {}, stdio = "pipe", encoding = "utf8" } = {}) {
  return spawnSync(process.execPath, [binHyperframes(), ...args], { cwd, env: entornoHyperframes(env), stdio, encoding, maxBuffer: 256 << 20 });
}

export function leerJson(archivo, def = undefined) {
  try {
    return JSON.parse(readFileSync(archivo, "utf8"));
  } catch (err) {
    if (def !== undefined) return def;
    throw err;
  }
}

export function mmss(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
