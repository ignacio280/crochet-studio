// La unica funcion del sitio. Todo lo que no sea un archivo suelto de
// public/ pasa por aca: la portada, el panel, la API y las fotos.
//
// `preferStatic` invierte el orden normal de Netlify: primero se busca el
// archivo en la CDN, y solo si no existe corre esta funcion. Asi el CSS y
// las imagenes del disenio se sirven gratis desde el borde, y la funcion
// se despierta unicamente para lo que de verdad cambia.
import { manejar } from '../../lib/app.js';

export default async (request, context) => manejar(request, { ip: context.ip });

export const config = {
  path: '/*',
  preferStatic: true
};
