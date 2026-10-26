// El transcript por palabra que deja Whisper: [{ text, start, end }, …] en segundos.
import { readFileSync } from "node:fs";

export function cargarPalabras(archivo) {
  const raw = JSON.parse(readFileSync(archivo, "utf8"));
  const arr = Array.isArray(raw) ? raw : raw.words || raw.segments?.flatMap((s) => s.words) || [];
  return arr
    .filter((w) => w && typeof w.start === "number")
    .map((w) => ({ text: String(w.text ?? w.word ?? "").trim(), start: w.start, end: w.end ?? w.start }))
    .filter((w) => w.text);
}

// minúsculas, sin tildes ni signos: para comparar frases sin que molesten la puntuación ni los acentos
export function normalizar(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ]+/g, "");
}

// Busca una frase en el transcript comparando letras (aguanta palabras que Whisper pegó o partió).
// Devuelve { start, end, i, j } o null. desde: segundo mínimo · ocurrencia: 1 = la primera.
export function buscarFrase(palabras, frase, { desde = 0, ocurrencia = 1 } = {}) {
  const objetivo = normalizar(frase);
  if (!objetivo) return null;
  let pegado = "";
  const dueno = [];
  const inicioDe = [];
  palabras.forEach((w, i) => {
    inicioDe.push(pegado.length);
    const n = normalizar(w.text);
    for (let k = 0; k < n.length; k++) dueno.push(i);
    pegado += n;
  });
  const esInicio = new Set(inicioDe);
  for (const exigirBorde of [true, false]) {
    let desdePos = 0, vistos = 0;
    while (true) {
      const pos = pegado.indexOf(objetivo, desdePos);
      if (pos < 0) break;
      desdePos = pos + 1;
      const i = dueno[pos];
      const j = dueno[pos + objetivo.length - 1];
      if (exigirBorde) {
        const fin = pos + objetivo.length;
        if (!esInicio.has(pos) || !(fin === pegado.length || esInicio.has(fin))) continue;
      }
      if (palabras[i].start < desde - 0.01) continue;
      vistos++;
      if (vistos === ocurrencia) return { start: palabras[i].start, end: palabras[j].end, i, j };
    }
  }
  return null;
}

export function textoEntre(palabras, t0, t1) {
  return palabras
    .filter((w) => w.end > t0 + 0.02 && w.start < t1 - 0.02)
    .map((w) => w.text)
    .join(" ")
    .replace(/\s+([,.;:!?])/g, "$1");
}

// Frases legibles: corta en puntuación o en pausas (para mostrar el transcript con tiempos).
export function frases(palabras, pausa = 0.45) {
  const out = [];
  let actual = null;
  palabras.forEach((w, i) => {
    const prev = palabras[i - 1];
    const cortar = !actual || (prev && (w.start - prev.end > pausa || /[.!?…]$/.test(prev.text)));
    if (cortar) {
      if (actual) out.push(actual);
      actual = { start: w.start, end: w.end, texto: w.text, i, j: i };
    } else {
      actual.end = w.end;
      actual.texto += " " + w.text;
      actual.j = i;
    }
  });
  if (actual) out.push(actual);
  return out;
}

const PALABRAS_TRAS_Y = new Set("al ahí ahora allá aquí así antes aunque ella ellos el él en entonces eso esa ese esto este esta es era estaba uno una un otro otra hoy".split(" "));

// Dos mañas de Whisper en español: «Yasí» → «Y así» y «coma,¿qué» → «coma, ¿qué». Solo separa, nunca cambia palabras.
export function arreglarPalabras(palabras, idioma = "es") {
  const out = [];
  for (const w of palabras) {
    const t = w.text;
    let m;
    if (idioma === "es" && ((m = t.match(/^([Yy])([bcdfghjklmnñpqrstvwxz¿¡][\p{L}\p{M}'’.,;:!?¿¡…]*)$/u)) ||
      ((m = t.match(/^([Yy])([\p{L}\p{M}]+)([.,;:!?…]*)$/u)) && PALABRAS_TRAS_Y.has(m[2].toLowerCase())))) {
      const resto = m[3] !== undefined ? m[2] + m[3] : m[2];
      const corte = w.start + (w.end - w.start) * 0.2;
      out.push({ ...w, text: m[1], end: +corte.toFixed(3) });
      out.push({ ...w, text: resto, start: +corte.toFixed(3) });
      continue;
    }
    if ((m = t.match(/^(.+[,.;:!?…])([¿¡].+)$/u))) {
      const corte = w.start + (w.end - w.start) * (m[1].length / t.length);
      out.push({ ...w, text: m[1], end: +corte.toFixed(3) });
      out.push({ ...w, text: m[2], start: +corte.toFixed(3) });
      continue;
    }
    out.push(w);
  }
  return out.map((w) => ({ text: w.text, start: w.start, end: w.end }));
}
