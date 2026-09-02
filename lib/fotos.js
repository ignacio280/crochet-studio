// Las fotos no viajan dentro del JSON del sitio: se guardan aparte y en el
// JSON queda solo su nombre.
//
// El nombre es el hash de los bytes mas la extension: "a1b2....jpg". Eso da
// tres cosas gratis: dos productos con la misma foto la comparten, la URL
// cambia sola cuando la foto cambia (y por eso se puede cachear para
// siempre), y nunca hay que inventar identificadores.
import { createHash } from 'node:crypto';
import { guardarFoto, leerFoto, listarFotos, borrarFoto } from './almacen.js';

const TIPOS = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif'
};

const MIME = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif'
};

const REF = /^[0-9a-f]{32}\.(jpg|png|webp|gif|avif)$/;

export function esRef(valor) {
  return typeof valor === 'string' && REF.test(valor);
}

export function tipoDe(ref) {
  const ext = String(ref).split('.').pop();
  return MIME[ext] || 'application/octet-stream';
}

export function urlDe(ref) {
  return esRef(ref) ? '/foto/' + ref : '';
}

// El panel manda las fotos que ya estaban como la URL que recibio, y las
// nuevas como data URL. Aca se acepta cualquiera de las dos.
export function refDeUrl(valor) {
  if (typeof valor !== 'string') return null;
  const m = /^\/foto\/([0-9a-f]{32}\.\w+)$/.exec(valor.split('?')[0]);
  if (m && esRef(m[1])) return m[1];
  return esRef(valor) ? valor : null;
}

const LIMITE_FOTO = 6 * 1024 * 1024;

// Guarda una data URL y devuelve su nombre. null si no es una imagen que
// sepamos servir.
export async function desdeDataUrl(dataUrl) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl || '');
  if (!m) return null;
  const ext = TIPOS[m[1].toLowerCase()];
  if (!ext) return null;

  let bytes;
  try {
    bytes = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]));
  } catch {
    return null;
  }
  if (!bytes.length || bytes.length > LIMITE_FOTO) return null;

  const ref = createHash('sha256').update(bytes).digest('hex').slice(0, 32) + '.' + ext;
  await guardarFoto(ref, bytes);
  return ref;
}

// Un valor suelto que puede ser foto nueva, foto que ya estaba, o basura.
export async function normalizarUna(valor) {
  if (typeof valor !== 'string' || !valor) return '';
  if (valor.startsWith('data:')) return (await desdeDataUrl(valor)) || '';
  return refDeUrl(valor) || '';
}

export async function normalizarLista(valores, maximo = 6) {
  if (!Array.isArray(valores)) return null;
  const salida = [];
  for (const v of valores.slice(0, maximo)) {
    const ref = await normalizarUna(v);
    if (ref) salida.push(ref);
  }
  return salida;
}

export async function bytesDe(ref) {
  if (!esRef(ref)) return null;
  return await leerFoto(ref);
}

// Al borrar un producto o cambiarle la foto, la anterior queda sin dueno.
// Nadie la pide nunca mas, pero ocupa lugar: se barre despues de guardar.
export async function recolectarBasura(datos) {
  const vivas = new Set();
  if (esRef(datos.settings && datos.settings.heroImagen)) vivas.add(datos.settings.heroImagen);
  for (const p of datos.productos || []) {
    for (const f of p.fotos || []) if (esRef(f)) vivas.add(f);
  }
  const guardadas = await listarFotos();
  for (const ref of guardadas) {
    if (!vivas.has(ref)) await borrarFoto(ref);
  }
}
