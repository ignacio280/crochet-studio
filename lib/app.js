// El sitio entero: la tienda publica, el panel y su API.
//
// Habla en Request/Response (el estandar de la web) y no en los objetos de
// node:http. Por eso el mismo archivo corre en una funcion de Netlify y
// detras de server.js en el computador, sin una sola rama "si estoy en".
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash, randomBytes } from 'node:crypto';
import { load, save, saveConLimpieza, replaceAll, hashPassword, verifyPassword } from './store.js';
import { crearToken, tokenValido } from './auth.js';
import { leerFreno, escribirFreno, borrarFreno, listarFrenos } from './almacen.js';
import { urlDe, esRef, tipoDe, bytesDe, normalizarUna, normalizarLista } from './fotos.js';

const COOKIE = 'crochet_sesion';

// Netlify no deja pasar mas de 6 MB por peticion. El panel achica cada foto
// antes de mandarla, asi que seis fotos nuevas de una vez caben de sobra;
// el techo esta para que un pegado raro falle con un mensaje claro en vez
// de morir en la plataforma.
const LIMITE_BODY = 5 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

/* ================= archivos del proyecto ================= */

// La plantilla de la portada y el HTML del panel se leen del disco. En
// Netlify llegan por `included_files`, y donde queda esa carpeta depende
// del empaquetador: se prueban las candidatas y se recuerda la que sirvio.
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATAS = [
  path.dirname(AQUI),
  process.env.LAMBDA_TASK_ROOT || '',
  process.cwd()
].filter(Boolean);

let raiz = null;

async function rutaDe(relativa) {
  if (raiz) return path.join(raiz, relativa);
  for (const base of CANDIDATAS) {
    try {
      await stat(path.join(base, relativa));
      raiz = base;
      return path.join(base, relativa);
    } catch {}
  }
  return path.join(CANDIDATAS[0], relativa);   // que falle con una ruta legible
}

/* ================= utilidades ================= */

class ErrorHttp extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}

function escaparHtml(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// La CSP no lleva 'unsafe-inline' en los scripts. El unico script en linea
// es el guardia de la bienvenida, y va autorizado por su hash: si alguien
// logra inyectar otro script, el navegador se niega a correrlo.
function csp(hashesEnLinea = []) {
  return [
    "default-src 'self'",
    "img-src 'self' data:",                                  // data: para el editor del panel
    // Las letras salen del propio sitio: ya no hay que abrirle la
    // puerta a Google para que la página se vea bien.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    ["script-src 'self'", ...hashesEnLinea].join(' '),
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'"
  ].join('; ');
}

// El hash se calcula del HTML que se va a enviar, no de una constante
// escrita a mano: asi editar el script no rompe la pagina en silencio.
function hashesDeScripts(html) {
  const hashes = [];
  const re = /<script(\b[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (/src\s*=/i.test(m[1])) continue;      // los externos ya los cubre 'self'
    // El analizador de HTML normaliza CRLF a LF antes de calcular el hash;
    // si se hashean los bytes crudos, nunca coincide y el script queda
    // bloqueado.
    const contenido = m[2].split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
    hashes.push("'sha256-" + createHash('sha256').update(contenido, 'utf8').digest('base64') + "'");
  }
  return hashes;
}

function esHttps(request) {
  const reenviado = (request.headers.get('x-forwarded-proto') || '').split(',')[0].trim();
  if (reenviado) return reenviado === 'https';
  return new URL(request.url).protocol === 'https:';
}

function origen(request) {
  return new URL(request.url).origin;
}

function responder(request, codigo, tipo, cuerpo, extra = {}) {
  const cabeceras = new Headers(extra);
  cabeceras.set('content-type', tipo);
  cabeceras.set('x-content-type-options', 'nosniff');
  cabeceras.set('referrer-policy', 'strict-origin-when-cross-origin');
  cabeceras.set('x-frame-options', 'DENY');
  cabeceras.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (!cabeceras.has('content-security-policy')) cabeceras.set('content-security-policy', csp());
  if (esHttps(request)) {
    cabeceras.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }
  return new Response(cuerpo, { status: codigo, headers: cabeceras });
}

function json(request, codigo, datos, extra = {}) {
  return responder(request, codigo, 'application/json; charset=utf-8', JSON.stringify(datos), {
    'cache-control': 'no-store',
    ...extra
  });
}

async function leerBody(request) {
  const anunciado = Number(request.headers.get('content-length') || 0);
  if (anunciado > LIMITE_BODY) {
    throw new ErrorHttp(413, 'Eso pesa demasiado. Prueba con menos fotos, o mas livianas.');
  }
  const crudo = await request.text();
  if (crudo.length > LIMITE_BODY) {
    throw new ErrorHttp(413, 'Eso pesa demasiado. Prueba con menos fotos, o mas livianas.');
  }
  if (!crudo) return {};
  try {
    return JSON.parse(crudo);
  } catch {
    throw new ErrorHttp(400, 'El contenido no es JSON válido');
  }
}

function leerCookie(request, nombre) {
  const crudo = request.headers.get('cookie');
  if (!crudo) return null;
  for (const parte of crudo.split(';')) {
    const i = parte.indexOf('=');
    if (i === -1) continue;
    if (parte.slice(0, i).trim() === nombre) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

async function autenticado(request) {
  const store = await load();
  return tokenValido(leerCookie(request, COOKIE), store.secret);
}

function cookieSesion(request, token) {
  const flags = ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=2592000'];
  if (esHttps(request)) flags.push('Secure');
  return COOKIE + '=' + token + '; ' + flags.join('; ');
}

/* ================= freno de intentos ================= */

const INTENTOS_MAX = 8;
const ESPERA = 10 * 60 * 1000;

function claveFreno(ip) {
  // La IP no se guarda en claro: alcanza con poder contar sus intentos.
  return createHash('sha256').update(String(ip)).digest('hex').slice(0, 32);
}

function ipDe(request, contexto) {
  if (contexto && contexto.ip) return contexto.ip;
  // Detras de un proxy todas las visitas llegan con la IP del proxy: sin
  // mirar esta cabecera el freno seria uno solo para todo el mundo, y
  // bastaria un atacante para dejar afuera a la duenia.
  const reenviada = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return reenviada || 'desconocida';
}

async function frenado(ip) {
  const estado = await leerFreno(claveFreno(ip));
  return !!(estado && estado.n >= INTENTOS_MAX && Date.now() < estado.hasta);
}

let fallosDesdeLaBarrida = 0;

async function anotarFallo(ip) {
  const clave = claveFreno(ip);
  const previo = await leerFreno(clave);
  const vigente = previo && Date.now() < previo.hasta ? previo.n : 0;
  await escribirFreno(clave, { n: vigente + 1, hasta: Date.now() + ESPERA });

  // Los frenos vencidos no caducan solos. Se barren de vez en cuando para
  // que la lista no crezca sin techo con cada IP que probo una vez.
  if (++fallosDesdeLaBarrida >= 50) {
    fallosDesdeLaBarrida = 0;
    try {
      const ahora = Date.now();
      for (const k of await listarFrenos()) {
        const e = await leerFreno(k);
        if (!e || e.hasta < ahora) await borrarFreno(k);
      }
    } catch (err) {
      console.error('no se pudieron barrer los frenos:', err.message);
    }
  }
}

/* ================= vistas ================= */

function vistaPublica(store) {
  return {
    settings: {
      ...store.settings,
      heroImagen: urlDe(store.settings.heroImagen)
    },
    categorias: store.categorias,
    productos: store.productos
      .filter((p) => p.visible !== false)
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        precio: p.precio,
        precioAntes: p.precioAntes || null,
        descripcion: p.descripcion,
        detalles: p.detalles || '',
        categoria: p.categoria,
        agotado: !!p.agotado,
        destacado: !!p.destacado,
        fotos: (p.fotos || []).filter(esRef).map(urlDe)
      }))
  };
}

// El panel tambien recibe las fotos como direccion, no como bytes. Mandar
// el catalogo con las imagenes incrustadas pasaba los 6 MB que aguanta una
// funcion, y el panel se quedaba sin cargar.
function vistaPanel(store) {
  return {
    settings: { ...store.settings, heroImagen: urlDe(store.settings.heroImagen) },
    categorias: store.categorias,
    productos: store.productos.map((p) => ({
      ...p,
      fotos: (p.fotos || []).filter(esRef).map(urlDe)
    }))
  };
}

/* ================= saneado ================= */

// Un ajuste tiene que conservar su forma. Si `pasos` deja de ser un arreglo,
// el sitio revienta al pintarlo y no se ve nada: el tipo se respeta siempre,
// y el texto se corta antes de que un pegado gigante infle el archivo.
const LARGO_AJUSTE = { terminos: 8000, devoluciones: 8000, privacidad: 8000 };

function sanearAjuste(clave, valor, actual) {
  if (Array.isArray(actual)) {
    if (!Array.isArray(valor)) return undefined;          // se ignora, no se rompe
    if (clave === 'pasos') {
      return valor.slice(0, 6).map((p) => ({
        titulo: String(p && p.titulo != null ? p.titulo : '').slice(0, 80),
        texto: String(p && p.texto != null ? p.texto : '').slice(0, 600)
      }));
    }
    return valor.slice(0, 50).map((x) => String(x).slice(0, 200));
  }
  if (typeof actual === 'string') {
    if (typeof valor !== 'string') return undefined;
    return valor.slice(0, LARGO_AJUSTE[clave] || 2000);
  }
  if (typeof actual === 'number') {
    const n = Number(valor);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof actual === 'boolean') return !!valor;
  return undefined;
}

async function sanearProducto(entrada, previo = {}) {
  // Acepta lo que la duenia escriba de verdad: "19500", "$19.500", "19,500",
  // "19.500,50". En Chile el punto separa miles, asi que "19.500" son
  // diecinueve mil quinientos y no diecinueve con medio.
  const num = (v) => {
    let s = String(v ?? '').replace(/[^\d.,]/g, '');
    if (!s) return 0;
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
      s = s.replace(/[.,]/g, '');
    } else {
      const ultimo = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
      if (ultimo !== -1) {
        const decimales = s.slice(ultimo + 1);
        s = decimales.length === 3
          ? s.replace(/[.,]/g, '')
          : s.slice(0, ultimo).replace(/[.,]/g, '') + '.' + decimales;
      }
    }
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
  };
  const texto = (v, max) => String(v ?? '').slice(0, max);

  // El panel manda las fotos que ya estaban como su direccion, y las nuevas
  // como data URL. normalizarLista guarda las nuevas y deja a todas
  // nombradas igual.
  const fotos = await normalizarLista(entrada.fotos);

  return {
    id: previo.id || randomUUID(),
    nombre: texto(entrada.nombre, 120) || 'Sin nombre',
    precio: num(entrada.precio),
    precioAntes: entrada.precioAntes ? num(entrada.precioAntes) : null,
    descripcion: texto(entrada.descripcion, 1200),
    detalles: texto(entrada.detalles, 600),
    categoria: texto(entrada.categoria, 60),
    visible: entrada.visible !== false,
    agotado: !!entrada.agotado,
    destacado: !!entrada.destacado,
    fotos: fotos === null ? (previo.fotos || []) : fotos,
    creado: previo.creado || new Date().toISOString(),
    actualizado: new Date().toISOString()
  };
}

/* ================= API ================= */

async function api(request, url, contexto) {
  const ruta = url.pathname;
  const metodo = request.method;

  if (ruta === '/api/site' && metodo === 'GET') {
    return json(request, 200, vistaPublica(await load()));
  }

  if (ruta === '/api/login' && metodo === 'POST') {
    const ip = ipDe(request, contexto);
    if (await frenado(ip)) {
      return json(request, 429, { error: 'Demasiados intentos. Espera unos minutos.' });
    }
    const body = await leerBody(request);
    const store = await load();
    if (!verifyPassword(String(body.password || ''), store.admin.password)) {
      await anotarFallo(ip);
      return json(request, 401, { error: 'Clave incorrecta' });
    }
    await borrarFreno(claveFreno(ip));
    return json(request, 200,
      { ok: true, claveDefecto: !!store.admin.passwordIsDefault },
      { 'set-cookie': cookieSesion(request, crearToken(store.secret)) });
  }

  if (ruta === '/api/logout' && metodo === 'POST') {
    return json(request, 200, { ok: true },
      { 'set-cookie': COOKIE + '=; Path=/; HttpOnly; Max-Age=0' });
  }

  if (ruta === '/api/sesion' && metodo === 'GET') {
    const store = await load();
    return json(request, 200, {
      autenticado: await autenticado(request),
      claveDefecto: !!store.admin.passwordIsDefault
    });
  }

  // De aqui abajo, todo pide sesion iniciada.
  if (!ruta.startsWith('/api/admin/')) return json(request, 404, { error: 'no existe' });
  if (!(await autenticado(request))) return json(request, 401, { error: 'Necesitas iniciar sesión' });

  if (ruta === '/api/admin/data' && metodo === 'GET') {
    return json(request, 200, vistaPanel(await load()));
  }

  if (ruta === '/api/admin/settings' && metodo === 'PUT') {
    const body = await leerBody(request);
    const entrantes = body.settings || {};

    // La portada viaja aparte del resto: puede venir como foto nueva (data
    // URL) o como la direccion de la que ya estaba.
    const hero = Object.prototype.hasOwnProperty.call(entrantes, 'heroImagen')
      ? await normalizarUna(entrantes.heroImagen)
      : undefined;

    const resultado = await saveConLimpieza((store) => {
      for (const [k, v] of Object.entries(entrantes)) {
        if (k === 'heroImagen') continue;
        // hasOwnProperty y no `in`: `in` acepta __proto__ y constructor,
        // que no son ajustes sino la maquinaria del objeto.
        if (!Object.prototype.hasOwnProperty.call(store.settings, k)) continue;
        const limpio = sanearAjuste(k, v, store.settings[k]);
        if (limpio !== undefined) store.settings[k] = limpio;
      }
      if (hero !== undefined) store.settings.heroImagen = hero;
      if (Array.isArray(body.categorias)) {
        store.categorias = body.categorias
          .map((c) => String(c).slice(0, 60).trim())
          .filter(Boolean)
          .slice(0, 20);
      }
      return { ...store.settings, heroImagen: urlDe(store.settings.heroImagen) };
    });
    return json(request, 200, { ok: true, settings: resultado });
  }

  if (ruta === '/api/admin/productos' && metodo === 'POST') {
    const body = await leerBody(request);
    const producto = await sanearProducto(body);
    await save((store) => { store.productos.unshift(producto); });
    return json(request, 201, {
      ok: true,
      producto: { ...producto, fotos: producto.fotos.map(urlDe) }
    });
  }

  const mProducto = ruta.match(/^\/api\/admin\/productos\/([\w-]+)$/);
  if (mProducto && metodo === 'PUT') {
    const body = await leerBody(request);
    const store = await load();
    const previo = store.productos.find((p) => p.id === mProducto[1]);
    if (!previo) return json(request, 404, { error: 'no existe' });

    const actualizado = await sanearProducto(body, previo);
    await saveConLimpieza((s) => {
      const i = s.productos.findIndex((p) => p.id === mProducto[1]);
      if (i !== -1) s.productos[i] = actualizado;
    });
    return json(request, 200, {
      ok: true,
      producto: { ...actualizado, fotos: actualizado.fotos.map(urlDe) }
    });
  }

  if (mProducto && metodo === 'DELETE') {
    await saveConLimpieza((store) => {
      store.productos = store.productos.filter((p) => p.id !== mProducto[1]);
    });
    return json(request, 200, { ok: true });
  }

  if (ruta === '/api/admin/orden' && metodo === 'POST') {
    const body = await leerBody(request);
    await save((store) => {
      const orden = Array.isArray(body.ids) ? body.ids : [];
      const mapa = new Map(store.productos.map((p) => [p.id, p]));
      const ordenados = orden.map((id) => mapa.get(id)).filter(Boolean);
      const resto = store.productos.filter((p) => !orden.includes(p.id));
      store.productos = [...ordenados, ...resto];
    });
    return json(request, 200, { ok: true });
  }

  if (ruta === '/api/admin/password' && metodo === 'POST') {
    const body = await leerBody(request);
    const nueva = String(body.nueva || '');
    if (nueva.length < 6) return json(request, 400, { error: 'La clave debe tener al menos 6 caracteres' });
    const store = await load();
    if (!verifyPassword(String(body.actual || ''), store.admin.password)) {
      return json(request, 401, { error: 'La clave actual no coincide' });
    }
    // Se cambia la clave justamente cuando se sospecha que alguien más entró.
    // Rotar el secreto invalida todas las sesiones abiertas, incluida la de
    // quien se metió; a quien hizo el cambio se le entrega una cookie nueva
    // para que no se caiga del panel.
    await save((s) => {
      s.admin.password = hashPassword(nueva);
      s.admin.passwordIsDefault = false;
      s.secret = randomBytes(32).toString('hex');
    });
    const actualizado = await load();
    return json(request, 200, { ok: true },
      { 'set-cookie': cookieSesion(request, crearToken(actualizado.secret)) });
  }

  if (ruta === '/api/admin/export' && metodo === 'GET') {
    const store = await load();
    // Las fotos salen como direccion. El panel las baja una por una y arma
    // el respaldo completo en el navegador: asi ninguna respuesta se pasa
    // del techo de la plataforma, por grande que sea el catalogo.
    const vista = vistaPanel(store);
    return json(request, 200, {
      version: store.version,
      settings: vista.settings,
      categorias: vista.categorias,
      productos: vista.productos
    });
  }

  // Deja el sitio con los textos del respaldo y sin productos. El panel
  // manda los productos despues, de a uno, por el mismo techo de tamano.
  if (ruta === '/api/admin/import' && metodo === 'POST') {
    const body = await leerBody(request);
    if (!body || typeof body !== 'object' || !body.settings) {
      return json(request, 400, { error: 'Respaldo inválido' });
    }
    const hero = await normalizarUna(body.settings.heroImagen);
    await replaceAll({
      version: body.version,
      settings: { ...body.settings, heroImagen: hero },
      categorias: Array.isArray(body.categorias) ? body.categorias : [],
      productos: []
    });
    return json(request, 200, { ok: true });
  }

  return json(request, 404, { error: 'no existe' });
}

/* ================= fotos ================= */

async function servirFoto(request, url) {
  const ref = decodeURIComponent(url.pathname.slice('/foto/'.length));
  if (!esRef(ref)) return null;

  const bytes = await bytesDe(ref);
  if (!bytes) {
    return responder(request, 404, 'text/plain; charset=utf-8', 'no existe', {
      'cache-control': 'no-store'
    });
  }

  const etag = '"' + ref + '"';
  if (request.headers.get('if-none-match') === etag) {
    return responder(request, 304, 'text/plain; charset=utf-8', null, { etag });
  }

  return responder(request, 200, tipoDe(ref), bytes, {
    etag,
    // El nombre del archivo es el hash de su contenido: si la foto cambia,
    // cambia la direccion. Por eso se puede cachear para siempre, tanto en
    // el navegador como en el borde de Netlify.
    'cache-control': 'public, max-age=31536000, immutable',
    'netlify-cdn-cache-control': 'public, max-age=31536000, immutable'
  });
}

/* ================= metadatos de la portada ================= */

// La bienvenida escribe el nombre letra por letra antes de que exista la
// API, y los buscadores y WhatsApp leen el HTML crudo. Todo eso se inyecta
// aca para que siempre coincida con lo que dice el panel.
async function metaPortada(request) {
  const store = await load();
  const s = store.settings;
  const base = origen(request);
  const marca = s.marca || 'Tienda';
  const descripcion = s.heroTexto || s.tagline || '';
  const visibles = store.productos.filter((p) => p.visible !== false);

  const og = [
    '<link rel="canonical" href="' + base + '/">',
    '<meta name="description" content="' + escaparHtml(descripcion) + '">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="' + escaparHtml(marca) + '">',
    '<meta property="og:title" content="' + escaparHtml(marca + ' — ' + (s.tagline || '')) + '">',
    '<meta property="og:description" content="' + escaparHtml(descripcion) + '">',
    '<meta property="og:url" content="' + base + '/">',
    '<meta property="og:locale" content="es_CL">',
    '<meta name="twitter:card" content="' + (esRef(s.heroImagen) ? 'summary_large_image' : 'summary') + '">'
  ];
  if (esRef(s.heroImagen)) {
    const u = base + urlDe(s.heroImagen);
    og.push('<meta property="og:image" content="' + u + '">');
    og.push('<meta name="twitter:image" content="' + u + '">');
  }

  // Datos estructurados: la tienda y su catalogo, para que los buscadores
  // entiendan que esto vende cosas y a que precio.
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: marca,
    description: descripcion,
    url: base + '/',
    inLanguage: 'es-CL',
    currenciesAccepted: s.moneda || 'CLP',
    ...(s.legalNombre ? { legalName: s.legalNombre } : {}),
    ...(s.email ? { email: s.email } : {}),
    ...(s.whatsapp ? { telephone: '+' + String(s.whatsapp).replace(/\D/g, '') } : {}),
    ...(s.instagram ? { sameAs: ['https://instagram.com/' + String(s.instagram).replace(/^@/, '')] } : {}),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Catálogo',
      itemListElement: visibles.slice(0, 50).map((p) => ({
        '@type': 'Product',
        name: p.nombre,
        ...(p.descripcion ? { description: p.descripcion } : {}),
        ...(p.categoria ? { category: p.categoria } : {}),
        ...(esRef((p.fotos || [])[0]) ? { image: base + urlDe(p.fotos[0]) } : {}),
        offers: {
          '@type': 'Offer',
          price: p.precio,
          priceCurrency: s.moneda || 'CLP',
          availability: p.agotado
            ? 'https://schema.org/OutOfStock'
            : 'https://schema.org/InStock'
        }
      }))
    }
  };

  og.push('<script type="application/ld+json">' +
    JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>');

  return { meta: og.join('\n'), marca, tagline: s.tagline || '' };
}

/* ================= archivos generados ================= */

function robots(request) {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
    'Sitemap: ' + origen(request) + '/sitemap.xml',
    ''
  ].join('\n');
}

function sitemap(request) {
  const base = origen(request);
  const hoy = new Date().toISOString().slice(0, 10);
  const paginas = [
    { loc: base + '/', prioridad: '1.0' },
    { loc: base + '/legal.html', prioridad: '0.3' }
  ];
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    paginas.map((p) =>
      '  <url><loc>' + p.loc + '</loc><lastmod>' + hoy + '</lastmod>' +
      '<priority>' + p.prioridad + '</priority></url>'
    ).join('\n') +
    '\n</urlset>\n';
}

async function manifiesto() {
  const store = await load();
  return JSON.stringify({
    name: store.settings.marca || 'Tienda',
    short_name: store.settings.marca || 'Tienda',
    description: store.settings.tagline || '',
    start_url: '/',
    display: 'standalone',
    background_color: '#fbf7fe',
    theme_color: '#fbf7fe',
    lang: 'es-CL',
    icons: [{ src: '/img/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
  }, null, 2);
}

function paginaNoExiste(marca) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Esta página no existe</title>
<link rel="icon" href="/img/favicon.svg">
<link rel="stylesheet" href="/css/site.css">
</head><body>
<main style="min-height:100vh;display:grid;place-items:center;text-align:center;padding:40px 24px">
  <div>
    <p class="etiqueta">Error 404</p>
    <h1 style="font-size:var(--t-h2);margin-bottom:18px">Esta página no existe</h1>
    <p style="color:var(--tinta-70);margin:0 auto 32px;max-width:40ch">
      Puede que el enlace esté malo o que la pieza ya no esté publicada.
    </p>
    <a class="boton" href="/">Volver a ${escaparHtml(marca)}</a>
  </div>
</main>
</body></html>`;
}

async function noExiste(request) {
  const store = await load();
  return responder(request, 404, 'text/html; charset=utf-8',
    paginaNoExiste(store.settings.marca || 'la tienda'), { 'cache-control': 'no-store' });
}

/* ================= paginas ================= */

// La portada no es un archivo suelto: lleva los metadatos y el nombre de la
// tienda incrustados, y esos salen de lo que diga el panel. Por eso vive en
// views/ y no en public/: si estuviera ahi, la CDN la serviria cruda, con
// los {{HUECOS}} a la vista.
async function portada(request) {
  const { meta, marca, tagline } = await metaPortada(request);
  const plantilla = await readFile(await rutaDe('views/index.html'), 'utf8');
  const texto = plantilla
    .replace('{{META}}', meta)
    .replace('{{MARCA}}', escaparHtml(marca))
    .replace('{{TAGLINE}}', escaparHtml(tagline));
  return responder(request, 200, MIME['.html'], texto, {
    'cache-control': 'no-cache',
    // Incluye el bloque JSON-LD, que cambia con el catalogo.
    'content-security-policy': csp(hashesDeScripts(texto))
  });
}

async function panel(request) {
  const html = await readFile(await rutaDe('public/admin.html'), 'utf8');
  return responder(request, 200, MIME['.html'], html, { 'cache-control': 'no-cache' });
}

// Solo hace falta en el computador: en Netlify los archivos de public/ los
// sirve la CDN y esta funcion ni se entera de ellos.
async function estatico(request, url) {
  const PUBLIC = await rutaDe('public');
  const rel = decodeURIComponent(url.pathname);
  const destino = path.join(PUBLIC, path.normalize(rel));
  // Con separador: sin el, una carpeta hermana llamada "public-algo" pasaria
  // el filtro, porque su ruta tambien empieza con la de "public".
  if (destino !== PUBLIC && !destino.startsWith(PUBLIC + path.sep)) return null;

  try {
    const info = await stat(destino);
    if (info.isDirectory()) return null;
    const ext = path.extname(destino).toLowerCase();
    // El html, el css y el js se revalidan siempre: sin esto, un arreglo
    // puede quedar invisible porque el navegador sirve la version vieja.
    const codigo = ext === '.html' || ext === '.css' || ext === '.js';
    return responder(request, 200, MIME[ext] || 'application/octet-stream',
      await readFile(destino), { 'cache-control': codigo ? 'no-cache' : 'public, max-age=3600' });
  } catch {
    return null;
  }
}

/* ================= entrada ================= */

export async function manejar(request, contexto = {}) {
  const url = new URL(request.url);
  const ruta = url.pathname;

  try {
    if (ruta.startsWith('/api/')) return await api(request, url, contexto);

    if (ruta.startsWith('/foto/')) {
      const r = await servirFoto(request, url);
      if (r) return r;
    }

    if (ruta === '/' || ruta === '/index.html') return await portada(request);
    if (ruta === '/admin' || ruta === '/admin/') return await panel(request);

    if (ruta === '/robots.txt') {
      return responder(request, 200, MIME['.txt'], robots(request),
        { 'cache-control': 'public, max-age=3600' });
    }
    if (ruta === '/sitemap.xml') {
      return responder(request, 200, MIME['.xml'], sitemap(request),
        { 'cache-control': 'public, max-age=3600' });
    }
    if (ruta === '/manifest.webmanifest') {
      return responder(request, 200, MIME['.webmanifest'], await manifiesto(),
        { 'cache-control': 'public, max-age=3600' });
    }

    const archivo = await estatico(request, url);
    if (archivo) return archivo;

    return await noExiste(request);
  } catch (err) {
    if (err instanceof ErrorHttp) {
      return json(request, err.codigo, { error: err.message });
    }
    // El detalle va al registro del servidor, no a la pantalla: los mensajes
    // de Node traen rutas completas del disco y eso es un mapa gratis para
    // quien esté mirando.
    console.error('[' + new Date().toISOString() + ']', request.method, ruta, err);
    return json(request, 500, { error: 'Algo falló en el servidor. Intenta de nuevo.' });
  }
}
