// sonidos — vuelve a poner los efectos de sonido sin renderizar de nuevo (tarda segundos).
//
//   node editar.mjs sonidos <video> [--borrador]
//
// Para las correcciones de sonido («más fuerte», «sin whoosh», «menos efectos», «dejá mi voz como estaba»):
// se cambia mi-estilo.md (efectos, volumen_efectos, efectos_quitar, voz) y se corre esto. Parte de la versión sin
// efectos que dejó render (edicion/<nombre>/render-sin-efectos.mp4) y reescribe <nombre>-editado.mp4.
// Si cambiaste el storyboard o los subtítulos, esto no alcanza: corré armar y render.
import { existsSync, readFileSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { rutas, leerJson, tiene } from "../lib/comun.mjs";
import { cargarEstilo, buscarEstilo } from "../lib/estilo.mjs";
import { ponerSonidos } from "../lib/sonidos.mjs";

export function sonidos(video, { borrador = false } = {}) {
  const R = rutas(video);
  const armado = leerJson(R.armado, null);
  const base = borrador ? join(R.trabajo, "borrador-sin-efectos.mp4") : R.sinEfectos;
  if (!armado || !existsSync(base)) throw new Error(`Falta renderizar primero: node editar.mjs render <video>${borrador ? " --borrador" : ""}`);
  const salida = borrador ? join(R.proyecto, `${basename(R.original, extname(R.original))}-borrador.mp4`) : R.final;
  const est = cargarEstilo(buscarEstilo(R.proyecto));
  const r = ponerSonidos({ armado, ajustes: est.ajustes, base, salida, trabajo: R.trabajo, json: R.sonidos, txt: R.sonidosTxt });
  return { ...r, salida, txt: R.sonidosTxt };
}

export function main() {
  const r = sonidos(process.argv[3], { borrador: tiene("--borrador") });
  console.log(`🔊 ${r.efectos} efectos de sonido (efectos: ${r.nivel}) · voz ${r.voz}`);
  r.avisos.forEach((a) => console.log(`   · ${a}`));
  console.log(readFileSync(r.txt, "utf8").split("\n").slice(1).filter(Boolean).map((l) => "   " + l).join("\n"));
  console.log(`🎬 ${r.salida}`);
}
