// cuadros — una hoja con fotos del video y su segundo, para MIRAR (Claude la abre como imagen).
//
//   node editar.mjs cuadros <video.mp4> [--cada 3 | --en 1.5,4,9.2] [--grilla] [-o hoja.jpg]
//
// Sirve para dos cosas: ver el encuadre antes de planear (dónde está la cara, qué hay de fondo) y
// revisar el video final (que las animaciones no tapen la cara y que se lean).
// --grilla dibuja líneas cada 10 % para poder decir dónde está la cara en números.
import { existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { join, dirname, basename, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { duracion, arg, tiene } from "../lib/comun.mjs";

export function hojaDeCuadros(video, { cada = null, en = null, grilla = false, salida = null, ancho = 270 } = {}) {
  video = resolve(video);
  if (!existsSync(video)) throw new Error(`No encuentro ${video}`);
  const dur = duracion(video);
  let tiempos;
  if (en && en.length) tiempos = en;
  else {
    const paso = cada || Math.max(1, dur / 10);
    tiempos = [];
    for (let t = Math.min(0.5, dur / 2); t < dur - 0.05; t += paso) tiempos.push(+t.toFixed(2));
  }
  tiempos = tiempos.filter((t) => t >= 0 && t < dur).slice(0, 24);
  salida = resolve(salida || join(dirname(video), `${basename(video, extname(video))}-cuadros.jpg`));
  const tmp = join(dirname(salida), `.cuadros-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  tiempos.forEach((t, i) => {
    const base = [`scale=${ancho}:-2`];
    if (grilla) base.push("drawgrid=width=iw/10:height=ih/10:thickness=1:color=white@0.35");
    const rotulo = `${t.toFixed(1)}s`;
    const conTexto = [...base, "drawbox=x=0:y=0:w=iw:h=26:color=black@0.7:t=fill", `drawtext=text='${rotulo}':x=8:y=5:fontsize=17:fontcolor=white`];
    const dst = join(tmp, `c${String(i).padStart(2, "0")}.png`);
    let r = spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", conTexto.join(","), dst]);
    if (r.status !== 0) r = spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", base.join(","), dst]);
  });
  const celdas = readdirSync(tmp).filter((f) => f.endsWith(".png")).sort();
  if (!celdas.length) throw new Error("No pude sacar cuadros del video");
  const cols = Math.min(celdas.length, celdas.length > 8 ? 6 : 4);
  const filas = Math.ceil(celdas.length / cols);
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-framerate", "1", "-i", join(tmp, "c%02d.png"), "-vf", `tile=${cols}x${filas}:padding=6:margin=6:color=0x111111`, "-frames:v", "1", "-q:v", "3", salida]);
  rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0) throw new Error(`No pude armar la hoja: ${String(r.stderr).slice(-300)}`);
  return { salida, tiempos };
}

export function main() {
  const video = process.argv[3];
  const en = arg("--en") ? arg("--en").split(",").map(Number).filter((n) => !Number.isNaN(n)) : null;
  const cada = arg("--cada") ? Number(arg("--cada")) : null;
  const r = hojaDeCuadros(video, { cada, en, grilla: tiene("--grilla"), salida: arg("-o") });
  console.log(`🖼  ${r.salida}  (${r.tiempos.length} cuadros: ${r.tiempos.join(", ")} s)`);
}
