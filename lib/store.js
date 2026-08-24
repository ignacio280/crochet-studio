// Capa de persistencia.
// Por defecto guarda todo en data/store.json (un solo archivo, facil de respaldar).
// Si existe DATABASE_URL, guarda el mismo JSON en una fila de Postgres, para que
// los datos sobrevivan en hostings de disco efimero (Render/Railway free).
import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const FILE = path.join(DATA_DIR, 'store.json');

export function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(plain, stored) {
  if (typeof stored !== 'string' || !stored.startsWith('scrypt:')) return false;
  const [, salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(plain, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function ejemplo(nombre, precio, categoria, descripcion, detalles, destacado = false) {
  return {
    id: randomBytes(8).toString('hex'),
    nombre,
    precio,
    precioAntes: null,
    descripcion,
    detalles,
    categoria,
    visible: true,
    agotado: false,
    destacado,
    fotos: [],
    esEjemplo: true,
    creado: new Date().toISOString(),
    actualizado: new Date().toISOString()
  };
}

// Alfabeto sin caracteres que se confunden al leerlos o dictarlos:
// nada de 0/O, 1/l/I. La clave se va a copiar a mano desde un registro.
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';

export function generarClave() {
  const bytes = randomBytes(15);
  let salida = '';
  for (let i = 0; i < 15; i++) {
    if (i > 0 && i % 5 === 0) salida += '-';
    salida += ALFABETO[bytes[i] % ALFABETO.length];
  }
  return salida;   // p.ej. k7mfp-xq2rn-bd9jt
}

function defaultStore(clavePlana) {
  return {
    version: 1,
    secret: randomBytes(32).toString('hex'),
    admin: {
      password: hashPassword(clavePlana || 'sin-clave'),
      passwordIsDefault: !process.env.ADMIN_PASSWORD
    },
    settings: {
      marca: 'SDB',
      tagline: 'Taller de crochet',
      anuncio: 'Envíos a todo Chile — hecho a mano, de a una pieza',
      heroTitulo: 'Una pieza\na la vez',
      heroTexto: 'Piezas únicas de crochet, pensadas para durar. Cada una toma su tiempo y ninguna sale igual a la anterior.',
      heroCta: 'Ver la tienda',
      heroImagen: '',
      bandaTitulo: 'Hecho despacio,\npara que dure',
      bandaTexto: 'Elijo los hilos de a poco y tejo cada pieza yo misma. Si quieres algo en otro color o en otra talla, se puede: escríbeme y lo conversamos.',
      bandaCta: 'Encargar algo mío',
      pasosTitulo: 'Cómo encargar',
      pasos: [
        { titulo: 'Paso uno', texto: 'Mira el catálogo y elige la pieza que te gustó. Si quieres otro color, dímelo.' },
        { titulo: 'Paso dos', texto: 'Aprietas "Pedir por WhatsApp" y me llega tu pedido con la pieza ya escrita.' },
        { titulo: 'Paso tres', texto: 'Coordinamos pago y envío. Te aviso cuando esté listo y te mando la foto antes de despacharlo.' }
      ],
      whatsapp: '56900000000',
      instagram: '',
      email: '',
      envioTexto: 'Envío a todo Chile por Starken o Chilexpress. Retiro coordinado en Santiago.',
      moneda: 'CLP',
      pieDeFirma: '',

      // --- Legal ---
      // La identificación del vendedor es obligatoria por la Ley del
      // Consumidor. Los textos de abajo son un BORRADOR BASE: sirven para
      // no partir de cero, pero hay que revisarlos antes de publicar.
      legalNombre: '',
      legalRut: '',
      legalComuna: '',
      terminos: [
        'Estas piezas se tejen a mano, de a una. Antes de comprar conviene tener claro lo siguiente.',
        '',
        'PRECIOS',
        'Todos los precios están en pesos chilenos e incluyen IVA. El costo del despacho se informa aparte, antes de que confirmes el pedido.',
        '',
        'PLAZOS',
        'Cada pieza toma tiempo. Al confirmar el pedido te digo el plazo estimado para esa pieza en particular. Si algo se atrasa, te aviso apenas lo sepa.',
        '',
        'PIEZAS HECHAS A PEDIDO',
        'Si encargas una pieza en un color, talla o medida distinta a la publicada, se considera hecha a tu pedido. Estas piezas no admiten retracto una vez empezadas, porque se tejen especialmente para ti.',
        '',
        'RETRACTO',
        'Para las piezas ya publicadas en el catálogo tienes 10 días desde que recibes el pedido para arrepentirte, según la Ley 19.496. La pieza debe volver sin uso y en las mismas condiciones. El costo de la devolución corre por tu cuenta, salvo que la pieza haya llegado con falla.',
        '',
        'DIFERENCIAS DE COLOR',
        'Las fotos pueden variar levemente respecto del color real, según la pantalla y la luz. No es una falla.'
      ].join('\n'),
      devoluciones: [
        'GARANTÍA LEGAL',
        'Si la pieza llega con falla, tienes derecho a elegir entre cambio, reparación o devolución del dinero, dentro del plazo que fija la Ley del Consumidor. Escríbeme con fotos y lo resolvemos.',
        '',
        'QUÉ CUENTA COMO FALLA',
        'Puntos sueltos, costuras abiertas, diferencias con lo que se ofreció o daños ocurridos en el transporte.',
        '',
        'QUÉ NO CUENTA',
        'El desgaste por uso, el daño por lavado incorrecto y las pequeñas irregularidades propias de algo tejido a mano: ninguna pieza sale idéntica a otra, y eso es parte de lo que estás comprando.',
        '',
        'CUIDADO DEL TEJIDO',
        'Cada pieza va con sus instrucciones. Lavar a mano en agua fría y secar plana alarga muchísimo la vida del tejido.',
        '',
        'CÓMO PEDIRLO',
        'Escríbeme por WhatsApp con tu nombre, la pieza y una foto del problema.'
      ].join('\n'),
      privacidad: [
        'Este sitio no recolecta datos.',
        '',
        'No tiene formularios, ni carrito, ni cuentas de usuario. No usa cookies, ni analítica, ni rastreadores de terceros. No queda guardado nada sobre quien visita la página.',
        '',
        'Los pedidos se conversan por WhatsApp. Los datos que me des ahí — tu nombre, tu dirección de despacho, tu teléfono — los uso únicamente para preparar y enviar tu pedido, y para responderte. No los comparto con nadie ni los uso para publicidad.',
        '',
        'WhatsApp es un servicio de terceros y tiene sus propias políticas, que no dependen de mí.',
        '',
        'Si quieres que borre tus datos de contacto, pídemelo y lo hago.'
      ].join('\n')
    },
    categorias: ['Ropa', 'Accesorios', 'Deco', 'Amigurumi'],
    // Productos de ejemplo para que la tienda no se vea vacia la primera vez.
    // Se editan o se borran desde el panel.
    productos: [
      ejemplo('Chaleco de lana gruesa', 38000, 'Ropa',
        'Tejido en punto alto con lana chilena. Cae suelto y abriga de verdad.',
        'Talla única. Lavar a mano en agua fría y secar plano.', true),
      ejemplo('Bolso de rafia', 22000, 'Accesorios',
        'Bolso firme de rafia natural, con asas reforzadas para que aguante el peso.',
        '32 x 28 cm. Forro interior de algodón.'),
      ejemplo('Gorro de invierno', 14000, 'Accesorios',
        'Gorro de punto elástico, ajustado pero sin apretar. Sale en el color que quieras.',
        'Talla adulto. Lana merino.'),
      ejemplo('Manta para sillón', 52000, 'Deco',
        'Manta grande de cuadros unidos a mano. Toma varias semanas y por eso hay pocas.',
        '150 x 120 cm. Lana mezcla.'),
      ejemplo('Osito amigurumi', 12000, 'Amigurumi',
        'Osito relleno, con ojos bordados en vez de plásticos: seguro para guaguas.',
        'Alto 18 cm. Relleno hipoalergénico.')
    ]
  };
}

function anunciarClave(clave) {
  const linea = '='.repeat(52);
  console.log('\n' + linea);
  console.log('  CLAVE DEL PANEL (se muestra una sola vez)');
  console.log('');
  console.log('      ' + clave);
  console.log('');
  console.log('  Anotala ahora. No queda guardada en ninguna parte:');
  console.log('  el archivo solo tiene su huella, no la clave.');
  console.log('  Se cambia desde el panel, en Ajustes.');
  console.log(linea + '\n');
}

let cache = null;
let pg = null;

async function pgClient() {
  if (pg) return pg;
  let mod;
  try {
    mod = await import('pg');
  } catch {
    throw new Error('DATABASE_URL esta definido pero el paquete "pg" no esta instalado. Corre: npm i pg');
  }
  const { Pool } = mod.default || mod;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Se verifica el certificado. Antes iba en false, que acepta cualquier
    // certificado y deja la conexion abierta a que alguien se meta en medio.
    // Neon, Supabase y Render usan certificados validos. Si algun proveedor
    // usa uno propio, se abre la puerta a proposito con DB_SSL_SIN_VERIFICAR=1.
    ssl: process.env.DATABASE_URL.includes('localhost')
      ? false
      : { rejectUnauthorized: process.env.DB_SSL_SIN_VERIFICAR !== '1' }
  });
  await pool.query('CREATE TABLE IF NOT EXISTS store (id int primary key, data jsonb not null)');
  pg = pool;
  return pool;
}

async function readRaw() {
  if (process.env.DATABASE_URL) {
    const pool = await pgClient();
    const res = await pool.query('SELECT data FROM store WHERE id = 1');
    return res.rows[0] ? res.rows[0].data : null;
  }
  if (!existsSync(FILE)) return null;
  try {
    return JSON.parse(await readFile(FILE, 'utf8'));
  } catch (err) {
    console.error('store.json ilegible, se usa respaldo en memoria:', err.message);
    return null;
  }
}

// Las escrituras se hacen de a una. El panel dispara varias a la vez —
// "borrar los ejemplos" manda cinco borrados en paralelo — y si dos guardados
// se cruzan, el segundo intenta renombrar un temporal que el primero ya se
// llevó, y revienta con ENOENT.
let cola = Promise.resolve();
let contadorTmp = 0;

function writeRaw(data) {
  const siguiente = () => escribirAhora(data);
  cola = cola.then(siguiente, siguiente);
  return cola;
}

async function escribirAhora(data) {
  if (process.env.DATABASE_URL) {
    const pool = await pgClient();
    await pool.query(
      'INSERT INTO store (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = $1',
      [JSON.stringify(data)]
    );
    return;
  }
  await mkdir(DATA_DIR, { recursive: true });
  // Nombre propio por escritura: aunque algo se cruce, nadie pisa el temporal
  // de otro. El rename sigue siendo atómico, que es lo que protege al archivo
  // bueno de quedar a medio escribir.
  const tmp = `${FILE}.${process.pid}.${contadorTmp++}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await rename(tmp, FILE);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

// Rellena claves nuevas sin pisar lo que la duenia ya escribio.
function merge(base, saved) {
  if (Array.isArray(base) || saved === undefined || saved === null) {
    return saved === undefined || saved === null ? base : saved;
  }
  if (typeof base !== 'object' || typeof saved !== 'object') return saved;
  const out = { ...base };
  for (const key of Object.keys(saved)) {
    out[key] = key in base ? merge(base[key], saved[key]) : saved[key];
  }
  return out;
}

export async function load() {
  if (cache) return cache;
  const saved = await readRaw();
  if (!saved) {
    // Primera vez. Antes habia una clave fija escrita en el README, o sea
    // publica: cualquiera que viera el proyecto entraba al panel de una.
    const plana = process.env.ADMIN_PASSWORD || generarClave();
    cache = defaultStore(plana);
    await writeRaw(cache);
    if (!process.env.ADMIN_PASSWORD) anunciarClave(plana);
  } else {
    const base = defaultStore('');
    cache = merge(base, saved);
    // secret y password nunca se regeneran si ya existian
    cache.secret = saved.secret || cache.secret;
    cache.admin = saved.admin || cache.admin;

    // Ajustes que ya no existen en el sitio se descartan, para que un respaldo
    // viejo no arrastre campos muertos.
    for (const clave of Object.keys(cache.settings)) {
      if (!(clave in base.settings)) delete cache.settings[clave];
    }

    // Salida de emergencia para cuando se olvida la clave: se arranca una vez
    // con ADMIN_RESET=1 y ADMIN_PASSWORD=lo-que-sea, y queda esa.
    if (process.env.ADMIN_RESET === '1' && process.env.ADMIN_PASSWORD) {
      cache.admin.password = hashPassword(process.env.ADMIN_PASSWORD);
      cache.admin.passwordIsDefault = false;
      await writeRaw(cache);
      console.log('  La clave se restablecio con ADMIN_PASSWORD.');
      console.log('  Quita ADMIN_RESET antes de volver a arrancar.\n');
    }
  }
  return cache;
}

export async function save(mutator) {
  const store = await load();
  const result = await mutator(store);
  await writeRaw(store);
  return result;
}

export async function replaceAll(data) {
  const next = merge(defaultStore(''), data);
  const current = await load();
  next.secret = current.secret;
  next.admin = current.admin;
  cache = next;
  await writeRaw(next);
  return next;
}
