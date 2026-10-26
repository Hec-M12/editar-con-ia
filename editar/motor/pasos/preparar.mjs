// preparar — deja el video listo para trabajar y lo transcribe con Whisper (local, gratis).
//
//   node editar.mjs preparar <video> [--modelo small] [--idioma es] [--sin-transcribir]
//
// 1. Normaliza el video: vertical 1080×1920, horizontal 1920×1080 o cuadrado 1080×1080, 30 fps.
//    Si viene en HDR (iPhone), lo pasa a SDR para que los colores no salgan lavados.
// 2. El audio queda como vino: solo se sube o baja el volumen parejo si está muy bajo o muy alto.
// 3. Whisper anota cada palabra con su segundo exacto → transcript.json (+ transcript.txt para leer).
// Escribe todo en <carpeta del video>/edicion/<nombre>/
import { existsSync, writeFileSync, readFileSync, copyFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { rutas, asegurarCarpeta, ffprobe, duracion, hyperframes, arg, tiene, mmss } from "../lib/comun.mjs";
import { cargarEstilo, buscarEstilo } from "../lib/estilo.mjs";
import { arreglarPalabras, frases } from "../lib/transcript.mjs";
import { buscarWhisper, transcribirFino } from "../lib/whisper.mjs";

const MODELOS = ["tiny", "base", "small", "medium", "large-v3", "large-v3-turbo", "tiny.en", "base.en", "small.en", "medium.en"];

function medirAudio(archivo) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", archivo, "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" });
  const txt = r.stderr || "";
  const I = Number((txt.match(/I:\s+(-?[\d.]+) LUFS(?![\s\S]*I:\s+-?[\d.]+ LUFS)/) || [])[1]);
  const TP = Number((txt.match(/True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS/) || [])[1]);
  return { I: Number.isFinite(I) ? I : null, TP: Number.isFinite(TP) ? TP : null };
}

// Ganancia lineal solo si el volumen está fuera de -20…-12 LUFS. Nunca compresión: la voz suena como la grabaste.
function planAudio(src) {
  const { I, TP } = medirAudio(src);
  if (I === null) return { filtro: [], nota: "no pude medirlo; queda como vino" };
  let g = 0;
  if (I < -20 || I > -12) g = -16 - I;
  if (TP !== null && TP + g > -1) g = -1 - TP;
  g = Math.round(g * 10) / 10;
  const base = `${I.toFixed(1)} LUFS`;
  if (Math.abs(g) < 0.3) return { filtro: [], nota: `${base} → queda como vino` };
  return { filtro: ["-af", `volume=${g}dB`], nota: `${base} → ${g > 0 ? "+" : ""}${g} dB parejo` };
}

function tieneFiltro(nombre) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" });
  return new RegExp(`\\s${nombre}\\s`).test(r.stdout || "");
}

export function preparar(video, { modelo = null, idioma = null, sinTranscribir = false, estilo = null } = {}) {
  if (!video || !existsSync(video)) throw new Error(`No encuentro el video «${video}»`);
  const R = rutas(video);
  asegurarCarpeta(R.trabajo);
  const est = cargarEstilo(buscarEstilo(R.proyecto, estilo));
  modelo = modelo || est.ajustes.whisper || "small";
  idioma = idioma || est.ajustes.idioma || "es";
  if (!MODELOS.includes(modelo)) throw new Error(`Modelo de Whisper «${modelo}» no existe. Opciones: tiny, base, small, medium, large-v3-turbo`);
  if (modelo.endsWith(".en") && idioma !== "en") throw new Error(`El modelo ${modelo} solo entiende inglés. Para «${idioma}» usá ${modelo.replace(".en", "")}.`);

  const info = ffprobe(R.original, ["-show_entries", "format=duration:stream=codec_type,codec_name,pix_fmt,r_frame_rate,width,height,color_transfer,color_space,color_primaries,color_range:stream_side_data=rotation"]);
  const v = info.streams.find((s) => s.codec_type === "video");
  const a = info.streams.find((s) => s.codec_type === "audio");
  if (!v) throw new Error("El archivo no tiene video");
  if (!a) throw new Error("El archivo no tiene audio: ¿se exportó sin sonido?");
  const rot = Math.abs(Number(v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation || 0));
  const ancho = rot === 90 || rot === 270 ? v.height : v.width;
  const alto = rot === 90 || rot === 270 ? v.width : v.height;
  const r = ancho / alto;
  const [W, H, formato] = r < 0.8 ? [1080, 1920, "vertical"] : r > 1.25 ? [1920, 1080, "horizontal"] : [1080, 1080, "cuadrado"];
  const avisos = [];
  const exacto = { vertical: 9 / 16, horizontal: 16 / 9, cuadrado: 1 }[formato];
  if (Math.abs(r - exacto) / exacto > 0.04) avisos.push(`el video es ${ancho}×${alto}: lo recorto al centro para dejarlo ${formato} (${W}×${H})`);

  const hdr = ["arib-std-b67", "smpte2084"].includes(v.color_transfer);
  // primero se achica (4K → 1080) y después se convierte el color: así la parte pesada trabaja con 4 veces menos píxeles
  let filtroVideo = `fps=30,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},format=yuv420p`;
  if (hdr) {
    if (tieneFiltro("zscale")) {
      const matriz = { bt2020nc: "2020_ncl", bt2020c: "2020_cl", bt709: "709" }[v.color_space] || "2020_ncl";
      const primarios = { bt2020: "2020", bt709: "709" }[v.color_primaries] || "2020";
      const rango = v.color_range === "pc" ? "full" : "limited";
      filtroVideo = `fps=30,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
        `zscale=tin=${v.color_transfer}:min=${matriz}:pin=${primarios}:rin=${rango}:t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p`;
      avisos.push("venía en HDR: lo pasé a SDR (si los colores se ven raros, exportalo en SDR desde tu app)");
    } else avisos.push("viene en HDR y tu FFmpeg no tiene zscale: los colores pueden salir lavados. Exportalo en SDR desde tu app");
  }

  const t0 = Date.now();
  // si ya se normalizó en una corrida anterior (por ejemplo, para cambiar el modelo de Whisper), no se repite
  const previo = existsSync(R.fuente) && existsSync(R.audio) && existsSync(R.meta) && statSync(R.fuente).mtimeMs > statSync(R.original).mtimeMs && !tiene("--rehacer");
  if (previo) {
    const meta = JSON.parse(readFileSync(R.meta, "utf8"));
    console.log(`▸ El video ya estaba listo de antes (${Number(meta.duracion).toFixed(1)} s): no lo vuelvo a procesar (--rehacer para repetirlo)`);
    (meta.avisos || []).forEach((x) => { if (!avisos.includes(x)) avisos.push(x); });
  }
  const { filtro, nota } = previo ? { filtro: [], nota: "" } : planAudio(R.original);
  // si el video ya viene justo como hace falta (H.264, ${W}×${H}, 30 fps, SDR, sin rotar) no se recodifica
  const yaSirve = v.codec_name === "h264" && v.pix_fmt === "yuv420p" && v.width === W && v.height === H && !rot && !hdr && v.r_frame_rate === "30/1";
  if (!previo) console.log(`▸ ${yaSirve ? "El video ya viene en formato: lo copio sin recodificar" : `Normalizando → ${W}×${H} · 30 fps`} · audio: ${nota}`);
  const normalizar = (hw) => execFileSync("ffmpeg", [
    "-v", "error", "-y", ...(hw ? ["-hwaccel", "videotoolbox"] : []), "-i", R.original, "-map", "0:v:0", "-map", "0:a:0",
    ...(yaSirve ? ["-c:v", "copy"] : [
      "-vf", filtroVideo,
      "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-g", "30", "-keyint_min", "30", "-sc_threshold", "0",
      "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
    ]),
    ...filtro, "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", R.fuente,
  ], { stdio: hw ? "pipe" : "inherit" });
  // en Mac el chip decodifica el video (5 veces más rápido con tomas 4K del iPhone); si falla, va sin ayuda
  if (!previo) {
    if (!yaSirve && process.platform === "darwin") {
      try { normalizar(true); } catch { normalizar(false); }
    } else normalizar(false);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", R.fuente, "-vn", "-ac", "1", "-ar", "16000", R.audio]);
  }
  const dur = duracion(R.fuente);
  writeFileSync(R.meta, JSON.stringify({ original: R.original, ancho: W, alto: H, formato, duracion: +dur.toFixed(3), hdr, idioma, modelo, avisos }, null, 2));
  if (!previo) console.log(`▸ Video listo en ${((Date.now() - t0) / 1000).toFixed(0)} s (${dur.toFixed(1)} s de video)`);

  if (sinTranscribir) {
    console.log(existsSync(R.transcript) ? "✅ Listo · transcript anterior conservado" : "✅ Video listo · sin transcribir (corré preparar de nuevo para transcribir)");
    return { R, dur, avisos };
  }
  if (!buscarWhisper() && process.platform !== "darwin") {
    throw new Error("No encuentro Whisper (whisper-cli). Mirá la sección «Instalar» del README: en Windows bajá whisper.cpp y poné la ruta en HYPERFRAMES_WHISPER_PATH.");
  }
  console.log(`▸ Transcribiendo con Whisper ${modelo} (${idioma}, local)…${dur > 60 ? " puede tardar unos minutos" : ""}`);
  const t1 = Date.now();
  // 1) whisper.cpp con DTW (cada palabra alineada con el audio) si el modelo ya está bajado;
  // 2) si no, HyperFrames lo baja y transcribe, y después se repite con DTW; 3) si DTW no corre, quedan esos tiempos
  let crudo = transcribirFino(R.audio, { modelo, idioma, dir: R.trabajo });
  let alineado = !!crudo;
  if (!crudo) {
    const res = hyperframes(["transcribe", R.audio, "-d", R.trabajo, "--json", "--model", modelo, "--language", idioma, "--engine", "whisper"], { cwd: R.trabajo });
    const linea = String(res.stdout || "").trim().split("\n").filter((l) => l.startsWith("{")).pop();
    let ok = null;
    try { ok = JSON.parse(linea); } catch { /* sale abajo */ }
    if (!ok || !ok.ok) {
      throw new Error(`Whisper falló:\n${String(res.stdout || "").slice(-800)}\n${String(res.stderr || "").slice(-800)}`);
    }
    crudo = transcribirFino(R.audio, { modelo, idioma, dir: R.trabajo });
    alineado = !!crudo;
    if (!crudo) crudo = JSON.parse(readFileSync(R.transcript, "utf8"));
  }
  writeFileSync(join(R.trabajo, "transcript-whisper.json"), JSON.stringify(crudo, null, 1));
  if (!alineado) avisos.push("los tiempos de cada palabra son aproximados (tu whisper.cpp no tiene DTW): si un subtítulo o una animación cae corrida, actualizá whisper.cpp");
  const palabras = arreglarPalabras(crudo, idioma);
  writeFileSync(R.transcript, JSON.stringify(palabras, null, 1));
  writeFileSync(join(R.trabajo, "transcript.txt"), frases(palabras).map((f) => `[${mmss(f.start)}–${mmss(f.end)}] ${f.texto}`).join("\n") + "\n");
  console.log(`✅ Listo: ${dur.toFixed(1)} s · ${palabras.length} palabras · Whisper tardó ${((Date.now() - t1) / 1000).toFixed(0)} s`);
  console.log(`   Transcript: ${join(R.trabajo, "transcript.txt")}`);
  avisos.forEach((x) => console.log(`⚠️  ${x}`));
  return { R, dur, palabras: palabras.length, avisos };
}

export function main() {
  const video = process.argv[3];
  preparar(video, { modelo: arg("--modelo"), idioma: arg("--idioma"), sinTranscribir: tiene("--sin-transcribir"), estilo: arg("--estilo") });
}
