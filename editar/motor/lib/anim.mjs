// Vocabulario de movimiento: traduce el estilo (energia, entrada) a código GSAP.
// Todo devuelve STRINGS de código que van dentro del timeline principal (variable `tl`).
// Un selector que empieza con «js:» se pega tal cual (una expresión que devuelve nodos).
const sel2js = (sel) => (String(sel).startsWith("js:") ? String(sel).slice(3) : JSON.stringify(sel));

const ENERGIA = {
  calma: { dist: 40, dur: 0.7, stagger: 0.08, escala: 0.88, curva: "power3.out", pop: "back.out(1.4)" },
  media: { dist: 70, dur: 0.5, stagger: 0.06, escala: 0.7, curva: "power3.out", pop: "back.out(2)" },
  alta: { dist: 120, dur: 0.34, stagger: 0.04, escala: 0.45, curva: "expo.out", pop: "back.out(2.8)" },
};

export function motion(ajustes) {
  const en = ENERGIA[ajustes.energia] || ENERGIA.media;
  const t = (x) => +Number(x).toFixed(3);
  const m = {
    en, t,
    dur: en.dur,
    stagger: en.stagger,
    entrada(sel, at, { tipo = ajustes.entrada, stagger = 0, dur = null } = {}) {
      const du = dur ?? en.dur;
      const S = sel2js(sel);
      switch (tipo) {
        case "sube":
          return `tl.fromTo(${S},{opacity:0,y:${en.dist}},{opacity:1,y:0,duration:${du},ease:"${en.curva}",stagger:${stagger}},${t(at)});`;
        case "mascara":
          return `tl.fromTo(${S},{yPercent:115},{yPercent:0,duration:${t(du * 1.1)},ease:"${en.curva}",stagger:${stagger}},${t(at)});`;
        case "maquina":
          return `tl.fromTo(${S},{opacity:0},{opacity:1,duration:0.01,stagger:${Math.max(stagger, 0.05)}},${t(at)});`;
        case "pop":
        default:
          return `tl.fromTo(${S},{opacity:0,scale:${en.escala}},{opacity:1,scale:1,duration:${du},ease:"${en.pop}",stagger:${stagger}},${t(at)});`;
      }
    },
    salida(sel, at) {
      const du = 0.28;
      return `tl.to(${sel2js(sel)},{opacity:0,scale:0.92,duration:${du},ease:"power2.in"},${t(Math.max(0, at - du))});`;
    },
  };
  return m;
}

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Palabras envueltas en <span class="w">. *así* marca las palabras resaltadas (color de acento).
export function palabrasHtml(texto, { mascara = false } = {}) {
  const partes = [];
  const re = /\*([^*]+)\*|(\S+)/g;
  let m;
  while ((m = re.exec(String(texto)))) {
    if (m[1]) m[1].split(/\s+/).forEach((w) => partes.push({ w, hl: true }));
    else partes.push({ w: m[2], hl: false });
  }
  return partes
    .map(({ w, hl }) => {
      const span = `<span class="w${hl ? " hl" : ""}">${esc(w)}</span>`;
      return mascara ? `<span class="mask">${span}</span>` : span;
    })
    .join(" ");
}

export function contarPalabras(texto) {
  return String(texto).replace(/\*/g, "").split(/\s+/).filter(Boolean).length;
}
