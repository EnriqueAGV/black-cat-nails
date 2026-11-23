import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  browserPopupRedirectResolver,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { ApiError, http } from './http';
import { obtenerAuth, proveedorGoogle, traducirErrorAuth } from '@/lib/firebase';
import { Usuaria } from '@/types';
import { CompletarPerfilInput, LoginInput, RegistroInput } from '@/schemas';

/**
 * Servicio de autenticación del cliente (entrega final).
 *
 * 1. El navegador se autentica con Firebase Authentication (correo o Google).
 * 2. Envía el ID token a /api/auth/*, que lo verifica y abre la sesión con cookie httpOnly.
 * Las cuentas son las mismas de la app móvil: quien se registra en una entra en la otra.
 */

/** La cuenta existe en Firebase Auth pero no tiene perfil (primer ingreso con Google). */
export class PerfilIncompletoError extends Error {
  constructor(public readonly nombre: string, public readonly correo: string) {
    super('Completá tu perfil para continuar');
    this.name = 'PerfilIncompletoError';
  }
}

async function idTokenActual(): Promise<string> {
  const user = obtenerAuth().currentUser;
  if (!user) throw new Error('Tu sesión expiró. Volvé a iniciar sesión.');
  return user.getIdToken();
}

async function abrirSesion(): Promise<Usuaria> {
  const idToken = await idTokenActual();
  try {
    return await http.post<Usuaria>('/api/auth/login', { idToken });
  } catch (e) {
    if (e instanceof ApiError && e.code === 'perfil_incompleto') {
      const user = obtenerAuth().currentUser;
      throw new PerfilIncompletoError(user?.displayName ?? '', user?.email ?? '');
    }
    throw e;
  }
}

export const authService = {
  registro: async (datos: RegistroInput): Promise<Usuaria> => {
    let cuentaCreada = false;
    try {
      const cred = await createUserWithEmailAndPassword(
        obtenerAuth(),
        datos.correo.trim().toLowerCase(),
        datos.password
      );
      cuentaCreada = true;
      await updateProfile(cred.user, { displayName: datos.nombre.trim() });
      return await http.post<Usuaria>('/api/auth/registro', {
        idToken: await cred.user.getIdToken(),
        nombre: datos.nombre,
        telefono: datos.telefono,
      });
    } catch (e) {
      // Si el perfil no se pudo guardar, se borra la cuenta para no dejarla a medias (igual que en móvil).
      if (cuentaCreada) await obtenerAuth().currentUser?.delete().catch(() => {});
      throw e instanceof ApiError ? e : traducirErrorAuth(e);
    }
  },

  login: async (credenciales: LoginInput): Promise<Usuaria> => {
    try {
      await signInWithEmailAndPassword(
        obtenerAuth(),
        credenciales.correo.trim().toLowerCase(),
        credenciales.password
      );
    } catch (e) {
      throw traducirErrorAuth(e);
    }
    return abrirSesion();
  },

  loginConGoogle: async (): Promise<Usuaria> => {
    try {
      await signInWithPopup(obtenerAuth(), proveedorGoogle, browserPopupRedirectResolver);
    } catch (e) {
      // Si el navegador bloquea la ventana emergente, se usa la página de Google completa.
      // Al volver, resultadoGoogle() termina el ingreso.
      if ((e as { code?: string })?.code === 'auth/popup-blocked') {
        await signInWithRedirect(obtenerAuth(), proveedorGoogle, browserPopupRedirectResolver);
        return new Promise<Usuaria>(() => {});
      }
      throw traducirErrorAuth(e);
    }
    return abrirSesion();
  },

  /** Termina el ingreso con Google cuando se hizo por redirección. Devuelve null si no hubo. */
  resultadoGoogle: async (): Promise<Usuaria | null> => {
    try {
      const resultado = await getRedirectResult(obtenerAuth(), browserPopupRedirectResolver);
      if (!resultado) return null;
    } catch (e) {
      throw traducirErrorAuth(e);
    }
    return abrirSesion();
  },

  /** Primer ingreso con Google: guarda nombre y teléfono, que Google no entrega. */
  completarPerfil: async (datos: CompletarPerfilInput): Promise<Usuaria> =>
    http.post<Usuaria>('/api/auth/registro', { idToken: await idTokenActual(), ...datos }),

  recuperarPassword: async (correo: string): Promise<void> => {
    try {
      await sendPasswordResetEmail(obtenerAuth(), correo.trim().toLowerCase());
    } catch (e) {
      const err = traducirErrorAuth(e);
      // No se revela si el correo existe.
      if (err.message !== 'Correo o contraseña incorrectos') throw err;
    }
  },

  logout: async (): Promise<{ ok: boolean; mensaje: string }> => {
    await signOut(obtenerAuth()).catch(() => {});
    return http.post<{ ok: boolean; mensaje: string }>('/api/auth/logout');
  },

  me: (): Promise<Usuaria> => http.get<Usuaria>('/api/auth/me'),
};

export default authService;
