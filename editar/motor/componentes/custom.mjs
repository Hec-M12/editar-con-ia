// CUSTOM — para lo que ningún otro tipo cubre: HTML + CSS + GSAP escritos a mano (HyperFrames convierte
// ese código en animación). En el texto se reemplazan {{id}}, {{t0}} y {{t1}}.
// Reglas de HyperFrames: nada de Math.random sin semilla, ni Date.now, ni repeat: -1; animá hijos, no el host.
export default {
  tipo: "custom",
  categoria: "custom",
  resumen: "HTML + CSS + GSAP a mano, para lo que ningún tipo cubre. {{id}}, {{t0}} y {{t1}} se reemplazan.",
  params: {
    html: "el contenido (va dentro de una caja libre que no tapa la cara)",
    css: "estilos; usá #{{id}} para no pisar otros elementos",
    js: "código GSAP que usa `tl` (el timeline principal), ej. tl.fromTo(\"#{{id}} .x\",{opacity:0},{opacity:1},{{t0}})",
    aspecto: "proporción ancho/alto que necesita (default 1.6)",
  },
  minimo: 200, // px de ancho por debajo de los cuales avisa que queda chico
  durDefault: 2.5,
  aspecto: (el) => Number(el.aspecto) || 1.6,
  build({ id, el, t0, t1 }) {
    const sub = (s) => String(s || "").replaceAll("{{id}}", id).replaceAll("{{t0}}", t0.toFixed(3)).replaceAll("{{t1}}", t1.toFixed(3));
    return { html: sub(el.html), css: sub(el.css), tl: sub(el.js), sonidos: [{ t: t0, tipo: "pop", que: "animación hecha a mano" }] };
  },
};
