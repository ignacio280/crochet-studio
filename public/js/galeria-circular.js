/* ============================================================
   GALERIA CIRCULAR — una tira sin fin, curvada en arco

   Puerto del componente de la paleta. El original es React con
   TypeScript y Tailwind; este sitio no usa ninguna de las tres, y
   su politica de seguridad —script-src 'self'— no deja cargar
   scripts de fuera. Asi que ogl no viene de un CDN: viene
   empaquetado en /vendor/ogl.js con solo los modulos que esto
   necesita —48 KB en vez de los 465 del paquete entero—.

   Se conserva el comportamiento completo: los mismos sombreadores,
   la misma matematica del arco, el mismo envolvente infinito, la
   misma inercia y el mismo enganche a la pieza mas cercana. Y las
   mismas correcciones que el fuente ya traia sobre el componente de
   serie: los oyentes van al contenedor y no a window, el
   redimensionado sale de un ResizeObserver, el bucle se duerme
   cuando la galeria no esta a la vista, y con movimiento reducido
   se apagan el temblor de los vertices y la inercia.

   UNA COSA SI CAMBIA, Y ESTA PREVISTA EN EL PROPIO COMPONENTE

   El fuente captura la rueda y llama a preventDefault para que la
   pagina no se escape por debajo. Sus propias notas dicen: si va a
   mitad de pagina, o se acorta o se quita el preventDefault y se
   confia en el arrastre. Esta banda va a mitad de pagina, entre el
   manifiesto y la coleccion: atrapar ahi la rueda dejaria la
   pagina clavada cada vez que el cursor la cruza. Se arrastra.
   ============================================================ */

import { Camera, Mesh, Plane, Program, Renderer, Texture, Transform } from '/vendor/ogl.js';

function lerp(a, b, t) { return a + (b - a) * t; }

function tamanioDeFuente(fuente) {
  var m = fuente.match(/(\d+)px/);
  return m ? parseInt(m[1], 10) : 30;
}

/* El rotulo se pinta en un lienzo 2D y se sube como textura. Por eso
   el color tiene que ser un color de verdad y no una var(): ahi
   dentro no hay hoja de estilos que resolver, y una var() se pinta
   en negro sin avisar. */
function texturaDeTexto(gl, texto, fuente, color) {
  var lienzo = document.createElement('canvas');
  var ctx = lienzo.getContext('2d');
  ctx.font = fuente;
  var ancho = Math.ceil(ctx.measureText(texto).width);
  var alto = Math.ceil(tamanioDeFuente(fuente) * 1.2);

  lienzo.width = ancho + 20;
  lienzo.height = alto + 20;

  // Redimensionar el lienzo reinicia el contexto: la fuente se
  // vuelve a poner.
  ctx.font = fuente;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.clearRect(0, 0, lienzo.width, lienzo.height);
  ctx.fillText(texto, lienzo.width / 2, lienzo.height / 2);

  var textura = new Texture(gl, { generateMipmaps: false });
  textura.image = lienzo;
  return { textura: textura, ancho: lienzo.width, alto: lienzo.height };
}

var V_ROTULO = [
  'attribute vec3 position;',
  'attribute vec2 uv;',
  'uniform mat4 modelViewMatrix;',
  'uniform mat4 projectionMatrix;',
  'varying vec2 vUv;',
  'void main() {',
  '  vUv = uv;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}'
].join('\n');

var F_ROTULO = [
  'precision highp float;',
  'uniform sampler2D tMap;',
  'varying vec2 vUv;',
  'void main() {',
  '  vec4 color = texture2D(tMap, vUv);',
  '  if (color.a < 0.1) discard;',
  '  gl_FragColor = color;',
  '}'
].join('\n');

var V_FOTO = [
  'precision highp float;',
  'attribute vec3 position;',
  'attribute vec2 uv;',
  'uniform mat4 modelViewMatrix;',
  'uniform mat4 projectionMatrix;',
  'uniform float uTime;',
  'uniform float uSpeed;',
  'varying vec2 vUv;',
  'void main() {',
  '  vUv = uv;',
  '  vec3 p = position;',
  '  p.z = (sin(p.x * 4.0 + uTime) * 1.5 + cos(p.y * 2.0 + uTime) * 1.5) * (0.1 + uSpeed * 0.5);',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
  '}'
].join('\n');

var F_FOTO = [
  'precision highp float;',
  'uniform vec2 uImageSizes;',
  'uniform vec2 uPlaneSizes;',
  'uniform sampler2D tMap;',
  'uniform float uBorderRadius;',
  'varying vec2 vUv;',
  '',
  'float roundedBoxSDF(vec2 p, vec2 b, float r) {',
  '  vec2 d = abs(p) - b;',
  '  return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0) - r;',
  '}',
  '',
  'void main() {',
  '  vec2 ratio = vec2(',
  '    min((uPlaneSizes.x / uPlaneSizes.y) / (uImageSizes.x / uImageSizes.y), 1.0),',
  '    min((uPlaneSizes.y / uPlaneSizes.x) / (uImageSizes.y / uImageSizes.x), 1.0)',
  '  );',
  '  vec2 uv = vec2(',
  '    vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,',
  '    vUv.y * ratio.y + (1.0 - ratio.y) * 0.5',
  '  );',
  '  vec4 color = texture2D(tMap, uv);',
  '',
  '  float d = roundedBoxSDF(vUv - 0.5, vec2(0.5 - uBorderRadius), uBorderRadius);',
  '  float edgeSmooth = 0.002;',
  '  float alpha = 1.0 - smoothstep(-edgeSmooth, edgeSmooth, d);',
  '',
  '  gl_FragColor = vec4(color.rgb, alpha);',
  '}'
].join('\n');

function Rotulo(gl, plano, texto, color, fuente) {
  var t = texturaDeTexto(gl, texto, fuente, color);
  var malla = new Mesh(gl, {
    geometry: new Plane(gl),
    program: new Program(gl, {
      vertex: V_ROTULO,
      fragment: F_ROTULO,
      uniforms: { tMap: { value: t.textura } },
      transparent: true
    })
  });
  var altoRotulo = plano.scale.y * 0.15;
  malla.scale.set(altoRotulo * (t.ancho / t.alto), altoRotulo, 1);
  malla.position.y = -plano.scale.y * 0.5 - altoRotulo * 0.5 - 0.05;
  malla.setParent(plano);
}

function Foto(op) {
  this.op = op;
  this.extra = 0;
  this.escala = 1;
  this.margen = 2;
  this.ancho = 0;
  this.anchoTotal = 0;
  this.x = 0;
  this.velocidad = 0;

  var textura = new Texture(op.gl, { generateMipmaps: true });
  this.programa = new Program(op.gl, {
    depthTest: false,
    depthWrite: false,
    vertex: V_FOTO,
    fragment: F_FOTO,
    uniforms: {
      tMap: { value: textura },
      uPlaneSizes: { value: [0, 0] },
      uImageSizes: { value: [0, 0] },
      uSpeed: { value: 0 },
      uTime: { value: 100 * Math.random() },
      uBorderRadius: { value: op.radio }
    },
    transparent: true
  });

  var self = this;
  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = op.imagen;
  img.onload = function () {
    textura.image = img;
    self.programa.uniforms.uImageSizes.value = [img.naturalWidth, img.naturalHeight];
  };

  this.plano = new Mesh(op.gl, { geometry: op.geometria, program: this.programa });
  this.plano.setParent(op.escena);

  Rotulo(op.gl, this.plano, op.texto, op.colorTexto, op.fuente);
  this.medir();
}

Foto.prototype.actualizar = function (scroll, sentido) {
  var op = this.op;
  this.plano.position.x = this.x - scroll.actual - this.extra;

  var x = this.plano.position.x;
  var H = op.vista.ancho / 2;

  if (op.arco === 0) {
    this.plano.position.y = 0;
    this.plano.rotation.z = 0;
  } else {
    var a = Math.abs(op.arco);
    var R = (H * H + a * a) / (2 * a);
    var xe = Math.min(Math.abs(x), H);
    var cuerda = R - Math.sqrt(R * R - xe * xe);
    var angulo = Math.asin(xe / R);
    if (op.arco > 0) {
      this.plano.position.y = -cuerda;
      this.plano.rotation.z = -Math.sign(x) * angulo;
    } else {
      this.plano.position.y = cuerda;
      this.plano.rotation.z = Math.sign(x) * angulo;
    }
  }

  this.velocidad = scroll.actual - scroll.previo;
  if (!op.reducido) {
    this.programa.uniforms.uTime.value += 0.04;
    this.programa.uniforms.uSpeed.value = this.velocidad;
  }

  // Al salir por un lado, la pieza reaparece por el otro: la tira
  // no tiene principio ni final.
  var mitad = this.plano.scale.x / 2;
  var borde = op.vista.ancho / 2;
  if (sentido === 'derecha' && this.plano.position.x + mitad < -borde) this.extra -= this.anchoTotal;
  if (sentido === 'izquierda' && this.plano.position.x - mitad > borde) this.extra += this.anchoTotal;
};

Foto.prototype.medir = function (tam) {
  var op = this.op;
  if (tam) { op.pantalla = tam.pantalla; op.vista = tam.vista; }

  this.escala = op.pantalla.alto / 1500;
  this.plano.scale.y = (op.vista.alto * (900 * this.escala)) / op.pantalla.alto;
  this.plano.scale.x = (op.vista.ancho * (700 * this.escala)) / op.pantalla.ancho;
  this.plano.program.uniforms.uPlaneSizes.value = [this.plano.scale.x, this.plano.scale.y];

  this.ancho = this.plano.scale.x + this.margen;
  this.anchoTotal = this.ancho * op.total;
  this.x = this.ancho * op.indice;
};

function Galeria(contenedor, cfg) {
  var self = this;
  this.contenedor = contenedor;
  this.cfg = cfg;
  this.reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.scroll = {
    suavizado: this.reducido ? 1 : cfg.inercia,
    actual: 0, destino: 0, previo: 0, apoyo: 0
  };
  this.pantalla = { ancho: 0, alto: 0 };
  this.vista = { ancho: 0, alto: 0 };
  this.fotos = [];
  this.cuadro = 0;
  this.arrastrando = false;
  this.inicioX = 0;
  this.aLaVista = true;

  this.render = new Renderer({
    alpha: true, antialias: true,
    dpr: Math.min(window.devicePixelRatio || 1, 2)
  });
  this.gl = this.render.gl;
  this.gl.clearColor(0, 0, 0, 0);
  contenedor.appendChild(this.gl.canvas);
  this.gl.canvas.style.display = 'block';

  this.camara = new Camera(this.gl);
  this.camara.fov = 45;
  this.camara.position.z = 20;

  this.escena = new Transform();
  this.medir();

  this.geometria = new Plane(this.gl, { heightSegments: 50, widthSegments: 100 });

  // Se duplica la lista: asi el envolvente siempre tiene una pieza
  // lista fuera de pantalla.
  var lista = cfg.piezas.concat(cfg.piezas);
  this.fotos = lista.map(function (d, i) {
    return new Foto({
      geometria: self.geometria, gl: self.gl, imagen: d.imagen, indice: i,
      total: lista.length, escena: self.escena, pantalla: self.pantalla,
      texto: d.texto, vista: self.vista, arco: cfg.arco,
      colorTexto: cfg.colorTexto, radio: cfg.radio, fuente: cfg.fuente,
      reducido: self.reducido
    });
  });

  this.oir();
  this.girar();
}

Galeria.prototype.medir = function () {
  this.pantalla = {
    ancho: this.contenedor.clientWidth,
    alto: this.contenedor.clientHeight
  };
  if (!this.pantalla.ancho || !this.pantalla.alto) return;

  this.render.setSize(this.pantalla.ancho, this.pantalla.alto);
  this.camara.perspective({ aspect: this.pantalla.ancho / this.pantalla.alto });

  var fov = (this.camara.fov * Math.PI) / 180;
  var alto = 2 * Math.tan(fov / 2) * this.camara.position.z;
  this.vista = { ancho: alto * this.camara.aspect, alto: alto };

  var t = { pantalla: this.pantalla, vista: this.vista };
  for (var i = 0; i < this.fotos.length; i++) this.fotos[i].medir(t);
};

Galeria.prototype.enganchar = function () {
  var primera = this.fotos[0];
  if (!primera || !primera.ancho) return;
  var i = Math.round(Math.abs(this.scroll.destino) / primera.ancho);
  var d = primera.ancho * i;
  this.scroll.destino = this.scroll.destino < 0 ? -d : d;
};

Galeria.prototype.girar = function () {
  var self = this;
  this.cuadro = requestAnimationFrame(function () { self.girar(); });
  if (!this.aLaVista) return;

  this.scroll.actual = lerp(this.scroll.actual, this.scroll.destino, this.scroll.suavizado);
  var sentido = this.scroll.actual > this.scroll.previo ? 'derecha' : 'izquierda';
  for (var i = 0; i < this.fotos.length; i++) this.fotos[i].actualizar(this.scroll, sentido);
  this.render.render({ scene: this.escena, camera: this.camara });
  this.scroll.previo = this.scroll.actual;
};

Galeria.prototype.oir = function () {
  var self = this;
  var el = this.contenedor;

  this.abajo = function (e) {
    self.arrastrando = true;
    el.setPointerCapture(e.pointerId);
    self.scroll.apoyo = self.scroll.actual;
    self.inicioX = e.clientX;
  };
  this.mover = function (e) {
    if (!self.arrastrando) return;
    self.scroll.destino = self.scroll.apoyo +
      (self.inicioX - e.clientX) * (self.cfg.velocidad * 0.025);
  };
  this.arriba = function (e) {
    if (!self.arrastrando) return;
    self.arrastrando = false;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    self.enganchar();
  };

  el.addEventListener('pointerdown', this.abajo);
  el.addEventListener('pointermove', this.mover);
  el.addEventListener('pointerup', this.arriba);
  el.addEventListener('pointercancel', this.arriba);

  this.obsTam = new ResizeObserver(function () { self.medir(); });
  this.obsTam.observe(el);

  this.obsVista = new IntersectionObserver(
    function (e) { self.aLaVista = e[0].isIntersecting; },
    { rootMargin: '10%' }
  );
  this.obsVista.observe(el);
};

Galeria.prototype.destruir = function () {
  cancelAnimationFrame(this.cuadro);
  var el = this.contenedor;
  el.removeEventListener('pointerdown', this.abajo);
  el.removeEventListener('pointermove', this.mover);
  el.removeEventListener('pointerup', this.arriba);
  el.removeEventListener('pointercancel', this.arriba);
  if (this.obsTam) this.obsTam.disconnect();
  if (this.obsVista) this.obsVista.disconnect();
  var lienzo = this.gl.canvas;
  if (lienzo.parentNode === el) el.removeChild(lienzo);
  var ext = this.gl.getExtension('WEBGL_lose_context');
  if (ext) ext.loseContext();
};

/* ---------------- Montaje ---------------- */

var FUENTE = '400 26px "IBM Plex Mono", ui-monospace, Menlo, monospace';
var MUESTRAS = ['chaleco', 'bolso', 'gorro', 'manta', 'osito'];

function piezasDe(datos) {
  return (datos.productos || []).map(function (p, i) {
    return {
      imagen: (p.fotos && p.fotos[0]) ||
              ('/img/muestra/' + MUESTRAS[i % MUESTRAS.length] + '.webp'),
      texto: (p.nombre || '').toUpperCase()
    };
  });
}

function montar(datos) {
  var caja = document.getElementById('vitrina');
  if (!caja) return;

  var piezas = piezasDe(datos);
  // Con menos de tres, la tira duplicada deja huecos al envolver.
  if (piezas.length < 3) {
    var seccion = caja.closest('.vitrina-seccion');
    if (seccion) seccion.parentNode.removeChild(seccion);
    return;
  }

  /* El rotulo se rasteriza una sola vez al montar. Si la fuente no
     ha llegado todavia se hornea la de reserva, y ya no hay vuelta
     atras: no es como el texto de la pagina, que se repinta solo. */
  var listo = (document.fonts && document.fonts.ready)
    ? document.fonts.ready
    : Promise.resolve();

  listo.catch(function () {}).then(function () {
    caja.classList.add('lista');
    new Galeria(caja, {
      piezas: piezas,
      arco: 3,
      colorTexto: '#5c4326',   // un color de verdad: aca no vale una var()
      radio: 0.05,
      fuente: FUENTE,
      velocidad: 2,
      inercia: 0.05
    });
  });
}

if (window.SDB && window.SDB.datos) montar(window.SDB.datos);
else document.addEventListener('sdb:datos', function (e) { montar(e.detail); }, { once: true });
