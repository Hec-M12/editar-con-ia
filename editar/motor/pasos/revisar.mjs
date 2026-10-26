// revisar — antes de renderizar: HyperFrames revisa el código (lint) y saca una foto de cada animación.
//
//   node editar.mjs revisar <video> [--sin-fotos]
//
// Deja revision/hoja.jpg: una foto por animación, en su mejor momento, con marcas para mirar rápido:
//   amarillo = la cara (nunca se tapa) · celeste = la caja de la animación · rosa = el subtítulo de ese momento
//   (con «captions: app», rojo = la franja que queda libre para los tuyos)
// Si el lint tiene errores, no hay render: arreglá y volvé a armar.
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { rutas, leerJson, hyperframes, tiene, asegurarCarpeta } from "../lib/comun.mjs";
import { crearZonas } from "../lib/zonas.mjs";
import { cargarEstilo, buscarEstilo } from "../lib/estilo.mjs";

export function lint(pub) {
  const r = hyperframes(["lint", pub, "--json"], { cwd: pub });
  const txt = String(r.stdout || "");
  let j = null;
  try { j = JSON.parse(txt.slice(txt.indexOf("{"))); } catch { /* abajo */ }
  if (!j) return { ok: r.status === 0, errores: r.status === 0 ? [] : [`lint no devolvió JSON: ${txt.slice(-400)} ${String(r.stderr || "").slice(-400)}`], avisos: [] };
  // avisos que solo importan para el editor visual de HyperFrames, no para el video
  const IGNORAR = new Set(["nested_structure_needs_subcomposition"]);
  const hallazgos = (j.findings || j.results?.flatMap((x) => x.findings || []) || []).filter((f) => !IGNORAR.has(f.code));
  const fmt = (f) => `${f.code || "?"}: ${f.message || ""}${f.selector ? ` (${f.selector})` : ""}`;
  return {
    ok: (j.errorCount ?? hallazgos.filter((f) => f.severity === "error").length) === 0,
    errores: hallazgos.filter((f) => f.severity === "error").map(fmt),
    avisos: hallazgos.filter((f) => f.severity === "warning").map(fmt),
  };
}

function momentos(armado) {
  const ts = armado.elementos
    .filter((e) => e.caja)
    // gráficas y listas se miran casi al final (ya completas); el resto apenas terminó de entrar
    .map((e) => ({ t: +(["grafica", "lista"].includes(e.tipo) ? Math.max(e.t0 + 0.6, e.t1 - 0.45) : e.t0 + Math.min(1.1, Math.max(0.55, (e.t1 - e.t0) * 0.55))).toFixed(2), id: e.id }));
  if (!ts.length || ts[0].t > 1.5) ts.unshift({ t: 0.5, id: "inicio" });
  return ts.slice(0, 16);
}

export function revisar(video, { fotos = true } = {}) {
  const R = rutas(video);
  const armado = leerJson(R.armado, null);
  if (!armado || !existsSync(join(R.publico, "index.html"))) throw new Error("Falta armar primero: node editar.mjs armar <video>");
  const L = lint(R.publico);
  const salida = { lint: L, hoja: null, avisos: [...armado.advertencias] };
  if (!L.ok || !fotos) return salida;

  // fotos del momento en que cada animación ya entró
  const dir = asegurarCarpeta(R.revision);
  const dirFotos = join(dir, "fotos");
  rmSync(dirFotos, { recursive: true, force: true });
  mkdirSync(dirFotos, { recursive: true });
  const ms = momentos(armado);
  const r = hyperframes(["snapshot", R.publico, "--at", ms.map((m) => m.t).join(","), "--no-end", "--describe", "false", "-o", dirFotos], { cwd: R.publico });
  const pngs = existsSync(dirFotos) ? readdirSync(dirFotos).filter((f) => f.endsWith(".png")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
  if (!pngs.length) throw new Error(`No salieron las fotos de la revisión:\n${String(r.stdout || "").slice(-600)}\n${String(r.stderr || "").slice(-600)}`);

  // marcas: cara, cajas activas y franja de subtítulos
  const est = cargarEstilo(buscarEstilo(R.proyecto));
  const caras = leerJson(R.caras, { muestras: [] });
  const zv = armado.zoom_video || { tramos: [], zooms: [] };
  const transformar = (a, b) => [
    ...zv.tramos.filter((x) => x.b > a && x.a < b).map((x) => ({ s: x.s, ox: x.o[0], oy: x.o[1] })),
    ...zv.zooms.filter((x) => x.t1 > a && x.t0 < b).map((x) => ({ s: x.s, ox: x.o[0], oy: x.o[1] })),
  ];
  const zonas = crearZonas({ W: armado.ancho, H: armado.alto, caras, captions: est.ajustes.captions, transformar, ajustes: est.ajustes });
  const tmp = join(dir, ".marcas");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const tapan = [];
  pngs.forEach((png, i) => {
    const m = ms[i] || { t: 0, id: "?" };
    const filtros = [];
    const c = zonas.cajaCara(m.t - 0.3, m.t + 0.3);
    if (c.detectada) filtros.push(`drawbox=x=${Math.round(c.x0)}:y=${Math.round(c.nucleo.y0)}:w=${Math.round(c.x1 - c.x0)}:h=${Math.round(c.nucleo.y1 - c.nucleo.y0)}:color=yellow@0.9:t=6`);
    const capAhora = (armado.captions?.grupos || []).find((g) => g.t0 <= m.t && g.t1 > m.t);
    if (capAhora) filtros.push(`drawbox=x=${Math.round((armado.ancho - capAhora.ancho) / 2)}:y=${Math.round(capAhora.y - capAhora.alto / 2)}:w=${capAhora.ancho}:h=${capAhora.alto}:color=magenta@0.9:t=5`);
    else if (zonas.franja) filtros.push(`drawbox=x=0:y=${zonas.franja[0]}:w=iw:h=${zonas.franja[1] - zonas.franja[0]}:color=red@0.8:t=4`);
    for (const e of armado.elementos.filter((x) => x.caja && x.t0 <= m.t && x.t1 >= m.t)) {
      filtros.push(`drawbox=x=${e.caja.x}:y=${e.caja.y}:w=${e.caja.w}:h=${e.caja.h}:color=cyan@0.9:t=5`);
      // el control usa el mismo tramo con el que armar eligió el lugar
      const ce = zonas.cajaCara(e.t0, e.t1);
      if (ce.detectada) {
        const ix = Math.min(e.caja.x + e.caja.w, ce.x1) - Math.max(e.caja.x, ce.x0);
        const iy = Math.min(e.caja.y + e.caja.h, ce.nucleo.y1) - Math.max(e.caja.y, ce.nucleo.y0);
        if (ix > 10 && iy > 10 && !tapan.includes(e.id)) tapan.push(e.id);
      }
    }
    filtros.push(`scale=360:-2`, `drawbox=x=0:y=0:w=iw:h=30:color=black@0.7:t=fill`, `drawtext=text='${m.t}s ${m.id}':x=8:y=6:fontsize=18:fontcolor=white`);
    const dst = join(tmp, `m${String(i).padStart(2, "0")}.png`);
    let rr = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", join(dirFotos, png), "-vf", filtros.join(","), dst]);
    if (rr.status !== 0) rr = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", join(dirFotos, png), "-vf", filtros.filter((f) => !f.startsWith("drawtext")).join(","), dst]);
  });
  const n = readdirSync(tmp).length;
  const cols = Math.min(4, n), filas = Math.ceil(n / cols);
  const hoja = join(dir, "hoja.jpg");
  spawnSync("ffmpeg", ["-v", "error", "-y", "-framerate", "1", "-i", join(tmp, "m%02d.png"), "-vf", `tile=${cols}x${filas}:padding=6:margin=6:color=0x111111`, "-frames:v", "1", "-q:v", "3", hoja]);
  rmSync(tmp, { recursive: true, force: true });
  if (tapan.length) salida.avisos.push(`estas animaciones pisan la cara: ${tapan.join(", ")} (cambiales la zona o el momento)`);
  // subtítulos que pisan la cara (ojos a mentón)
  const capsCara = (armado.captions?.grupos || []).filter((g) => {
    const c = zonas.cajaCara(g.t0, g.t1);
    if (!c.detectada) return false;
    const x0 = (armado.ancho - g.ancho) / 2, y0 = g.y - g.alto / 2;
    return Math.min(x0 + g.ancho, c.x1) - Math.max(x0, c.x0) > 10 && Math.min(y0 + g.alto, c.nucleo.y1) - Math.max(y0, c.nucleo.y0) > 10;
  });
  if (capsCara.length) salida.avisos.push(`${capsCara.length} subtítulo(s) pisan la cara (desde ${capsCara[0].t0} s): bajá altura_subtitulos o achicá tamano_subtitulos`);
  salida.hoja = existsSync(hoja) ? hoja : null;
  salida.fotos = dirFotos;
  return salida;
}

export function main() {
  const r = revisar(process.argv[3], { fotos: !tiene("--sin-fotos") });
  if (r.lint.errores.length) {
    console.log("❌ El lint de HyperFrames encontró errores (arreglalos y volvé a armar):");
    r.lint.errores.forEach((e) => console.log("   · " + e));
  } else console.log("✅ Lint sin errores");
  if (r.lint.avisos.length) { console.log("   Avisos del lint:"); r.lint.avisos.forEach((e) => console.log("   · " + e)); }
  if (r.avisos.length) { console.log("⚠️  Para revisar:"); r.avisos.forEach((a) => console.log("   · " + a)); }
  if (r.hoja) console.log(`🖼  Mirá esta hoja antes de renderizar: ${r.hoja}\n   (amarillo = cara · celeste = animación · rosa = subtítulo · rojo = franja libre para tus subtítulos)`);
  if (r.lint.errores.length) process.exit(1);
}
