// ZOOM — acerca la cámara a la cara en un momento fuerte (golpe = de una · empuje = se acerca suave).
export default {
  tipo: "zoom",
  categoria: "zoom",
  resumen: "Acerca el video a la cara en un momento fuerte: golpe (de una) o empuje (suave). Sin nada encima.",
  params: {
    forma: "golpe (default) | empuje",
    escala: "cuánto acerca: 1.12 (default) a 1.3",
  },
  durDefault: 1.6,
  sinCaja: true,
  build({ el, t0, t1 }) {
    const escala = Math.max(1.03, Math.min(1.35, Number(el.escala) || 1.12));
    const forma = el.forma === "empuje" ? "empuje" : "golpe";
    // el zoom de golpe lleva un golpe grave; el empuje es suave y va sin sonido
    return { video: [{ tipo: "zoom", t0, t1, escala, forma }], sonidos: forma === "golpe" ? [{ t: t0, tipo: "golpe", que: "zoom de golpe" }] : [] };
  },
};
