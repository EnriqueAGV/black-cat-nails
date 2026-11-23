import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { crearToken, sanitizarUsuaria, setSessionCookie, verificarIdToken } from '@/server/session';

/**
 * POST /api/auth/login (Público)
 *
 * Cuerpo: { idToken } — el ID token que entrega Firebase Authentication en el navegador
 * después de iniciar sesión con correo/contraseña o con Google.
 * - Verifica el token con firebase-admin (401 si no es válido).
 * - Busca el perfil en usuarias/{uid}, el mismo que usa la app móvil.
 * - Si la cuenta es nueva (primer ingreso con Google) responde 404 'perfil_incompleto'
 *   con el nombre y el correo, para que la web pida el teléfono.
 * - Configura la cookie httpOnly bcn_session y devuelve la usuaria (200 OK).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const cuenta = await verificarIdToken(body?.idToken);
    if (!cuenta) {
      return NextResponse.json(
        { error: { code: 'token_invalido', message: 'No se pudo verificar tu sesión. Intentá de nuevo.' } },
        { status: 401 }
      );
    }

    const usuaria = await db.usuarias.findById(cuenta.uid);
    if (!usuaria) {
      return NextResponse.json(
        {
          error: { code: 'perfil_incompleto', message: 'Completá tu perfil para continuar' },
          nombre: cuenta.nombre,
          correo: cuenta.correo,
        },
        { status: 404 }
      );
    }

    const token = await crearToken(usuaria);
    await setSessionCookie(token);
    await db.actividad.registrar(
      usuaria.id,
      'inicio_sesion',
      cuenta.proveedor === 'google' ? 'Iniciaste sesión con Google en la web' : 'Iniciaste sesión en la web'
    );

    return NextResponse.json(sanitizarUsuaria(usuaria), { status: 200 });
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
