#!/usr/bin/env node
// editar — el motor de la skill. Whisper anota cada palabra, FFmpeg corta el aire, HyperFrames convierte
// código en animaciones y Claude dirige a los tres.
//
//   node editar.mjs <paso> <video> [opciones]
//
//   instalar                 revisa FFmpeg, Node y Whisper; instala HyperFrames, GSAP y Three.js
//   preparar  <video>        normaliza el video y lo transcribe con Whisper   [--modelo small] [--idioma es]
//   cortar    <video>        saca el aire entre frases y los «eh»             [--plan] [--silencio 0.4] [--quitar 3.2-4.1]
//   caras     <video>        dónde está la cara (para no taparla) + foto del encuadre
//   referencia <video> <ref> mide cómo está editado un video que te gusta (archivo o link) [--hasta 90] [--idioma es]
//   armar     <video>        storyboard.json → composición de HyperFrames
//   revisar   <video>        lint + fotos de cada animación (revision/hoja.jpg)
//   render    <video>        el MP4 final al lado de tu video                 [--borrador]
//   cuadros   <archivo.mp4>  hoja de fotos de cualquier video                 [--cada 2] [--en 1,5.5]
//   estado    <video>        qué pasos ya están hechos
//   componentes              las animaciones que se pueden pedir en el storyboard
import { existsSync } from "node:fs";
import { join } from "node:path";
import { rutas, leerJson } from "./lib/comun.mjs";
import { buscarEstilo } from "./lib/estilo.mjs";

const PASOS = ["instalar", "preparar", "cortar", "caras", "referencia", "armar", "revisar", "render", "cuadros"];

function estado(video) {
  const R = rutas(video);
  const estilo = buscarEstilo(R.proyecto);
  const hay = (f) => existsSync(f);
  const filas = [
    ["estilo (mi-estilo.md)", estilo || null],
    ["preparar (transcript.txt)", hay(R.transcript) ? join(R.trabajo, "transcript.txt") : null],
    ["cortar (transcript-cortado.txt)", hay(R.cortado) ? join(R.trabajo, "transcript-cortado.txt") : null],
    ["caras (cuadros.jpg)", hay(R.caras) ? join(R.trabajo, "cuadros.jpg") : null],
    ["storyboard.json", hay(R.storyboard) ? R.storyboard : null],
    ["armar (armado.json)", hay(R.armado) ? R.armado : null],
    ["revisar (hoja.jpg)", hay(join(R.revision, "hoja.jpg")) ? join(R.revision, "hoja.jpg") : null],
    ["render (final)", hay(R.final) ? R.final : null],
  ];
  console.log(`Video: ${R.original}\nCarpeta de trabajo: ${R.trabajo}`);
  for (const [n, f] of filas) console.log(`${f ? "✅" : "·· "} ${n}${f ? `  ${f}` : ""}`);
  const sig = filas.find(([, f]) => !f);
  if (sig) console.log(`\nSigue: ${sig[0]}`);
  const r = leerJson(join(R.trabajo, "render.json"), null);
  if (r) console.log(`Último render: ${r.segundos_render} s para ${r.duracion_video} s de video`);
}

async function componentes() {
  const { COMPONENTES } = await import("./pasos/armar.mjs");
  for (const [tipo, c] of Object.entries(COMPONENTES)) {
    console.log(`\n■ ${tipo} — ${c.resumen}`);
    for (const [k, v] of Object.entries(c.params || {})) console.log(`    ${k}: ${v}`);
  }
  console.log("\nTodos llevan: id, tipo, ancla (frase exacta del transcript cortado), porque. Opcionales: hasta (frase donde sale), duracion, zona (auto|arriba|abajo|izquierda|derecha), ocurrencia.");
}

const [paso, video] = process.argv.slice(2);
try {
  if (!paso || paso === "ayuda" || paso === "--help") {
    console.log("Uso: node editar.mjs <paso> <video> [opciones]\nPasos: instalar, preparar, cortar, caras, armar, revisar, render, cuadros, estado, componentes");
  } else if (paso === "estado") {
    if (!video) throw new Error("Falta el video: node editar.mjs estado <video>");
    estado(video);
  } else if (paso === "componentes") {
    await componentes();
  } else if (PASOS.includes(paso)) {
    if (paso !== "instalar" && !video) throw new Error(`Falta el video: node editar.mjs ${paso} <video>`);
    const mod = await import(`./pasos/${paso}.mjs`);
    await mod.main();
  } else {
    throw new Error(`No conozco el paso «${paso}». Pasos: instalar, ${PASOS.slice(1).join(", ")}, estado, componentes`);
  }
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}
