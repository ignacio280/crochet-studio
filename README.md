# Tienda de crochet

Sitio de tienda + panel de administración. Sin build ni framework: Node 20 o más
nuevo y una sola dependencia (`@netlify/blobs`, para guardar los datos en
producción).

- Tienda pública: `/`
- Panel: `/admin`
- Información legal: `/legal.html`
- Guía en castellano para quien administre la tienda: `/ayuda.html`

## Correrlo

```bash
npm install
node server.js
```

Queda en <http://localhost:4400>. Para cambiar el puerto, `PORT=3000 node server.js`.

La primera vez que arranca inventa una clave para el panel y la escribe en la
consola **una sola vez**. Si prefieres elegirla tú, arranca con
`ADMIN_PASSWORD=loQueSea` y no se imprime nada.

## Dónde viven los datos

Dos cosas separadas:

- **El sitio** (productos, textos, categorías): un JSON de unos pocos KB.
- **Las fotos**: una entrada por foto, nombrada con el hash de su contenido.

Dónde quedan depende de dónde corra:

| Entorno | Sitio | Fotos |
|---|---|---|
| Tu computador | `data/store.json` | `data/fotos/` |
| Netlify | Netlify Blobs (`sitio`) | Netlify Blobs (`fotos`) |

No hay base de datos que instalar ni configurar: Netlify Blobs viene incluido en
el plan gratis y se conecta solo desde dentro de una función.

Para respaldar, **Ajustes → Descargar respaldo** en el panel baja un único
archivo JSON con las fotos incrustadas. Ese archivo se basta a sí mismo: se
puede volver a cargar en otro sitio con **Cargar respaldo**.

## Publicarlo en Netlify

1. Subir el repo a GitHub.
2. En <https://app.netlify.com> → **Add new project → Import an existing
   project**, elegir el repositorio.
3. No hay que tocar nada más: `netlify.toml` ya declara qué publicar y dónde
   están las funciones.
4. En **Project configuration → Environment variables**, agregar
   `ADMIN_PASSWORD` con la clave que quieras para el panel. Si no la pones, la
   clave generada queda en los registros de la función (**Logs → Functions**) y
   hay que ir a buscarla ahí.

Todo cabe en el plan gratis: la CDN sirve el CSS, el JavaScript y las imágenes
del diseño, y la función sólo se despierta para la portada, el panel, la API y
las fotos del catálogo.

### Traer los datos desde otro hosting

1. En el sitio viejo, entrar al panel → **Ajustes → Descargar respaldo**.
2. En el sitio nuevo, entrar al panel → **Ajustes → Cargar respaldo** y elegir
   ese archivo.

El panel lo sube por partes (primero los textos, después los productos de a uno)
porque una función de Netlify no puede recibir más de 6 MB de una vez.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `ADMIN_PASSWORD` | Clave inicial, sólo la primera vez que se crea el sitio. |
| `ADMIN_RESET` | Con valor `1` y junto a `ADMIN_PASSWORD`, restablece la clave en el próximo arranque. Hay que quitarla después. |
| `PORT` | Sólo en tu computador. Por defecto 4400. |
| `DATA_DIR` | Sólo en tu computador: carpeta donde dejar los datos. |

### Recuperar la clave olvidada

1. En Netlify, agregar `ADMIN_PASSWORD=laClaveNueva` y `ADMIN_RESET=1`.
2. Volver a desplegar (**Deploys → Trigger deploy**).
3. Borrar `ADMIN_RESET` y volver a desplegar.

## Producción

Lo que el servidor genera solo, sin archivos que mantener a mano:

| Ruta | Qué es |
|---|---|
| `/robots.txt` | Permite el sitio, bloquea `/admin` y `/api/`, apunta al sitemap |
| `/sitemap.xml` | Portada y página legal, con fecha |
| `/manifest.webmanifest` | Nombre, colores e ícono, tomados del panel |
| `/foto/<hash>.jpg` | Las fotos como archivos reales |

Y en el `<head>` de la portada se inyectan, siempre en sincronía con el panel:
canonical, `description`, Open Graph, Twitter Card y datos estructurados
JSON-LD (`Store` + catálogo con precios y disponibilidad). Por eso la portada
vive en `views/index.html` y no en `public/`: si estuviera ahí, la CDN la
serviría cruda, con los `{{HUECOS}}` a la vista.

### Las fotos

El navegador las achica antes de subirlas (1400 px de lado mayor, 1600 px la
portada). El servidor las guarda aparte y en el JSON del sitio deja sólo el
nombre, que es el hash de los bytes. Eso significa:

- El JSON de `/api/site` pesa unos pocos KB en vez de megas.
- Dos productos con la misma foto la comparten sin duplicarla.
- Si la foto cambia, cambia el hash y por lo tanto la URL: se puede cachear como
  `immutable` por un año, en el navegador y en el borde de Netlify, sin riesgo
  de caché rancio.
- Las fotos sirven como miniatura al compartir el enlace y para el JSON-LD.

Al borrar un producto o cambiarle las fotos, las que quedaron sin dueño se
barren solas.

### Seguridad y transporte

- CSP, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` y
  `X-Content-Type-Options` en todas las respuestas. HSTS cuando va por https.
- La compresión la pone Netlify en el borde.
- Página 404 con el diseño del sitio.

### Cookies

El sitio público **no usa ninguna**. La única cookie es la de sesión del panel,
que es estrictamente necesaria para que funcione el login: por eso no requiere
banner de consentimiento.

## Cómo está armado

```
lib/app.js         el sitio entero, en Request/Response de la web
lib/almacen.js     dónde van los bytes: Netlify Blobs o archivos
lib/fotos.js       guarda las fotos por hash y barre las que sobran
lib/store.js       la forma de los datos y el hash de la clave
lib/auth.js        cookie de sesión firmada con HMAC
netlify/functions/sitio.mjs   la función: le pasa la petición a lib/app.js
server.js          lo mismo, pero para tu computador
netlify.toml       qué se publica, dónde están las funciones, cabeceras
views/index.html   la tienda (lleva {{HUECOS}} que rellena el servidor)
public/admin.html  panel
public/ayuda.html  guía de uso
public/legal.html  términos, devoluciones y privacidad
public/js/site.js  arma la tienda con lo que devuelve /api/site
public/js/admin.js panel: productos, textos, fotos, respaldo
public/js/legal.js renderiza la página legal
public/css/, public/js/intro.js   diseño y telón de bienvenida
```

`lib/app.js` habla el estándar de la web y no los objetos de `node:http`. Por
eso el mismo archivo corre en una función de Netlify y detrás de `server.js` en
tu computador: lo que pruebas local es exactamente lo que se publica.

Detalles que importan:

- La clave se guarda con `scrypt` y sal por usuario; el hash nunca sale en
  ninguna respuesta de la API.
- La sesión es una cookie `HttpOnly` firmada con HMAC, con `Secure` automático
  cuando el sitio va por https.
- El login tiene freno tras 8 intentos fallidos por IP, y el contador vive fuera
  del proceso: en serverless cada petición puede caer en una copia distinta, y
  un contador en memoria no frenaría nada.
- Las fotos que llegan al servidor se filtran: sólo se aceptan `data:image/`.
- Los precios se leen a la chilena: `19.500` son diecinueve mil quinientos. Ese
  parseo está en `lib/app.js` (manda) y repetido en `admin.js` (pista en vivo);
  si se toca uno hay que tocar el otro.
- El `secret` de las sesiones vive junto a los datos: borrarlo a mano cierra la
  sesión de quien esté usando el panel.

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
