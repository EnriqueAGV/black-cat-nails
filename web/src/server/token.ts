/**
 * TOKEN DE SESIÓN — BLACK CAT NAILS WEB
 *
 * JWT firmado con SESSION_SECRET que vive en la cookie httpOnly. Está separado de
 * session.ts para que el proxy (src/proxy.ts) pueda leerlo sin cargar firebase-admin.
 */

import { SignJWT, jwtVerify } from 'jose';
import { Rol, Usuaria } from '@/types';

export const SESSION_COOKIE_NAME = 'bcn_session';
export const TOKEN_EXPIRATION_HOURS = 8;
export const TOKEN_EXPIRATION_SECONDS = TOKEN_EXPIRATION_HOURS * 60 * 60; // 28800s

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET no está configurada en las variables de entorno');
    }
    return new TextEncoder().encode('fallback-session-secret-black-cat-nails-dev-32ch');
  }
  return new TextEncoder().encode(secret);
}

/** Firma un JWT de sesión: { sub: uid, rol }, expira en 8 horas. */
export async function crearToken(usuaria: Pick<Usuaria, 'id' | 'rol'>): Promise<string> {
  return new SignJWT({ rol: usuaria.rol })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuaria.id)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_EXPIRATION_HOURS}h`)
    .sign(getSecretKey());
}

/** Verifica el JWT y devuelve uid y rol, o null si es inválido o expiró. */
export async function leerToken(token: string): Promise<{ sub: string; rol: Rol } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ['HS256'] });
    if (typeof payload.sub === 'string' && (payload.rol === 'admin' || payload.rol === 'clienta')) {
      return { sub: payload.sub, rol: payload.rol as Rol };
    }
    return null;
  } catch {
    return null;
  }
}
