// Servidor sin dependencias: sirve el sitio publico y la API del panel.
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash, randomBytes } from 'node:crypto';
import { load, save, replaceAll, hashPassword, verifyPassword } from './lib/store.js';
import { crearToken, tokenValido, leerCookie } from './lib/auth.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 4400;
const COOKIE = 'crochet_sesion';
const LIMITE_BODY = 30 * 1024 * 1024; // 30 MB: las fotos llegan como data URL

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

// Lo que se comprime: texto. Las fotos ya vienen comprimidas y gastar CPU
// en re-comprimirlas no gana nada.
const COMPRIMIBLE = /^(text\/|application\/(json|xml|manifest))/;

const intentos = new Map(); // ip -> { n, hasta }

// Detras de un proxy (Render, Fly, nginx) todas las visitas llegan con la IP
// del proxy: sin esto el freno de intentos seria uno solo para todo el mundo,
// y bastaria un atacante para dejar afuera a la duenia.
function ipDe(req) {
  const reenviada = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return reenviada || req.socket.remoteAddress || 'desconocida';
}

// El mapa no puede crecer para siempre: se barren los frenos ya vencidos.
setInterval(() => {
  const ahora = Date.now();
  for (const [ip, estado] of intentos) if (estado.hasta < ahora) intentos.delete(ip);
}, 10 * 60 * 1000).unref();

/* ================= utilidades ================= */

function escaparHtml(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hashCorto(texto) {
  return createHash('sha1').update(texto).digest('hex').slice(0, 8);
}

// La CSP ya no lleva 'unsafe-inline' en los scripts. El unico script en
// linea es el guardia de la bienvenida, y va autorizado por su hash: si
// alguien logra inyectar otro script, el navegador se niega a correrlo.
function csp(hashesEnLinea = []) {
  return [
    "default-src 'self'",
    "img-src 'self' data:",                                  // data: para el editor del panel
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
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
    // si se hashean los bytes crudos, nunca coincide y el script queda bloqueado.
    const contenido = m[2].split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
    hashes.push("'sha256-" + createHash('sha256').update(contenido, 'utf8').digest('base64') + "'");
  }
  return hashes;
}

// Cabeceras de seguridad en todas las respuestas.
function cabecerasSeguras(req, res) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('content-security-policy', csp());
  if (esHttps(req)) {
    res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }
}

function esHttps(req) {
  return (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https';
}

function origen(req) {
  const host = req.headers.host || ('localhost:' + PORT);
  return (esHttps(req) ? 'https://' : 'http://') + host;
}

// Envia el cuerpo, comprimido si el navegador lo acepta y vale la pena.
function enviar(req, res, code, tipo, cuerpo, extra = {}) {
  const buf = Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.from(cuerpo);
  const cabeceras = { 'content-type': tipo, ...extra };

  const aceptaGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (aceptaGzip && COMPRIMIBLE.test(tipo) && buf.length > 1024) {
    zlib.gzip(buf, (err, comprimido) => {
      if (err) {
        res.writeHead(code, { ...cabeceras, 'content-length': buf.length });
        return res.end(buf);
      }
      res.writeHead(code, {
        ...cabeceras,
        'content-encoding': 'gzip',
        'vary': 'Accept-Encoding',
        'content-length': comprimido.length
      });
      res.end(comprimido);
    });
    return;
  }

  res.writeHead(code, { ...cabeceras, 'content-length': buf.length });
  res.end(buf);
}

function json(req, res, code, data) {
  enviar(req, res, code, 'application/json; charset=utf-8', JSON.stringify(data), {
    'cache-control': 'no-store'
  });
}

function leerBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const trozos = [];
    req.on('data', (t) => {
      total += t.length;
      if (total > LIMITE_BODY) {
        reject(new Error('demasiado grande'));
        req.destroy();
        return;
      }
      trozos.push(t);
    });
    req.on('end', () => {
      if (!trozos.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(trozos).toString('utf8')));
      } catch {
        reject(new Error('json invalido'));
      }
    });
    req.on('error', reject);
  });
}

async function autenticado(req) {
  const store = await load();
  return tokenValido(leerCookie(req, COOKIE), store.secret);
}

/* ================= fotos como archivos de verdad ================= */

// Las fotos se guardan como data URL dentro del store, pero servirlas
// incrustadas en el JSON obliga a re-descargarlas enteras en cada visita.
// Salen por una URL propia para que el navegador las cachee, se carguen
// en diferido y sirvan para las miniaturas sociales.
function urlFoto(id, i, dataUrl) {
  return '/foto/' + id + '/' + i + '.jpg?v=' + hashCorto(dataUrl);
}

function decodificarDataUrl(dataUrl) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl || '');
  if (!m) return null;
  return {
    tipo: m[1],
    bytes: m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]))
  };
}

async function servirFoto(req, res, url) {
  const m = /^\/foto\/([\w-]+)\/(\d+)\.jpg$/.exec(url.pathname);
  if (!m) return false;

  const store = await load();
  let dataUrl = null;

  if (m[1] === 'portada') {
    dataUrl = store.settings.heroImagen;
  } else {
    const p = store.productos.find((x) => x.id === m[1]);
    if (p && p.visible !== false) dataUrl = (p.fotos || [])[Number(m[2])];
  }

  const foto = decodificarDataUrl(dataUrl);
  if (!foto) {
    enviar(req, res, 404, 'text/plain; charset=utf-8', 'no existe');
    return true;
  }

  const etag = '"' + hashCorto(dataUrl) + '"';
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag });
    res.end();
    return true;
  }

  enviar(req, res, 200, foto.tipo, foto.bytes, {
    etag,
    // La URL lleva el hash del contenido: si la foto cambia, cambia la URL.
    'cache-control': 'public, max-age=31536000, immutable'
  });
  return true;
}

/* ================= vista publica ================= */

function vistaPublica(store) {
  return {
    settings: {
      ...store.settings,
      heroImagen: store.settings.heroImagen
        ? urlFoto('portada', 0, store.settings.heroImagen)
        : ''
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
        fotos: (p.fotos || []).map((f, i) => urlFoto(p.id, i, f))
      }))
  };
}

// Un ajuste tiene que conservar su forma. Si `pasos` deja de ser un arreglo,
// el sitio revienta al pintarlo y no se ve nada: el tipo se respeta siempre,
// y el texto se corta antes de que un pegado gigante infle el archivo.
const LARGO_AJUSTE = { terminos: 8000, devoluciones: 8000, privacidad: 8000, heroImagen: 8 * 1024 * 1024 };

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

function sanearProducto(entrada, previo = {}) {
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
    fotos: Array.isArray(entrada.fotos)
      ? entrada.fotos.filter((f) => typeof f === 'string' && f.startsWith('data:image/')).slice(0, 6)
      : previo.fotos || [],
    creado: previo.creado || new Date().toISOString(),
    actualizado: new Date().toISOString()
  };
}

/* ================= API ================= */

async function api(req, res, url) {
  const ruta = url.pathname;
  const metodo = req.method;

  if (ruta === '/api/site' && metodo === 'GET') {
    return json(req, res, 200, vistaPublica(await load()));
  }

  if (ruta === '/api/login' && metodo === 'POST') {
    const ip = ipDe(req);
    const estado = intentos.get(ip);
    if (estado && estado.n >= 8 && Date.now() < estado.hasta) {
      return json(req, res, 429, { error: 'Demasiados intentos. Espera unos minutos.' });
    }
    const body = await leerBody(req);
    const store = await load();
    if (!verifyPassword(String(body.password || ''), store.admin.password)) {
      const n = (estado ? estado.n : 0) + 1;
      intentos.set(ip, { n, hasta: Date.now() + 10 * 60 * 1000 });
      return json(req, res, 401, { error: 'Clave incorrecta' });
    }
    intentos.delete(ip);
    const token = crearToken(store.secret);
    const flags = ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=2592000'];
    if (esHttps(req)) flags.push('Secure');
    res.setHeader('set-cookie', COOKIE + '=' + token + '; ' + flags.join('; '));
    return json(req, res, 200, { ok: true, claveDefecto: !!store.admin.passwordIsDefault });
  }

  if (ruta === '/api/logout' && metodo === 'POST') {
    res.setHeader('set-cookie', COOKIE + '=; Path=/; HttpOnly; Max-Age=0');
    return json(req, res, 200, { ok: true });
  }

  if (ruta === '/api/sesion' && metodo === 'GET') {
    const store = await load();
    return json(req, res, 200, {
      autenticado: await autenticado(req),
      claveDefecto: !!store.admin.passwordIsDefault
    });
  }

  // De aqui abajo, todo pide sesion iniciada.
  if (!ruta.startsWith('/api/admin/')) return json(req, res, 404, { error: 'no existe' });
  if (!(await autenticado(req))) return json(req, res, 401, { error: 'Necesitas iniciar sesión' });

  if (ruta === '/api/admin/data' && metodo === 'GET') {
    const store = await load();
    // El panel si recibe las data URL: son las que edita.
    return json(req, res, 200, {
      settings: store.settings,
      categorias: store.categorias,
      productos: store.productos
    });
  }

  if (ruta === '/api/admin/settings' && metodo === 'PUT') {
    const body = await leerBody(req);
    const resultado = await save((store) => {
      for (const [k, v] of Object.entries(body.settings || {})) {
        // hasOwnProperty y no `in`: `in` acepta __proto__ y constructor,
        // que no son ajustes sino la maquinaria del objeto.
        if (!Object.prototype.hasOwnProperty.call(store.settings, k)) continue;
        const limpio = sanearAjuste(k, v, store.settings[k]);
        if (limpio !== undefined) store.settings[k] = limpio;
      }
      if (Array.isArray(body.categorias)) {
        store.categorias = body.categorias
          .map((c) => String(c).slice(0, 60).trim())
          .filter(Boolean)
          .slice(0, 20);
      }
      return store.settings;
    });
    return json(req, res, 200, { ok: true, settings: resultado });
  }

  if (ruta === '/api/admin/productos' && metodo === 'POST') {
    const body = await leerBody(req);
    const nuevo = await save((store) => {
      const p = sanearProducto(body);
      store.productos.unshift(p);
      return p;
    });
    return json(req, res, 201, { ok: true, producto: nuevo });
  }

  const mProducto = ruta.match(/^\/api\/admin\/productos\/([\w-]+)$/);
  if (mProducto && metodo === 'PUT') {
    const body = await leerBody(req);
    const actualizado = await save((store) => {
      const i = store.productos.findIndex((p) => p.id === mProducto[1]);
      if (i === -1) return null;
      store.productos[i] = sanearProducto(body, store.productos[i]);
      return store.productos[i];
    });
    if (!actualizado) return json(req, res, 404, { error: 'no existe' });
    return json(req, res, 200, { ok: true, producto: actualizado });
  }

  if (mProducto && metodo === 'DELETE') {
    await save((store) => {
      store.productos = store.productos.filter((p) => p.id !== mProducto[1]);
    });
    return json(req, res, 200, { ok: true });
  }

  if (ruta === '/api/admin/orden' && metodo === 'POST') {
    const body = await leerBody(req);
    await save((store) => {
      const orden = Array.isArray(body.ids) ? body.ids : [];
      const mapa = new Map(store.productos.map((p) => [p.id, p]));
      const ordenados = orden.map((id) => mapa.get(id)).filter(Boolean);
      const resto = store.productos.filter((p) => !orden.includes(p.id));
      store.productos = [...ordenados, ...resto];
    });
    return json(req, res, 200, { ok: true });
  }

  if (ruta === '/api/admin/password' && metodo === 'POST') {
    const body = await leerBody(req);
    const nueva = String(body.nueva || '');
    if (nueva.length < 6) return json(req, res, 400, { error: 'La clave debe tener al menos 6 caracteres' });
    const store = await load();
    if (!verifyPassword(String(body.actual || ''), store.admin.password)) {
      return json(req, res, 401, { error: 'La clave actual no coincide' });
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
    const flags = ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=2592000'];
    if (esHttps(req)) flags.push('Secure');
    res.setHeader('set-cookie', COOKIE + '=' + crearToken(actualizado.secret) + '; ' + flags.join('; '));
    return json(req, res, 200, { ok: true });
  }

  if (ruta === '/api/admin/export' && metodo === 'GET') {
    const store = await load();
    return json(req, res, 200, {
      version: store.version,
      settings: store.settings,
      categorias: store.categorias,
      productos: store.productos
    });
  }

  if (ruta === '/api/admin/import' && metodo === 'POST') {
    const body = await leerBody(req);
    if (!body || !Array.isArray(body.productos)) return json(req, res, 400, { error: 'Respaldo inválido' });
    await replaceAll(body);
    return json(req, res, 200, { ok: true });
  }

  return json(req, res, 404, { error: 'no existe' });
}

/* ================= metadatos de la portada ================= */

// La bienvenida escribe el nombre letra por letra antes de que exista la
// API, y los buscadores y WhatsApp leen el HTML crudo. Todo eso se inyecta
// aca para que siempre coincida con lo que dice el panel.
async function metaPortada(req) {
  const store = await load();
  const s = store.settings;
  const base = origen(req);
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
    '<meta name="twitter:card" content="' + (s.heroImagen ? 'summary_large_image' : 'summary') + '">'
  ];
  if (s.heroImagen) {
    const u = base + urlFoto('portada', 0, s.heroImagen);
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
        ...(p.fotos && p.fotos.length ? { image: base + urlFoto(p.id, 0, p.fotos[0]) } : {}),
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

function robots(req) {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
    'Sitemap: ' + origen(req) + '/sitemap.xml',
    ''
  ].join('\n');
}

function sitemap(req) {
  const base = origen(req);
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

/* ================= estaticos ================= */

async function estatico(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  if (rel === '/admin' || rel === '/admin/') rel = '/admin.html';

  const destino = path.join(PUBLIC, path.normalize(rel));
  // Con separador: sin el, una carpeta hermana llamada "public-algo" pasaria
  // el filtro, porque su ruta tambien empieza con la de "public".
  if (destino !== PUBLIC && !destino.startsWith(PUBLIC + path.sep)) {
    enviar(req, res, 403, 'text/plain; charset=utf-8', 'no');
    return;
  }

  try {
    const info = await stat(destino);
    if (info.isDirectory()) throw new Error('dir');
    const ext = path.extname(destino).toLowerCase();
    // El html, el css y el js se revalidan siempre: sin esto, un arreglo
    // puede quedar invisible porque el navegador sirve la version vieja.
    const codigo = ext === '.html' || ext === '.css' || ext === '.js';
    const cache = codigo ? 'no-cache' : 'public, max-age=3600';

    if (rel === '/index.html') {
      const { meta, marca, tagline } = await metaPortada(req);
      const texto = (await readFile(destino, 'utf8'))
        .replace('{{META}}', meta)
        .replace('{{MARCA}}', escaparHtml(marca))
        .replace('{{TAGLINE}}', escaparHtml(tagline));
      // Incluye el bloque JSON-LD, que cambia con el catalogo.
      res.setHeader('content-security-policy', csp(hashesDeScripts(texto)));
      return enviar(req, res, 200, MIME[ext], texto, { 'cache-control': cache });
    }

    return enviar(req, res, 200, MIME[ext] || 'application/octet-stream',
      await readFile(destino), { 'cache-control': cache });
  } catch {
    const store = await load();
    enviar(req, res, 404, 'text/html; charset=utf-8',
      paginaNoExiste(store.settings.marca || 'la tienda'), { 'cache-control': 'no-store' });
  }
}

/* ================= servidor ================= */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  cabecerasSeguras(req, res);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/foto/')) {
      if (await servirFoto(req, res, url)) return;
    }
    if (url.pathname === '/robots.txt') {
      return enviar(req, res, 200, MIME['.txt'], robots(req), { 'cache-control': 'public, max-age=3600' });
    }
    if (url.pathname === '/sitemap.xml') {
      return enviar(req, res, 200, MIME['.xml'], sitemap(req), { 'cache-control': 'public, max-age=3600' });
    }
    if (url.pathname === '/manifest.webmanifest') {
      return enviar(req, res, 200, MIME['.webmanifest'], await manifiesto(), { 'cache-control': 'public, max-age=3600' });
    }
    return await estatico(req, res, url);
  } catch (err) {
    // El detalle va al registro del servidor, no a la pantalla: los mensajes
    // de Node traen rutas completas del disco y eso es un mapa gratis para
    // quien esté mirando.
    console.error('[' + new Date().toISOString() + ']', req.method, url.pathname, err);
    if (!res.headersSent) json(req, res, 500, { error: 'Algo falló en el servidor. Intenta de nuevo.' });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log('\n  Tienda   ->  http://localhost:' + PORT);
  console.log('  Panel    ->  http://localhost:' + PORT + '/admin\n');
});
