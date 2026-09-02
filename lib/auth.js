import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

const DIAS = 30;

export function crearToken(secret) {
  const exp = Date.now() + DIAS * 24 * 60 * 60 * 1000;
  const payload = `${exp}.${randomUUID()}`;
  const firma = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${firma}`;
}

export function tokenValido(token, secret) {
  if (!token) return false;
  const partes = token.split('.');
  if (partes.length !== 3) return false;
  const [exp, id, firma] = partes;
  const esperada = createHmac('sha256', secret).update(`${exp}.${id}`).digest('hex');
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return Number(exp) > Date.now();
}
