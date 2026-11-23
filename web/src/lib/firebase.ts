'use client';

/**
 * FIREBASE EN EL NAVEGADOR — BLACK CAT NAILS WEB (Entrega final)
 *
 * Mismo proyecto de Firebase que la app móvil. En el navegador solo se usa
 * Authentication (correo/contraseña y Google); los datos se leen y escriben a través
 * de /api, que usa firebase-admin en el servidor.
 *
 * Los valores NEXT_PUBLIC_FIREBASE_* identifican al proyecto y no son secretos
 * (son los mismos EXPO_PUBLIC_FIREBASE_* de la app móvil).
 */

import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Auth, connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const usarEmulador = process.env.NEXT_PUBLIC_USAR_EMULADORES === '1';

export const firebaseConfigurado = Boolean(config.apiKey && config.projectId) || usarEmulador;

let auth: Auth | null = null;

export function obtenerAuth(): Auth {
  if (auth) return auth;
  if (!firebaseConfigurado) {
    throw new Error('Firebase no está configurado. Revisá las variables NEXT_PUBLIC_FIREBASE_* (web/.env.example).');
  }
  const app: FirebaseApp =
    getApps()[0] ??
    initializeApp(usarEmulador && !config.apiKey ? { apiKey: 'demo', projectId: 'demo-black-cat-nails' } : config);
  auth = getAuth(app);
  auth.languageCode = 'es';
  if (usarEmulador) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  return auth;
}

export const proveedorGoogle = new GoogleAuthProvider();
proveedorGoogle.setCustomParameters({ prompt: 'select_account' });

/** Traduce los códigos de error de Firebase Auth a mensajes para la usuaria. */
export function traducirErrorAuth(e: unknown): Error {
  const code = (e as { code?: string })?.code ?? '';
  const mensajes: Record<string, string> = {
    'auth/invalid-credential': 'Correo o contraseña incorrectos',
    'auth/wrong-password': 'Correo o contraseña incorrectos',
    'auth/user-not-found': 'Correo o contraseña incorrectos',
    'auth/invalid-email': 'Correo electrónico no válido',
    'auth/email-already-in-use': 'Ese correo ya está registrado',
    'auth/weak-password': 'La contraseña es muy débil',
    'auth/too-many-requests': 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.',
    'auth/network-request-failed': 'No se pudo conectar. Verificá tu conexión a internet.',
    'auth/popup-closed-by-user': 'Cerraste la ventana de Google antes de terminar',
    'auth/cancelled-popup-request': 'Cerraste la ventana de Google antes de terminar',
    'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Permití ventanas emergentes.',
    'auth/operation-not-allowed': 'Ese método de inicio de sesión no está habilitado en Firebase',
    'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase Authentication',
  };
  if (mensajes[code]) return new Error(mensajes[code]);
  return e instanceof Error ? e : new Error('Ocurrió un error inesperado');
}
