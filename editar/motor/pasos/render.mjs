// render — HyperFrames convierte la composición en el MP4 final, con tu voz tal cual.
//
//   node editar.mjs render <video> [--borrador] [--workers N]
//
// Deja <nombre>-editado.mp4 al lado de tu video (con --borrador: <nombre>-borrador.mp4, más rápido y liviano).
// En compus con poca memoria renderiza por tramos con un Chrome nuevo en cada uno; si un intento falla,
// el siguiente retoma desde el último tramo terminado y el tercero apaga la GPU de Chrome.
// Todo lo que dice HyperFrames queda en edicion/<nombre>/render.log.
import { existsSync, rmSync, renameSync, writeFileSync, appendFileSync, openSync, closeSync, statSync, readFileSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import os from "node:os";
import { rutas, leerJson, binHyperframes, entornoHyperframes, arg, tiene, duracion } from "../lib/comun.mjs";
import { lint } from "./revisar.mjs";

export function render(video, { borrador = false, workers = null } = {}) {
  const R = rutas(video);
  const armado = leerJson(R.armado, null);
  if (!armado || !existsSync(join(R.publico, "index.html"))) throw new Error("Falta armar primero: node editar.mjs armar <video>");
  if (armado.errores?.length) throw new Error("El armado tiene errores: corré armar de nuevo y arreglalos");
  const L = lint(R.publico);
  if (!L.ok) throw new Error("El lint de HyperFrames tiene errores; no renderizo:\n   · " + L.errores.join("\n   · "));

  const salida = borrador ? join(R.proyecto, `${basename(R.original, extname(R.original))}-borrador.mp4`) : R.final;
  const temporal = join(R.trabajo, "renderizando.mp4");
  if (existsSync(temporal)) rmSync(temporal);
  const pocaMemoria = os.totalmem() <= 8.6 * 2 ** 30;
  const args = [binHyperframes(), "render", R.publico, "-o", temporal, "--quality", borrador ? "draft" : "looks"];
  if (workers) args.push("--workers", String(workers));
  else if (pocaMemoria) args.push("--workers", "1");
  const env = entornoHyperframes({
    HF_SEGMENTED_CAPTURE: "true",
    HF_SEGMENT_FRAMES: process.env.HF_SEGMENT_FRAMES || "450",
    HF_SEGMENT_BROWSER_RECYCLE: process.env.HF_SEGMENT_BROWSER_RECYCLE || "1",
  });
  const log = join(R.trabajo, "render.log");
  writeFileSync(log, "");
  const correr = (extra, etiqueta) => {
    appendFileSync(log, `\n== ${etiqueta} · ${new Date().toISOString()}\n`);
    const fd = openSync(log, "a");
    const r = spawnSync(process.execPath, [...args, ...extra], { cwd: R.publico, env, stdio: ["ignore", fd, fd] });
    closeSync(fd);
    appendFileSync(log, `== ${etiqueta} · salió ${r.status}${r.signal ? " · señal " + r.signal : ""}\n`);
    return r.status === 0 && existsSync(temporal);
  };
  console.log(`▸ Renderizando ${armado.duracion} s de video${pocaMemoria ? " (modo poca memoria: 1 Chrome a la vez)" : ""}… (el avance queda en ${log})`);
  const t0 = Date.now();
  let intentos = 1, gpu = "auto";
  let ok = correr([], "intento 1");
  if (!ok) { intentos = 2; ok = correr(["--resume"], "intento 2 (retoma)"); }
  if (!ok) { intentos = 3; gpu = "software"; ok = correr(["--resume", "--no-browser-gpu"], "intento 3 (sin GPU, retoma)"); }
  const segundos = (Date.now() - t0) / 1000;
  if (!ok) {
    const lineas = readFileSync(log, "utf8").split("\n").filter((l) => l.trim() && !/Streaming frame|\[Render:trace\]/.test(l));
    const errores = lineas.filter((l) => /error|fail|killed|timeout|exceed|abort|ENOMEM|señal|stalled/i.test(l));
    throw new Error(`El render falló (log completo en ${log}):\n` + (errores.length ? errores : lineas).slice(-20).join("\n"));
  }
  const streams = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", temporal]).toString();
  if (!/audio/.test(streams)) throw new Error(`El render salió sin audio (${temporal}).`);
  const dur = duracion(temporal);
  if (Math.abs(dur - armado.duracion) > 0.5) console.log(`⚠️  El render dura ${dur.toFixed(2)} s y el video armado ${armado.duracion} s`);
  renameSync(temporal, salida);
  const info = {
    fecha: new Date().toISOString(), salida, borrador, duracion_video: armado.duracion,
    segundos_render: +segundos.toFixed(1), veces_tiempo_real: +(segundos / armado.duracion).toFixed(2),
    mb: +(statSync(salida).size / 1e6).toFixed(1), intentos, gpu,
    maquina: `${os.cpus()[0]?.model || "?"} · ${os.arch()} · ${Math.round(os.totalmem() / 2 ** 30)} GB`,
  };
  writeFileSync(join(R.trabajo, "render.json"), JSON.stringify(info, null, 2));
  return info;
}

export function main() {
  const i = render(process.argv[3], { borrador: tiene("--borrador"), workers: arg("--workers") });
  console.log(`🎬 ${i.salida}`);
  console.log(`   ${i.duracion_video} s de video en ${i.segundos_render} s (${i.veces_tiempo_real}× tiempo real) · ${i.mb} MB · ${i.maquina}`);
  console.log(`   Revisalo: node editar.mjs cuadros "${i.salida}" --cada 2`);
}
