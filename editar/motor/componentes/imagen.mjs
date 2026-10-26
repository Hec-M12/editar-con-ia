// IMAGEN — una imagen que trae la persona (logo, captura, foto) y entra encima del video.
// Solo archivos de la persona: nunca imágenes generadas con IA ni bajadas de internet sin permiso.
import { esc } from "../lib/anim.mjs";

export default {
  tipo: "imagen",
  categoria: "imagen",
  resumen: "Una imagen de la persona (logo, captura, foto) que entra encima del video, sin tapar la cara.",
  params: {
    archivo: "ruta a la imagen (relativa a la carpeta del video)",
    marco: "true = esquinas redondeadas y sombra (para capturas)",
    etiqueta: "opcional: 1-3 palabras debajo",
  },
  minimo: 280, // px de ancho por debajo de los cuales avisa que queda chico
  durDefault: 2.6,
  aspecto: (el, info) => (info?.aspecto ? Math.max(0.5, Math.min(2.4, info.aspecto)) : 1.2),
  build({ id, el, ajustes, M, z, t0, t1, imagenes, escala }) {
    if (!el.archivo) throw new Error("falta «archivo»");
    const img = imagenes.registrar(el.archivo);
    const tamEt = Math.round(Math.min(80, 56 * ajustes.tamano_texto) * escala);
    const hEt = el.etiqueta ? Math.round(tamEt * 1.6) : 0;
    const maxW = Math.round(z.w), maxH = Math.round(z.h - hEt);
    const k = Math.min(maxW / img.ancho, maxH / img.alto);
    const w = Math.round(img.ancho * k), h = Math.round(img.alto * k);
    const html = `<div class="im"><img src="${img.publico}" width="${w}" height="${h}" alt="">${el.etiqueta ? `<div class="et fit" data-max="${tamEt}" data-min="${Math.round(tamEt * 0.5)}" data-maxh="${Math.round(tamEt * 2.25)}">${esc(el.etiqueta)}</div>` : ""}</div>`;
    const css = `
#${id} .im{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;}
#${id} img{display:block;${el.marco ? `border-radius:${Math.round(26 * escala)}px;box-shadow:0 18px 50px rgba(0,0,0,.5);` : "filter:drop-shadow(0 14px 30px rgba(0,0,0,.45));"}}
#${id} .et{font-family:var(--fuente),sans-serif;font-weight:800;color:var(--texto);text-shadow:var(--sombra);text-transform:var(--transformar);text-align:center;white-space:normal;line-height:1.05;width:100%;margin-top:${Math.round(10 * escala)}px;}`;
    let tl = M.entrada(`#${id} img`, t0, { tipo: ajustes.entrada === "maquina" || ajustes.entrada === "mascara" ? "pop" : ajustes.entrada });
    tl += `tl.to("#${id} img",{y:${-Math.round(8 * escala)},duration:${M.t(Math.max(0.6, (t1 - t0) / 2))},yoyo:true,repeat:1,ease:"sine.inOut"},${M.t(t0 + M.dur)});`;
    if (el.etiqueta) tl += M.entrada(`#${id} .et`, t0 + 0.25, { tipo: "sube" });
    tl += M.salida(`#${id} .im`, t1);
    return { html, css, tl, sonidos: [{ t: t0, tipo: "whoosh", que: `imagen ${el.archivo || ""}`.trim() }] };
  },
};
