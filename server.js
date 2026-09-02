// Servidor para trabajar en el computador.
//
// No tiene logica propia: traduce lo que llega por node:http al Request de
// la web, se lo pasa al mismo manejador que corre en Netlify, y devuelve la
// Response. Asi lo que se prueba aca es exactamente lo que se publica.
import http from 'node:http';
import { Readable } from 'node:stream';
import { manejar } from './lib/app.js';

const PORT = Number(process.env.PORT) || 4400;

function aRequest(req, origen) {
  const cabeceras = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => cabeceras.append(k, x));
    else if (v != null) cabeceras.set(k, v);
  }
  const conCuerpo = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(origen + req.url, {
    method: req.method,
    headers: cabeceras,
    body: conCuerpo ? Readable.toWeb(req) : undefined,
    // Node exige declararlo cuando el cuerpo es un flujo que todavia no
    // termino de llegar.
    duplex: conCuerpo ? 'half' : undefined
  });
}

async function responder(res, respuesta) {
  const cabeceras = {};
  respuesta.headers.forEach((valor, clave) => {
    if (clave !== 'set-cookie') cabeceras[clave] = valor;
  });
  // set-cookie es la unica cabecera que puede repetirse, y juntarla en una
  // sola linea con comas rompe las fechas de vencimiento.
  const galletas = respuesta.headers.getSetCookie
    ? respuesta.headers.getSetCookie()
    : [respuesta.headers.get('set-cookie')].filter(Boolean);
  if (galletas.length) cabeceras['set-cookie'] = galletas;

  res.writeHead(respuesta.status, cabeceras);
  if (!respuesta.body) return res.end();
  res.end(Buffer.from(await respuesta.arrayBuffer()));
}

const server = http.createServer(async (req, res) => {
  try {
    const respuesta = await manejar(aRequest(req, 'http://' + (req.headers.host || 'localhost')));
    await responder(res, respuesta);
  } catch (err) {
    console.error('[' + new Date().toISOString() + ']', req.method, req.url, err);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Algo falló en el servidor.');
  }
});

server.listen(PORT, () => {
  console.log('\n  Tienda   ->  http://localhost:' + PORT);
  console.log('  Panel    ->  http://localhost:' + PORT + '/admin\n');
});
