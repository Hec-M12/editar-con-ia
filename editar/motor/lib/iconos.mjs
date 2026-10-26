// Íconos de línea dibujados a mano para esta skill (viewBox 100×100). Se dibujan trazo por trazo.
// relleno: true = al terminar de dibujarse se rellena · final: lo que hace cuando ya está dibujado.
const c = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

export const ICONOS = {
  check: { trazos: [c(50, 50, 40), "M30 51l13 13 27-29"], final: "pulso", dice: "sí, listo, hecho, correcto" },
  x: { trazos: [c(50, 50, 40), "M35 35l30 30", "M65 35L35 65"], final: "sacude", dice: "no, error, prohibido" },
  reloj: { trazos: [c(50, 50, 40), "M50 50V27", "M50 50l15 9"], final: "gira", gira: [1, 2], dice: "tiempo, horas, rápido, tarde" },
  rayo: { trazos: ["M56 8L22 56h26l-6 36 36-52H52z"], relleno: true, final: "destello", dice: "rápido, energía, al instante" },
  corazon: { trazos: ["M50 86C20 64 10 46 17 31c7-15 26-16 33 0 7-16 26-15 33 0 7 15-3 33-33 55z"], relleno: true, final: "late", dice: "me gusta, amor, favorito" },
  estrella: { trazos: ["M50 8l12 26 28 3-21 19 6 28-25-14-25 14 6-28-21-19 28-3z"], relleno: true, final: "destello", dice: "lo mejor, destacado, calidad" },
  chispa: { trazos: ["M46 14c3 20 10 30 30 34-20 4-27 14-30 34-3-20-10-30-30-34 20-4 27-14 30-34z", "M80 10c1 7 4 10 10 11-6 1-9 4-10 11-1-7-4-10-10-11 6-1 9-4 10-11z"], relleno: true, final: "destello", dice: "IA, magia, automático, nuevo" },
  fuego: { trazos: ["M50 90c-17 0-28-11-28-26 0-13 9-22 15-31 2 8 6 13 11 15-1-13 4-24 14-32 0 13 7 20 12 28 4 6 7 12 7 20 0 15-13 26-31 26z"], relleno: true, final: "late", dice: "viral, caliente, tendencia" },
  dinero: { trazos: ["M10 28h80v44H10z", c(50, 50, 11), "M22 40v20", "M78 40v20"], final: "pulso", dice: "plata, precio, pagar, ganar" },
  regalo: { trazos: ["M16 44h68v44H16z", "M10 30h80v14H10z", "M50 30v58", "M50 30c-8-14-27-15-23-3 3 7 23 3 23 3", "M50 30c8-14 27-15 23-3-3 7-23 3-23 3"], final: "salta", dice: "gratis, regalo, bonus" },
  sube: { trazos: ["M10 78l26-26 16 16 36-38", "M66 30h22v22"], final: "sube", dice: "crece, mejora, más" },
  baja: { trazos: ["M10 24l26 26 16-16 36 38", "M66 72h22V50"], final: "baja", dice: "cae, baja, menos, pérdida" },
  flecha: { trazos: ["M12 50h70", "M58 26l24 24-24 24"], final: "empuja", dice: "siguiente, paso, entonces" },
  foco: { trazos: ["M50 10c-17 0-30 13-30 29 0 11 6 19 13 25v10h34V64c7-6 13-14 13-25 0-16-13-29-30-29z", "M38 84h24", "M42 92h16"], relleno: true, final: "destello", dice: "idea, truco, se me ocurrió" },
  mic: { trazos: ["M38 18a12 12 0 0 1 24 0v28a12 12 0 0 1-24 0z", "M26 44c0 14 11 24 24 24s24-10 24-24", "M50 68v18", "M36 88h28"], final: "pulso", dice: "hablar, grabar, voz, audio" },
  onda: { trazos: ["M14 42v16", "M26 30v40", "M38 20v60", "M50 34v32", "M62 14v72", "M74 28v44", "M86 40v20"], final: "onda", dice: "escuchar, sonido, transcribir" },
  tijera: { trazos: [c(24, 30, 11), c(24, 70, 11), "M33 37l51 39", "M33 63l51-39"], final: "corta", dice: "cortar, recortar, editar" },
  codigo: { trazos: ["M34 28L12 50l22 22", "M66 28l22 22-22 22", "M56 18L44 82"], final: "pulso", dice: "código, programar, técnico" },
  play: { trazos: [c(50, 50, 40), "M42 33v34l28-17z"], relleno: true, final: "pulso", dice: "video, reproducir, ver" },
  camara: { trazos: ["M10 30h56v40H10z", "M66 45l24-13v36L66 55"], final: "pulso", dice: "grabar, cámara, filmar" },
  chat: { trazos: ["M14 18h72v46H44L26 80V64H14z", "M34 41h.1", "M50 41h.1", "M66 41h.1"], final: "pulso", dice: "mensaje, comentar, escribir" },
  persona: { trazos: [c(50, 32, 16), "M18 90c3-22 16-32 32-32s29 10 32 32"], final: "pulso", dice: "persona, cliente, usuario" },
  calendario: { trazos: ["M14 22h72v66H14z", "M14 40h72", "M32 12v18", "M68 12v18", "M34 58h.1", "M50 58h.1", "M66 58h.1", "M34 74h.1", "M50 74h.1"], final: "pulso", dice: "día, semana, fecha" },
  candado: { trazos: ["M24 46h52v42H24z", "M34 46V32a16 16 0 0 1 32 0v14", "M50 62v12"], final: "pulso", dice: "seguro, privado, bloqueado" },
  telefono: { trazos: ["M32 8h36v84H32z", "M46 80h8"], final: "sacude", dice: "celular, app, llamar" },
  ojo: { trazos: ["M8 50c12-20 26-30 42-30s30 10 42 30c-12 20-26 30-42 30S20 70 8 50z", c(50, 50, 12)], final: "pulso", dice: "mirar, ver, atención" },
  robot: { trazos: ["M24 36h52v40H24z", "M50 24v12", c(50, 19, 5), "M39 52h.1", "M61 52h.1", "M40 64h20"], final: "sacude", dice: "bot, IA, automático" },
  pregunta: { trazos: ["M34 36a16 16 0 1 1 24 14c-6 4-8 7-8 14", "M50 80h.1"], final: "sacude", dice: "duda, pregunta, ¿cómo?" },
  alerta: { trazos: ["M50 10L92 86H8z", "M50 38v22", "M50 72h.1"], final: "sacude", dice: "cuidado, ojo, error" },
};

export const NOMBRES_ICONOS = Object.keys(ICONOS);
