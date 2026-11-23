/**
 * FIREBASE ADMIN — BLACK CAT NAILS WEB (Entrega final)
 *
 * Los Route Handlers de /api usan el SDK de administración para leer y escribir en el
 * MISMO proyecto de Firebase que la app móvil. Así web y móvil comparten usuarias,
 * catálogo, citas, agenda e inventario.
 *
 * Credenciales (solo en el servidor, nunca en el navegador):
 *   - FIREBASE_SERVICE_ACCOUNT: el JSON completo de la cuenta de servicio, en una línea; o bien
 *   - FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.
 * Con FIRESTORE_EMULATOR_HOST y FIREBASE_AUTH_EMULATOR_HOST se conecta a los emuladores.
 */

import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function credencial() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (json) {
    const cuenta = JSON.parse(json);
    return { credential: cert(cuenta), projectId: cuenta.project_id as string };
  }
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) {
    return { credential: cert({ projectId, clientEmail, privateKey }), projectId };
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return { projectId: projectId ?? 'demo-black-cat-nails' };
  }
  throw new Error(
    'Firebase Admin no está configurado: define FIREBASE_SERVICE_ACCOUNT o ' +
      'FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY (ver web/.env.example).'
  );
}

function obtenerApp(): App {
  return getApps()[0] ?? initializeApp(credencial());
}

export const adminDb = () => getFirestore(obtenerApp());
export const adminAuth = () => getAuth(obtenerApp());
