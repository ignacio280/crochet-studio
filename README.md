# Tienda de crochet

Sitio de tienda + panel de administración. Sin build, sin dependencias npm:
sólo Node 18 o más nuevo.

- Tienda pública: `/`
- Panel: `/admin`
- Información legal: `/legal.html`
- Guía en castellano para quien administre la tienda: `/ayuda.html`

## Correrlo

```bash
node server.js
```

Queda en <http://localhost:4400>. Para cambiar el puerto, `PORT=3000 node server.js`.

Clave inicial del panel: **crochet2026** (o lo que traiga `ADMIN_PASSWORD` la
primera vez que arranca). El panel avisa hasta que se cambie.

## Dónde viven los datos

Todo — productos, textos y fotos — queda en un solo archivo: `data/store.json`.
Las fotos se guardan dentro del JSON como data URL, ya achicadas en el navegador
a 1400 px de lado mayor. No hay carpeta de uploads ni base de datos que instalar.

Para respaldar, basta con copiar ese archivo. Desde el panel también se descarga
el mismo contenido en **Ajustes → Descargar respaldo**.

### Postgres (opcional)

Si se define `DATABASE_URL`, el mismo JSON se guarda en una fila de Postgres en
vez del archivo. Sirve para hostings gratis donde el disco se borra en cada
despliegue. Requiere `npm install pg`.

## Publicarlo

Cualquier host que corra Node sirve. El comando de arranque es `node server.js`
y el proceso lee `PORT` del entorno. `render.yaml` deja el servicio configurado
con disco persistente montado en `/data`.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `PORT` | Puerto. Por defecto 4400. |
| `ADMIN_PASSWORD` | Clave inicial, sólo la primera vez que se crea el store. |
| `ADMIN_RESET` | Con valor `1` y junto a `ADMIN_PASSWORD`, restablece la clave en el próximo arranque. Hay que quitarla después. |
| `DATA_DIR` | Carpeta donde dejar `store.json`. Útil para discos montados. |
| `DATABASE_URL` | Si está, guarda en Postgres en vez del archivo. Necesita `npm i pg`. |

### Recuperar la clave olvidada

1. En el panel del hosting, poner `ADMIN_PASSWORD=laClaveNueva` y `ADMIN_RESET=1`.
2. Reiniciar el servicio una vez.
3. Borrar `ADMIN_RESET` y reiniciar de nuevo.

## Producción

Lo que el servidor genera solo, sin archivos que mantener a mano:

| Ruta | Qué es |
|---|---|
| `/robots.txt` | Permite el sitio, bloquea `/admin` y `/api/`, apunta al sitemap |
| `/sitemap.xml` | Portada y página legal, con fecha |
| `/manifest.webmanifest` | Nombre, colores e ícono, tomados del panel |
| `/foto/<id>/<n>.jpg` | Las fotos como archivos reales |

Y en el `<head>` de la portada se inyectan, siempre en sincronía con el panel:
canonical, `description`, Open Graph, Twitter Card y datos estructurados
JSON-LD (`Store` + catálogo con precios y disponibilidad).

### Las fotos

Se guardan como data URL dentro del store, pero **no se sirven así**. Cada foto
sale por su propia URL con el hash del contenido en el query, cacheada como
`immutable` por un año y con ETag. Eso significa:

- El JSON de `/api/site` pesa unos pocos KB en vez de megas.
- El navegador cachea cada foto por separado y no la vuelve a bajar.
- Las fotos sirven como miniatura al compartir el enlace y para el JSON-LD.
- Si la foto cambia, cambia el hash y por lo tanto la URL: no hay caché rancio.

Las fotos de productos ocultos devuelven 404, para que ocultar algo lo oculte
de verdad.

### Seguridad y transporte

- CSP, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` y
  `X-Content-Type-Options` en todas las respuestas. HSTS cuando va por https.
- Compresión gzip para texto (el CSS baja de 25 KB a 6,6 KB). Las fotos no se
  re-comprimen porque ya vienen comprimidas.
- Página 404 con el diseño del sitio.

### Cookies

El sitio público **no usa ninguna**. La única cookie es la de sesión del panel,
que es estrictamente necesaria para que funcione el login: por eso no requiere
banner de consentimiento.

## Cómo está armado

```
server.js          servidor http y API, sin dependencias
lib/store.js       persistencia (archivo o Postgres) y hash de la clave
lib/auth.js        cookie de sesión firmada con HMAC
public/index.html  tienda
public/admin.html  panel
public/ayuda.html  guía de uso
public/legal.html  términos, devoluciones y privacidad
public/js/legal.js renderiza la página legal
public/css/intro.css   telón de bienvenida
public/js/intro.js     telón de bienvenida
public/js/site.js  arma la tienda con lo que devuelve /api/site
public/js/admin.js panel: productos, textos, fotos, respaldo
data/store.json    todos los datos (se crea solo)
```

Detalles que importan:

- La clave se guarda con `scrypt` y sal por usuario; el hash nunca sale en
  ninguna respuesta de la API.
- La sesión es una cookie `HttpOnly` firmada con HMAC, con `Secure` automático
  cuando el sitio va por https.
- El login tiene freno tras 8 intentos fallidos por IP.
- Las fotos que llegan al servidor se filtran: sólo se aceptan `data:image/`.
- Los precios se leen a la chilena: `19.500` son diecinueve mil quinientos. Ese
  parseo está en `server.js` (manda) y repetido en `admin.js` (pista en vivo);
  si se toca uno hay que tocar el otro.
- **No borrar `data/store.json` a mano**: ahí vive el `secret` de las sesiones,
  y borrarlo cierra la sesión de quien esté usando el panel.

## Diseño

Sistema visual tomado del taller: fondo hueso `#FBF7FE`, tinta `#3E2C55`,
arcilla `#7E4FC6`, rosa `#F3A9CE`, menta `#A9DCD2`, noche `#241635`. Titulares en
Fraunces 300 con tracking `-0.022em`, texto en Quicksand. Radio 16 px y píldoras
de 999 px. Todo eso son variables al principio de `public/css/site.css` y
`public/css/admin.css`.

## Notas

- La tienda no cobra en línea a propósito: cada producto abre WhatsApp con el
  pedido escrito. El punto de enganche para un pago real es `#modalPedir` en
  `public/js/site.js`.
- El sitio viene con 5 productos de ejemplo. El panel muestra un aviso con un
  botón para borrarlos todos de una vez.
