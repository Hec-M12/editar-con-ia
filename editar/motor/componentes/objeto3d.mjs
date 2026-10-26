// OBJETO3D — un objeto 3D que entra girando (Three.js), en el color de acento, sin fondo, encima del video.
// Todo es geometría hecha con código: nada de video ni imágenes generadas con IA.
// Cómo se dibuja: HyperFrames manda el tiempo de cada cuadro (hf-seek) y la escena se calcula de cero
// para ese instante: el mismo segundo siempre da el mismo cuadro.
import { esc } from "../lib/anim.mjs";

const FORMAS = ["cubo", "esfera", "dona", "diamante", "moneda", "piramide", "estrella", "corazon"];

export default {
  tipo: "objeto3d",
  categoria: "3d",
  resumen: `Objeto 3D que entra girando, en el color de acento: ${FORMAS.join(", ")}. Con etiqueta opcional abajo.`,
  params: {
    forma: FORMAS.join(" | "),
    etiqueta: "opcional: 1-3 palabras debajo",
  },
  minimo: 240, // px de ancho por debajo de los cuales avisa que queda chico
  durDefault: 3,
  aspecto: (el) => (el.etiqueta ? 1 : 1.15),
  vendor: ["three.module.js", "three.core.js"],
  build({ id, el, ajustes, M, z, t0, t1, escala }) {
    const forma = el.forma || "diamante";
    if (!FORMAS.includes(forma)) throw new Error(`forma «${forma}» no existe. Hay: ${FORMAS.join(", ")}`);
    const tamEt = Math.round(Math.min(84, 58 * ajustes.tamano_texto) * escala);
    const hEt = el.etiqueta ? Math.round(tamEt * 1.6) : 0;
    const cw = Math.round(z.w), ch = Math.max(120, Math.round(z.h - hEt));
    const html = `<div class="o3"><canvas id="${id}-c" width="${cw}" height="${ch}" style="width:${cw}px;height:${ch}px"></canvas>${el.etiqueta ? `<div class="et fit" data-max="${tamEt}" data-min="${Math.round(tamEt * 0.5)}" data-maxh="${hEt}">${esc(el.etiqueta)}</div>` : ""}</div>`;
    const css = `
#${id} .o3{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;}
#${id} canvas{display:block;filter:drop-shadow(0 16px 30px rgba(0,0,0,.45));}
#${id} .et{font-family:var(--fuente),sans-serif;font-weight:800;color:var(--texto);text-shadow:var(--sombra);text-transform:var(--transformar);text-align:center;white-space:normal;line-height:1.05;width:100%;}`;
    let tl = "";
    if (el.etiqueta) tl += M.entrada(`#${id} .et`, t0 + 0.35, { tipo: "sube" });
    const T = (x) => +x.toFixed(3);
    const modulo = `{
  const canvas = document.getElementById(${JSON.stringify(`${id}-c`)});
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(${cw}, ${ch}, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const escena = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(35, ${cw} / ${ch}, 0.1, 100);
  cam.position.set(0, 0, 6);
  const acento = new THREE.Color(${JSON.stringify(ajustes.color_acento)});
  escena.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1.4));
  const luz = new THREE.DirectionalLight(0xffffff, 2.4); luz.position.set(3, 4, 5); escena.add(luz);
  const contra = new THREE.DirectionalLight(acento, 1.6); contra.position.set(-4, -2, -3); escena.add(contra);
  const mat = new THREE.MeshStandardMaterial({ color: acento, metalness: 0.25, roughness: 0.3, flatShading: ${["diamante", "piramide"].includes(forma)} });
  const extruir = (shape, prof) => { const g = new THREE.ExtrudeGeometry(shape, { depth: prof, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 4, curveSegments: 24 }); g.center(); return g; };
  let geo;
  switch (${JSON.stringify(forma)}) {
    case "cubo": geo = new THREE.BoxGeometry(1.7, 1.7, 1.7, 2, 2, 2); break;
    case "esfera": geo = new THREE.IcosahedronGeometry(1.2, 4); break;
    case "dona": geo = new THREE.TorusGeometry(1.0, 0.42, 32, 96); break;
    case "moneda": geo = new THREE.CylinderGeometry(1.2, 1.2, 0.28, 64); geo.rotateX(Math.PI / 2); break;
    case "piramide": geo = new THREE.ConeGeometry(1.3, 1.9, 4); break;
    case "estrella": { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.55 : 1.3, a = Math.PI / 2 + (i * Math.PI) / 5; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } geo = extruir(s, 0.45); break; }
    case "corazon": { const s = new THREE.Shape(); s.moveTo(0, -1.1); s.bezierCurveTo(-1.6, -0.2, -1.4, 1.1, -0.6, 1.1); s.bezierCurveTo(-0.2, 1.1, 0, 0.8, 0, 0.55); s.bezierCurveTo(0, 0.8, 0.2, 1.1, 0.6, 1.1); s.bezierCurveTo(1.4, 1.1, 1.6, -0.2, 0, -1.1); geo = extruir(s, 0.5); break; }
    default: geo = new THREE.OctahedronGeometry(1.25, 0);
  }
  const obj = new THREE.Mesh(geo, mat);
  const k = Math.min(1, ${cw} / ${ch}) * 1.05;
  escena.add(obj);
  const T0 = ${T(t0)}, T1 = ${T(t1)};
  const clamp = (x) => Math.min(1, Math.max(0, x));
  const outBack = (x) => { const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const dibujar = (tg) => {
    if (!(tg >= T0 - 0.1 && tg <= T1 + 0.1)) return;
    const s = Math.max(0, tg - T0);
    const entra = outBack(clamp(s / 0.65));
    const sale = 1 - Math.pow(1 - clamp((T1 - tg) / 0.35), 2);
    obj.scale.setScalar(Math.max(0.001, k * entra * sale));
    obj.rotation.y = 0.6 + s * 1.5;
    obj.rotation.x = 0.35 + Math.sin(s * 1.3) * 0.18;
    obj.position.y = Math.sin(s * 2.1) * 0.08;
    renderer.render(escena, cam);
  };
  __escenas.push(dibujar);
  window.__hf.buildReady[${JSON.stringify(id)}] = Promise.resolve().then(() => { renderer.compile(escena, cam); dibujar(T0 + 0.7); });
}`;
    tl += `tl.fromTo("#${id} .o3",{opacity:0},{opacity:1,duration:0.15},${M.t(t0)});`;
    tl += `tl.to("#${id} .o3",{opacity:0,duration:0.2},${M.t(Math.max(t0, t1 - 0.2))});`;
    return { html, css, tl, modulo, vendor: ["three.module.js", "three.core.js"] };
  },
};
