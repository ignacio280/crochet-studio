// Capa de persistencia: arma el sitio completo a partir de lo guardado.
//
// Los bytes los pone lib/almacen.js (Netlify Blobs en produccion, archivos
// en el computador). Aca solo vive la forma que tienen esos datos: que
// campos existen, cual es el valor por defecto de cada uno y como se
// verifica la clave del panel.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { leerDatos, escribirDatos } from './almacen.js';
import { recolectarBasura } from './fotos.js';

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

// El sitio se guarda en memoria un rato para no ir al almacen cinco veces
// dentro de la misma peticion. El rato es corto a proposito: en serverless
// conviven varias copias del proceso, y una copia que se quedara con la
// version vieja seguiria mostrando el sitio de antes despues de un cambio.
const VIDA_CACHE = 2000;
let cache = null;
let cacheHasta = 0;

function recordar(datos) {
  cache = datos;
  cacheHasta = Date.now() + VIDA_CACHE;
  return datos;
}

export function invalidarCache() {
  cache = null;
  cacheHasta = 0;
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

function anunciarClave(clave) {
  const linea = '='.repeat(52);
  console.log('\n' + linea);
  console.log('  CLAVE DEL PANEL (se muestra una sola vez)');
  console.log('');
  console.log('      ' + clave);
  console.log('');
  console.log('  Anotala ahora. No queda guardada en ninguna parte:');
  console.log('  lo guardado es solo su huella, no la clave.');
  console.log('  Se cambia desde el panel, en Ajustes.');
  console.log(linea + '\n');
}

export async function load() {
  if (cache && Date.now() < cacheHasta) return cache;
  const saved = await leerDatos();
  if (!saved) {
    // Primera vez. Antes habia una clave fija escrita en el README, o sea
    // publica: cualquiera que viera el proyecto entraba al panel de una.
    const plana = process.env.ADMIN_PASSWORD || generarClave();
    recordar(defaultStore(plana));
    await escribirDatos(cache);
    if (!process.env.ADMIN_PASSWORD) anunciarClave(plana);
    return cache;
  }

  const base = defaultStore('');
  recordar(merge(base, saved));
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
    await escribirDatos(cache);
    console.log('  La clave se restablecio con ADMIN_PASSWORD.');
    console.log('  Quita ADMIN_RESET antes de volver a arrancar.\n');
  }
  return cache;
}

export async function save(mutator) {
  const store = await load();
  const result = await mutator(store);
  await escribirDatos(store);
  recordar(store);
  return result;
}

// Igual que save, pero ademas barre las fotos que quedaron sin dueno.
// Solo lo usan las operaciones que pueden soltar una: borrar un producto,
// cambiarle las fotos, reemplazar la portada.
export async function saveConLimpieza(mutator) {
  const result = await save(mutator);
  try {
    await recolectarBasura(cache);
  } catch (err) {
    // Que sobre una foto no es motivo para que el guardado falle.
    console.error('no se pudo barrer fotos sueltas:', err.message);
  }
  return result;
}

export async function replaceAll(data) {
  const next = merge(defaultStore(''), data);
  const current = await load();
  next.secret = current.secret;
  next.admin = current.admin;
  recordar(next);
  await escribirDatos(next);
  try {
    await recolectarBasura(next);
  } catch (err) {
    console.error('no se pudo barrer fotos sueltas:', err.message);
  }
  return next;
}
