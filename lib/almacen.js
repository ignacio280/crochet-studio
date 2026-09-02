// Donde viven los bytes.
//
// Dos respaldos con la misma forma:
//   - En Netlify, Netlify Blobs. No hay disco: lo que se escriba en el
//     sistema de archivos de una funcion desaparece cuando se apaga.
//   - En el computador, archivos dentro de data/. Asi `node server.js`
//     sigue funcionando sin cuenta ni conexion.
//
// Se guardan tres cosas separadas, y no un solo JSON gigante:
//   datos  -> textos, precios, categorias (unos pocos KB)
//   fotos  -> una entrada por foto, nombrada por el hash de su contenido
//   frenos -> el contador de intentos fallidos de entrada
//
// La separacion no es prolijidad: una funcion de Netlify no puede recibir
// ni devolver mas de 6 MB, y un catalogo con veinte fotos incrustadas en el
// JSON pasa ese techo y deja el panel inservible.
import { readFile, writeFile, rename, mkdir, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const ARCHIVO_DATOS = path.join(DATA_DIR, 'store.json');
const DIR_FOTOS = path.join(DATA_DIR, 'fotos');

// Netlify define esta variable en las funciones y en `netlify dev`. Si no
// esta, estamos en un computador y se usan archivos.
export const enNetlify = !!(process.env.NETLIFY_BLOBS_CONTEXT || process.env.NETLIFY);

/* ================= Netlify Blobs ================= */

const tiendas = new Map();

async function tienda(nombre) {
  if (tiendas.has(nombre)) return tiendas.get(nombre);
  const { getStore } = await import('@netlify/blobs');
  const t = getStore(nombre);
  tiendas.set(nombre, t);
  return t;
}

// Lectura fuerte en todo. Por defecto Blobs es consistente "eventual": una
// foto recien subida podria contestar 404 en el mismo segundo, y el panel
// mostraria un hueco donde la duenia acaba de poner algo.
const FUERTE = { consistency: 'strong' };

/* ================= datos ================= */

export async function leerDatos() {
  if (enNetlify) {
    const t = await tienda('sitio');
    return await t.get('datos', { ...FUERTE, type: 'json' });
  }
  try {
    return JSON.parse(await readFile(ARCHIVO_DATOS, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('store.json ilegible, se parte de cero:', err.message);
    }
    return null;
  }
}

// Las escrituras van de a una. El panel dispara varias a la vez — "borrar
// los ejemplos" manda cinco borrados en paralelo — y dos guardados cruzados
// se pisan.
let cola = Promise.resolve();
let contadorTmp = 0;

export function escribirDatos(datos) {
  const siguiente = () => escribirDatosAhora(datos);
  cola = cola.then(siguiente, siguiente);
  return cola;
}

async function escribirDatosAhora(datos) {
  if (enNetlify) {
    const t = await tienda('sitio');
    await t.setJSON('datos', datos);
    return;
  }
  await mkdir(DATA_DIR, { recursive: true });
  // Nombre propio por escritura: aunque algo se cruce, nadie pisa el
  // temporal de otro. El rename sigue siendo atomico, que es lo que protege
  // al archivo bueno de quedar a medio escribir.
  const tmp = `${ARCHIVO_DATOS}.${process.pid}.${contadorTmp++}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(datos, null, 2), 'utf8');
    await rename(tmp, ARCHIVO_DATOS);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

/* ================= fotos ================= */

export async function leerFoto(ref) {
  if (enNetlify) {
    const t = await tienda('fotos');
    const datos = await t.get(ref, { ...FUERTE, type: 'arrayBuffer' });
    return datos ? Buffer.from(datos) : null;
  }
  try {
    return await readFile(path.join(DIR_FOTOS, ref));
  } catch {
    return null;
  }
}

export async function guardarFoto(ref, bytes) {
  if (enNetlify) {
    const t = await tienda('fotos');
    // Blobs acepta ArrayBuffer, no el Buffer de Node: hay que sacarle la
    // ventana de bytes o lo guarda como el texto "[object Uint8Array]".
    const crudo = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    // El nombre es el hash del contenido: si ya esta, es byte por byte la
    // misma foto y reescribirla no cambia nada.
    await t.set(ref, crudo);
    return;
  }
  await mkdir(DIR_FOTOS, { recursive: true });
  const tmp = path.join(DIR_FOTOS, `${ref}.${process.pid}.${contadorTmp++}.tmp`);
  try {
    await writeFile(tmp, bytes);
    await rename(tmp, path.join(DIR_FOTOS, ref));
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

export async function listarFotos() {
  if (enNetlify) {
    const t = await tienda('fotos');
    const { blobs } = await t.list();
    return blobs.map((b) => b.key);
  }
  try {
    return (await readdir(DIR_FOTOS)).filter((n) => !n.endsWith('.tmp'));
  } catch {
    return [];
  }
}

export async function borrarFoto(ref) {
  if (enNetlify) {
    const t = await tienda('fotos');
    await t.delete(ref);
    return;
  }
  await rm(path.join(DIR_FOTOS, ref), { force: true });
}

/* ================= frenos de entrada ================= */

// En un servidor de siempre esto vivia en un Map y alcanzaba. En serverless
// cada peticion puede caer en una copia distinta del proceso, con su propio
// Map vacio: el freno no frenaria nada y bastaria pedir en paralelo para
// probar claves sin limite. Por eso el contador se guarda afuera.
const frenosEnMemoria = new Map();

export async function leerFreno(clave) {
  if (enNetlify) {
    const t = await tienda('frenos');
    return await t.get(clave, { ...FUERTE, type: 'json' });
  }
  return frenosEnMemoria.get(clave) || null;
}

export async function escribirFreno(clave, estado) {
  if (enNetlify) {
    const t = await tienda('frenos');
    await t.setJSON(clave, estado);
    return;
  }
  frenosEnMemoria.set(clave, estado);
}

export async function borrarFreno(clave) {
  if (enNetlify) {
    const t = await tienda('frenos');
    await t.delete(clave);
    return;
  }
  frenosEnMemoria.delete(clave);
}

export async function listarFrenos() {
  if (enNetlify) {
    const t = await tienda('frenos');
    const { blobs } = await t.list();
    return blobs.map((b) => b.key);
  }
  return [...frenosEnMemoria.keys()];
}
