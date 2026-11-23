import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import {
  crearToken,
  formatZodError,
  sanitizarUsuaria,
  setSessionCookie,
  verificarIdToken,
} from '@/server/session';
import { perfilRegistroSchema } from '@/schemas';

/**
 * POST /api/auth/registro (Público)
 *
 * Cuerpo: { idToken, nombre, telefono }.
 * La cuenta ya fue creada en Firebase Authentication desde el navegador (correo y
 * contraseña) o es el primer ingreso con Google. Este endpoint crea el perfil:
 * - Verifica el ID token (401 si no es válido).
 * - Valida nombre y teléfono con Zod (las mismas reglas de la app móvil).
 * - Crea usuarias/{uid} con rol 'clienta', 0 inasistencias y código de referido único.
 * - Abre la sesión con la cookie httpOnly y devuelve la usuaria (201 Created).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        {
          error: {
            code: 'cuerpo_invalido',
            message: 'El cuerpo de la petición debe ser un objeto JSON válido',
          },
        },
        { status: 400 }
      );
    }

    const cuenta = await verificarIdToken(body.idToken);
    if (!cuenta) {
      return NextResponse.json(
        { error: { code: 'token_invalido', message: 'No se pudo verificar tu cuenta. Intentá de nuevo.' } },
        { status: 401 }
      );
    }

    const parseResult = perfilRegistroSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(formatZodError(parseResult.error), { status: 400 });
    }

    const usuaria = await db.usuarias.crearPerfil(cuenta.uid, {
      nombre: parseResult.data.nombre,
      telefono: parseResult.data.telefono,
      correo: cuenta.correo,
      proveedor: cuenta.proveedor,
    });

    const token = await crearToken(usuaria);
    await setSessionCookie(token);
    await db.actividad.registrar(usuaria.id, 'registro', 'Creaste tu cuenta en Black Cat Nails desde la web');

    return NextResponse.json(sanitizarUsuaria(usuaria), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: 'error_servidor',
          message: error instanceof Error ? error.message : 'Error interno del servidor',
        },
      },
      { status: 500 }
    );
  }
}
