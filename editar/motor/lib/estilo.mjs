// Lee mi-estilo.md (el archivo de estilo de la persona, en la carpeta de su proyecto) y lo vuelve ajustes.
// El bloque de arriba (entre ---) tiene líneas «clave: valor  # comentario». Lo de abajo es prosa:
// referencias, lo que dijo la persona y las Reglas que salen de cada corrección (Claude las lee enteras).
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

export const DEFAULTS = {
  ritmo: "medio",            // rapido | medio | pausado
  silencio_max: 0.4,         // pausas más largas que esto (s) se acortan · 0 = no cortar
  quitar_muletillas: true,   // saca «eh», «em», «mmm»
  zoom_en_cortes: true,      // zoom leve alternado en cada corte (disimula el salto)
  zoom_escala: 1.08,
  zoom_cada: 0,              // segundos entre saltos de zoom aunque no haya cortes (0 = solo en los cortes)
  duracion_animaciones: 0,   // segundos que dura cada animación (0 = lo normal de cada tipo)
  palabras_por_subtitulo: 4, // con captions: yo
  altura_subtitulos: 68,     // a qué altura van los subtítulos (% desde arriba)
  tipos: ["texto", "icono", "grafica"], // texto | icono | grafica | lista | 3d | imagen
  densidad: "normal",        // pocas | normal | muchas
  energia: "media",          // calma | media | alta
  entrada: "pop",            // pop | sube | mascara | maquina
  color_texto: "#FFFFFF",
  color_acento: "#FFD60A",
  color_panel: "#111111",
  fuente: "Montserrat",
  tamano_texto: 1.0,         // multiplicador: 1.3 = 30 % más grande
  mayusculas: false,
  panel: false,              // fondo detrás del texto grande
  sombra: true,
  captions: "app",           // yo (los pone la skill) | app (los pone la persona después: se deja libre la franja) | no
  idioma: "es",
  whisper: "small",          // tiny | base | small | medium | large-v3-turbo
};

// segundos mínimos entre una animación y la siguiente, según cuántas quiere la persona
export const SEPARACION = { pocas: 8, normal: 4.5, muchas: 2.5 };
export const SILENCIO_POR_RITMO = { rapido: 0.25, medio: 0.4, pausado: 0.7 };

const COLORES_NOMBRE = {
  blanco: "#FFFFFF", negro: "#111111", amarillo: "#FFD60A", rojo: "#FF3B30", verde: "#34C759",
  azul: "#0A84FF", celeste: "#64D2FF", naranja: "#FF9F0A", rosado: "#FF5FA2", rosa: "#FF5FA2",
  morado: "#AF52DE", violeta: "#8E5CFF", lila: "#C3A6FF", gris: "#8E8E93", dorado: "#E8B923",
  turquesa: "#30D5C8", fucsia: "#FF2D95", crema: "#FFF4D6",
};

function valor(crudo) {
  let v = crudo.trim();
  if (!v.length) return "";
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v.startsWith("[") && v.endsWith("]")) {
    return v.slice(1, -1).split(",").map((x) => valor(x)).filter((x) => x !== "");
  }
  const low = v.toLowerCase();
  if (["si", "sí", "true", "yes"].includes(low)) return true;
  if (["no", "false"].includes(low)) return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

// quita el comentario «# …» que no esté dentro de comillas (los colores #FFFFFF van entre comillas)
function sinComentario(linea) {
  let dentro = null;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if ((c === '"' || c === "'") && dentro === null) dentro = c;
    else if (c === dentro) dentro = null;
    else if (c === "#" && dentro === null && (i === 0 || /\s/.test(linea[i - 1]))) return linea.slice(0, i);
  }
  return linea;
}

export function leerFrontmatter(texto) {
  const m = texto.match(/^﻿?---\s*\r?\n([\s\S]*?)\r?\n---\s*(\r?\n|$)/);
  if (!m) return { datos: {}, prosa: texto };
  const datos = {};
  for (const linea of m[1].split(/\r?\n/)) {
    const limpia = sinComentario(linea).trim();
    if (!limpia) continue;
    const k = limpia.indexOf(":");
    if (k < 1) continue;
    datos[limpia.slice(0, k).trim()] = valor(limpia.slice(k + 1));
  }
  return { datos, prosa: texto.slice(m[0].length) };
}

export function normalizarColor(c, def) {
  if (!c) return def;
  const s = String(c).trim();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(s)) return s.length === 4 ? "#" + [...s.slice(1)].map((x) => x + x).join("") : s;
  const n = COLORES_NOMBRE[s.toLowerCase()];
  return n || def;
}

// Busca mi-estilo.md: la ruta que se pase, o la carpeta del video, o sus carpetas de arriba.
export function buscarEstilo(desde, explicito = null) {
  if (explicito) return existsSync(resolve(explicito)) ? resolve(explicito) : null;
  let dir = resolve(desde);
  for (let i = 0; i < 4; i++) {
    const f = join(dir, "mi-estilo.md");
    if (existsSync(f)) return f;
    const arriba = dirname(dir);
    if (arriba === dir) break;
    dir = arriba;
  }
  return null;
}

export function cargarEstilo(archivo) {
  const crudo = archivo && existsSync(archivo) ? readFileSync(archivo, "utf8") : "";
  const { datos, prosa } = leerFrontmatter(crudo);
  const e = { ...DEFAULTS, ...datos };
  // el ritmo pone el umbral de silencio si la persona no lo fijó a mano
  if (datos.silencio_max === undefined && SILENCIO_POR_RITMO[e.ritmo] !== undefined) e.silencio_max = SILENCIO_POR_RITMO[e.ritmo];
  if (!Array.isArray(e.tipos)) e.tipos = String(e.tipos).split(/[\s,]+/).filter(Boolean);
  e.tipos = e.tipos.map((t) => (String(t).toLowerCase() === "graficos" || String(t).toLowerCase() === "gráficos" ? "grafica" : String(t).toLowerCase()))
    .map((t) => (t === "iconos" || t === "íconos" ? "icono" : t === "3d" || t === "objeto3d" ? "3d" : t));
  e.color_texto = normalizarColor(e.color_texto, DEFAULTS.color_texto);
  e.color_acento = normalizarColor(e.color_acento, DEFAULTS.color_acento);
  e.color_panel = normalizarColor(e.color_panel, DEFAULTS.color_panel);
  e.tamano_texto = Math.max(0.5, Math.min(2.5, Number(e.tamano_texto) || 1));
  e.silencio_max = Math.max(0, Number(e.silencio_max) || 0);
  e.zoom_escala = Math.max(1, Math.min(1.3, Number(e.zoom_escala) || 1.08));
  e.zoom_cada = Math.max(0, Math.min(20, Number(e.zoom_cada) || 0));
  e.duracion_animaciones = Math.max(0, Math.min(10, Number(e.duracion_animaciones) || 0));
  e.palabras_por_subtitulo = Math.max(1, Math.min(6, Math.round(Number(e.palabras_por_subtitulo) || 4)));
  e.altura_subtitulos = Math.max(55, Math.min(76, Number(e.altura_subtitulos) || 68));
  if (!SEPARACION[e.densidad]) e.densidad = "normal";
  if (!["yo", "app", "no"].includes(String(e.captions))) e.captions = e.captions === true ? "yo" : e.captions === false ? "no" : "app";
  e.fuente = String(e.fuente || DEFAULTS.fuente).trim();
  return { archivo, ajustes: e, prosa, existe: !!crudo };
}

function hexARgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(hex, a) {
  const [r, g, b] = hexARgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
// luminancia relativa: para elegir texto oscuro sobre un acento claro
export function luminancia(hex) {
  return hexARgb(hex)
    .map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
}

export function cssVariables(t) {
  const sobreAcento = luminancia(t.color_acento) > 0.45 ? "#111111" : "#FFFFFF";
  // panel claro (etiqueta blanca): sólido y con letra oscura; panel oscuro: semitransparente con la letra de siempre
  const panelClaro = luminancia(t.color_panel) > 0.5;
  const vars = {
    "--texto": t.color_texto,
    "--acento": t.color_acento,
    "--acento-suave": rgba(t.color_acento, 0.35),
    "--sobre-acento": sobreAcento,
    "--panel": rgba(t.color_panel, panelClaro ? 0.96 : 0.62),
    "--sobre-panel": panelClaro ? "#111111" : t.color_texto,
    // sobre una etiqueta clara, un acento claro (amarillo) no se lee como letra: va como marcador detrás de la palabra
    "--acento-panel": panelClaro && luminancia(t.color_acento) > 0.45 ? "#111111" : t.color_acento,
    "--marcador-panel": panelClaro && luminancia(t.color_acento) > 0.45 ? t.color_acento : "transparent",
    "--fuente": `"${t.fuente}"`,
    "--sombra": t.sombra ? "0 0 2px rgba(0,0,0,.65), 0 3px 10px rgba(0,0,0,.55), 0 10px 34px rgba(0,0,0,.45)" : "none",
    "--transformar": t.mayusculas ? "uppercase" : "none",
  };
  return `:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";")}}`;
}
