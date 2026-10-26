// instalar — revisa que estén FFmpeg, Node 22+ y Whisper, e instala el motor (HyperFrames, GSAP, Three.js).
//
//   node editar.mjs instalar
//
// Solo hace falta la primera vez (o si cambiaste de compu). No instala nada fuera de la carpeta de la
// skill: si falta FFmpeg o Whisper, te dice cómo instalarlo según tu sistema.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { MOTOR, entornoHyperframes } from "../lib/comun.mjs";
import { fuenteSonidos } from "../lib/sonidos.mjs";

const SO = process.platform === "darwin" ? "mac" : process.platform === "win32" ? "windows" : "linux";
const COMO = {
  ffmpeg: {
    mac: "brew install ffmpeg",
    windows: "winget install Gyan.FFmpeg   (después cerrá y abrí la terminal)",
    linux: "sudo apt install ffmpeg   (o el gestor de tu distro)",
  },
  whisper: {
    mac: "brew install whisper-cpp",
    windows: "bajá whisper-bin-x64.zip de github.com/ggml-org/whisper.cpp/releases, descomprimilo y poné la ruta de whisper-cli.exe en la variable de entorno HYPERFRAMES_WHISPER_PATH",
    linux: "compilá whisper.cpp: git clone https://github.com/ggml-org/whisper.cpp && cd whisper.cpp && cmake -B build && cmake --build build -j --config Release, y poné build/bin/whisper-cli en tu PATH",
  },
};

function existe(cmd, args = ["-version"]) {
  const r = spawnSync(cmd, args, { encoding: "utf8", shell: process.platform === "win32" });
  return r.status === 0 ? (r.stdout || r.stderr || "").split("\n")[0].trim() : null;
}

function buscarWhisper() {
  if (process.env.HYPERFRAMES_WHISPER_PATH && existsSync(process.env.HYPERFRAMES_WHISPER_PATH)) return process.env.HYPERFRAMES_WHISPER_PATH;
  const r = spawnSync(process.platform === "win32" ? "where" : "which", ["whisper-cli"], { encoding: "utf8" });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split(/\r?\n/)[0];
  for (const p of ["/opt/homebrew/bin/whisper-cli", "/usr/local/bin/whisper-cli"]) if (existsSync(p)) return p;
  return null;
}

export function instalar() {
  const faltan = [];
  const nodeMayor = Number(process.versions.node.split(".")[0]);
  console.log(`${nodeMayor >= 22 ? "✅" : "❌"} Node ${process.versions.node}${nodeMayor >= 22 ? "" : " (hace falta 22 o más nuevo: nodejs.org)"}`);
  if (nodeMayor < 22) faltan.push("Node 22+");
  const ff = existe("ffmpeg"), fp = existe("ffprobe");
  console.log(`${ff && fp ? "✅" : "❌"} FFmpeg${ff ? ` · ${ff.replace(/^ffmpeg version /, "").split(" ")[0]}` : `: falta. Instalalo con: ${COMO.ffmpeg[SO]}`}`);
  if (!ff || !fp) faltan.push("FFmpeg");
  const wh = buscarWhisper();
  console.log(`${wh ? "✅" : "❌"} Whisper (whisper.cpp)${wh ? ` · ${wh}` : `: falta. ${COMO.whisper[SO]}`}`);
  if (!wh) faltan.push("Whisper");
  const gb = os.totalmem() / 2 ** 30;
  console.log(`ℹ️  Memoria: ${gb.toFixed(0)} GB → modelo de Whisper recomendado: ${gb >= 15 ? "medium (o small si querés más velocidad)" : "small"}`);
  if (faltan.length && faltan.includes("Node 22+")) throw new Error("Instalá Node 22 o más nuevo y volvé a correr instalar.");

  if (!existsSync(join(MOTOR, "node_modules", "hyperframes"))) {
    console.log("▸ Instalando el motor (HyperFrames, GSAP y Three.js)… tarda uno o dos minutos la primera vez");
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const r = spawnSync(npm, ["install", "--no-audit", "--no-fund", "--loglevel", "error"], { cwd: MOTOR, stdio: "inherit", shell: process.platform === "win32" });
    if (r.status !== 0) throw new Error("npm install falló (¿hay internet?). Probá de nuevo.");
  }
  console.log("✅ Motor instalado");
  // el Chrome con el que HyperFrames dibuja cada cuadro (se baja una vez, ~100 MB)
  const b = spawnSync(process.execPath, [join(MOTOR, "node_modules", "hyperframes", "bin", "hyperframes.mjs"), "browser", "ensure"], { cwd: MOTOR, env: entornoHyperframes(), encoding: "utf8" });
  console.log(b.status === 0 ? "✅ Chrome para renderizar listo" : `⚠️  No pude preparar el Chrome de HyperFrames todavía; se baja solo en el primer render.\n${String(b.stdout || "").slice(-300)}${String(b.stderr || "").slice(-300)}`);
  // los efectos de sonido: los que trae HyperFrames (Pixabay); si no están, se arman con FFmpeg en el primer render
  const sfx = fuenteSonidos();
  console.log(sfx.tipo === "sinteticos"
    ? "⚠️  Efectos de sonido: no encontré los de HyperFrames; uso unos de reemplazo hechos con FFmpeg (suenan más simples)"
    : `✅ Efectos de sonido listos (${sfx.tipo === "carpeta" ? "tu carpeta de EDITAR_SFX" : "los que trae HyperFrames, de Pixabay"})`);
  if (faltan.length) {
    console.log(`\n❌ Falta: ${faltan.join(", ")}. Instalalo y volvé a correr: node editar.mjs instalar`);
    return { ok: false, faltan };
  }
  console.log("\n🎬 Todo listo. Pasale a Claude tu video: «editá mi-video.mp4»");
  return { ok: true, faltan };
}

export function main() {
  const r = instalar();
  if (!r.ok) process.exit(1);
}
