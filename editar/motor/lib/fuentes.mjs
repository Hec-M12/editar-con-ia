// Fuentes: baja de Google Fonts la que pidió la persona (solo letras latinas) y la deja junto a la
// composición, así el render no depende de internet. Guarda una copia en ~/.cache/editar-skill/fuentes
// para no bajarla de nuevo. Si no hay internet o la fuente no existe, usa una de reemplazo y avisa.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { slug } from "./comun.mjs";

const CACHE = join(homedir(), ".cache", "editar-skill", "fuentes");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const PESOS = ["400;700;800;900", "400;700;900", "400;700", "400", null];

async function bajarCss(familia) {
  for (const pesos of PESOS) {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(familia).replace(/%20/g, "+")}${pesos ? `:wght@${pesos}` : ""}&display=swap`;
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
      if (r.ok) return await r.text();
      if (r.status !== 400) return null;
    } catch {
      return null;
    }
  }
  return null;
}

// Devuelve { css, archivos:[{nombre, ruta}], familia, aviso }
export async function prepararFuente(familia, destino) {
  const id = slug(familia);
  const dirCache = join(CACHE, id);
  const indice = join(dirCache, "fuente.json");
  let datos = null;
  if (existsSync(indice)) {
    try { datos = JSON.parse(readFileSync(indice, "utf8")); } catch { datos = null; }
  }
  if (!datos) {
    const css = await bajarCss(familia);
    if (!css) return { css: "", archivos: [], familia: null, aviso: `no pude bajar la fuente «${familia}» de Google Fonts (¿sin internet o el nombre no existe?): uso una de reemplazo` };
    const caras = [];
    const re = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
    let m;
    const bloques = [];
    while ((m = re.exec(css))) bloques.push({ subset: m[1], cuerpo: m[2] });
    if (!bloques.length) {
      const re2 = /@font-face\s*\{([^}]*)\}/g;
      while ((m = re2.exec(css))) bloques.push({ subset: "todo", cuerpo: m[1] });
    }
    mkdirSync(dirCache, { recursive: true });
    for (const b of bloques) {
      if (!["latin", "latin-ext", "todo"].includes(b.subset)) continue;
      const peso = (b.cuerpo.match(/font-weight:\s*(\d+)/) || [])[1] || "400";
      const estilo = (b.cuerpo.match(/font-style:\s*(\w+)/) || [])[1] || "normal";
      const url = (b.cuerpo.match(/url\(([^)]+)\)/) || [])[1];
      const rango = (b.cuerpo.match(/unicode-range:\s*([^;]+);?/) || [])[1];
      if (!url) continue;
      const ext = url.includes(".woff2") ? "woff2" : url.includes(".ttf") ? "ttf" : "woff";
      const nombre = `${id}-${peso}-${estilo}-${b.subset}.${ext}`;
      try {
        const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
        if (!r.ok) continue;
        writeFileSync(join(dirCache, nombre), Buffer.from(await r.arrayBuffer()));
        caras.push({ nombre, peso, estilo, rango: rango ? rango.trim() : null, formato: ext === "ttf" ? "truetype" : ext });
      } catch { /* sigue con las demás */ }
    }
    if (!caras.length) return { css: "", archivos: [], familia: null, aviso: `la fuente «${familia}» no tiene letras latinas en Google Fonts: uso una de reemplazo` };
    datos = { familia, caras };
    writeFileSync(indice, JSON.stringify(datos, null, 1));
  }
  mkdirSync(destino, { recursive: true });
  const css = datos.caras.map((c) => {
    copyFileSync(join(dirCache, c.nombre), join(destino, c.nombre));
    return `@font-face{font-family:"${datos.familia}";font-style:${c.estilo};font-weight:${c.peso};font-display:block;src:url("fuentes/${c.nombre}") format("${c.formato}");${c.rango ? `unicode-range:${c.rango};` : ""}}`;
  }).join("\n");
  return { css, archivos: datos.caras.map((c) => c.nombre), familia: datos.familia, aviso: null };
}
