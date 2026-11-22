/**
 * GESTIÓN DE SESIÓN Y AUTENTICACIÓN EN SERVIDOR — BLACK CAT NAILS WEB
 *
 * Entrega final: la identidad la maneja Firebase Authentication (correo/contraseña y
 * Google), igual que en la app móvil. El navegador inicia sesión con el SDK de Firebase
 * y envía su ID token a /api/auth/*; el servidor lo verifica con firebase-admin, busca
 * el perfil en usuarias/{uid} y emite la misma cookie httpOnly de 8 horas de la Etapa 2.
 * Así los Route Handlers y el proxy siguen funcionando sin cambios.
 *
 * Cumple con la especificación de 06-seguridad.md y los lineamientos de AGENTS.md.
 */

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { adminAuth } from '@/server/firebaseAdmin';
import { leerToken, SESSION_COOKIE_NAME, TOKEN_EXPIRATION_SECONDS } from '@/server/token';
import { Rol, Usuaria } from '@/types';

export { crearToken, leerToken, SESSION_COOKIE_NAME, TOKEN_EXPIRATION_HOURS, TOKEN_EXPIRATION_SECONDS } from '@/server/token';

/**
 * Devuelve solo los campos del perfil que la web expone (sin foto en base64 ni metadatos).
 */
export function sanitizarUsuaria(u: Usuaria): Usuaria {
  return {
    id: u.id,
    nombre: u.nombre,
    correo: u.correo,
    telefono: u.telefono,
    rol: u.rol,
    inasistencias: u.inasistencias ?? 0,
    notasPrivadas: u.notasPrivadas,
    creadaEn: u.creadaEn,
  };
}

/**
 * Formatea errores de validación de Zod con la estructura estándar de 03-api-rest.md.
 */
export function formatZodError(error: z.ZodError) {
  const campos: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'general';
    if (!campos[key]) {
      campos[key] = issue.message;
    }
  }
  return {
    error: {
      code: 'validacion_fallida',
      message: 'Los datos proporcionados no son válidos',
      campos,
    },
  };
}

/**
 * Verifica un ID token emitido por Firebase Authentication (web o móvil).
 * Devuelve el uid y los datos básicos de la cuenta, o null si el token no es válido.
 */
export async function verificarIdToken(
  idToken: unknown
): Promise<{ uid: string; correo: string; nombre: string; proveedor: 'password' | 'google' } | null> {
  if (typeof idToken !== 'string' || idToken.length < 20) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      correo: (decoded.email ?? '').toLowerCase(),
      nombre: (decoded.name as string | undefined) ?? '',
      proveedor: decoded.firebase?.sign_in_provider === 'google.com' ? 'google' : 'password',
    };
  } catch {
    return null;
  }
}

/**
 * Configura la cookie httpOnly con el token de sesión.
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_EXPIRATION_SECONDS,
  });
}

/**
 * Elimina la cookie de sesión del navegador.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Obtiene la usuaria autenticada actual a partir de la cookie de sesión y su perfil en Firestore.
 * Retorna null si no hay sesión válida.
 */
export async function getSession(req?: Request | NextRequest): Promise<Usuaria | null> {
  try {
    let token: string | undefined;

    try {
      const cookieStore = await cookies();
      token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    } catch {
      // Si cookies() falla al invocarse fuera de un RequestAsyncStorage
    }

    if (!token && req) {
      const cookieHeader = req.headers.get('cookie');
      if (cookieHeader) {
        const match = cookieHeader.match(
          new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`)
        );
        if (match) {
          token = decodeURIComponent(match[1]);
        }
      }
    }

    if (!token) {
      return null;
    }

    const payload = await leerToken(token);
    if (!payload) {
      return null;
    }

    const usuaria = await db.usuarias.findById(payload.sub);
    if (!usuaria) {
      return null;
    }

    return sanitizarUsuaria(usuaria);
  } catch {
    return null;
  }
}

/**
 * Error tipado para fallos de autenticación (401) y autorización (403).
 */
export class AuthError extends Error {
  public readonly status: 401 | 403;
  public readonly code: string;

  constructor(status: 401 | 403, code: string, message: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
  }

  public toResponse(): NextResponse {
    return NextResponse.json(
      {
        error: {
          code: this.code,
          message: this.message,
        },
      },
      { status: this.status }
    );
  }
}

/**
 * Exige una sesión activa. Si no existe sesión válida, lanza AuthError con código 401.
 */
export async function requireSession(req?: Request | NextRequest): Promise<Usuaria> {
  const usuaria = await getSession(req);
  if (!usuaria) {
    throw new AuthError(
      401,
      'no_autenticado',
      'Debe iniciar sesión para acceder a este recurso'
    );
  }
  return usuaria;
}

/**
 * Exige un rol específico (o uno de varios roles permitidos).
 * Si no hay sesión válida, lanza 401.
 * Si el rol de la usuaria no coincide, lanza 403.
 */
export async function requireRol(rol: Rol | Rol[], req?: Request | NextRequest): Promise<Usuaria> {
  const usuaria = await requireSession(req);
  const rolesPermitidos = Array.isArray(rol) ? rol : [rol];

  if (!rolesPermitidos.includes(usuaria.rol)) {
    throw new AuthError(
      403,
      'rol_insuficiente',
      'No tiene permisos para realizar esta acción'
    );
  }

  return usuaria;
}

/**
 * Helper para capturar AuthError y generar la respuesta HTTP correspondiente (401 o 403).
 * Retorna null si el error no es de tipo AuthError.
 */
export function handleAuthError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return error.toResponse();
  }
  return null;
}
