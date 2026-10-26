// caras — dónde está la cara, para que las animaciones nunca la tapen.
//
//   node editar.mjs caras <video>
//
// En Mac la detecta sola con Vision (caras.swift, se compila la primera vez). En Windows o Linux, o si
// falla, deja la hoja cuadros.jpg con una grilla cada 10 % y Claude escribe caras.json mirándola:
//   { "fuente": "a-ojo", "fija": [x, y, ancho, alto] }   ← valores 0-1 desde arriba a la izquierda
// Siempre deja cuadros.jpg: es la foto del encuadre que Claude mira antes de planear.
import { existsSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { rutas, MOTOR } from "../lib/comun.mjs";
import { hojaDeCuadros } from "./cuadros.mjs";

export function compilarSwift() {
  if (process.platform !== "darwin") return null;
  const fuente = join(MOTOR, "caras.swift");
  const bin = join(tmpdir(), `editar-caras-${Math.round(statSync(fuente).mtimeMs)}`);
  if (existsSync(bin)) return bin;
  const w = spawnSync(process.platform === "win32" ? "where" : "which", ["swiftc"], { encoding: "utf8" });
  if (w.status !== 0) return null;
  console.log("▸ Compilando el detector de caras (solo la primera vez)…");
  const r = spawnSync("swiftc", ["-O", "-suppress-warnings", fuente, "-o", bin], { encoding: "utf8" });
  return r.status === 0 && existsSync(bin) ? bin : null;
}

export function caras(video) {
  const R = rutas(video);
  const fuenteVideo = existsSync(R.cortado) ? R.cortado : R.fuente;
  if (!existsSync(fuenteVideo)) throw new Error("Falta preparar el video primero: node editar.mjs preparar <video>");
  const hoja = hojaDeCuadros(fuenteVideo, { grilla: true, salida: join(R.trabajo, "cuadros.jpg") });
  const bin = compilarSwift();
  if (bin) {
    const r = spawnSync(bin, [fuenteVideo, R.caras, "0.5"], { encoding: "utf8" });
    if (r.status === 0 && existsSync(R.caras)) {
      const j = JSON.parse(readFileSync(R.caras, "utf8"));
      const con = (j.muestras || []).filter((m) => m.caja).length;
      console.log(`✅ Caras (Vision): cara en ${con} de ${(j.muestras || []).length} muestras (una cada medio segundo)`);
      if (!con) console.log("⚠️  No vi ninguna cara: mirá cuadros.jpg y, si hay una persona, escribí caras.json a ojo.");
      console.log(`🖼  Encuadre: ${hoja.salida}`);
      return { modo: "vision", con };
    }
  }
  if (!existsSync(R.caras)) writeFileSync(R.caras, JSON.stringify({ fuente: "pendiente", fija: null }, null, 1));
  console.log("👀 Detección automática no disponible en esta compu.");
  console.log(`   Abrí ${hoja.salida} (grilla cada 10 %) y escribí en ${R.caras}:`);
  console.log('   { "fuente": "a-ojo", "fija": [x, y, ancho, alto] }  con valores 0-1 de la cara (frente a mentón)');
  return { modo: "manual", hoja: hoja.salida };
}

export function main() {
  caras(process.argv[3]);
}
