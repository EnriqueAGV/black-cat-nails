/**
 * REPOSITORIO EN CLOUD FIRESTORE — BLACK CAT NAILS WEB (Entrega final)
 *
 * En la Etapa 2 este módulo guardaba los datos en memoria a partir de seed.json.
 * Para la entrega final se reemplazó por Cloud Firestore, en el MISMO proyecto y con
 * el MISMO modelo de datos que la app móvil (Etapa 3, Foro 2):
 *
 *   usuarias/{uid}          perfil, rol, inasistencias, código de referido
 *   servicios/{id}          catálogo
 *   insumos/{id}            inventario
 *   citas/{id}              citas con servicios congelados, fecha e inicioMs
 *   agendaDias/{YYYY-MM-DD} bloques ocupados del día (los lee la app móvil)
 *
 * La interfaz pública (db.usuarias, db.servicios, db.citas, db.insumos) se conserva,
 * pero ahora es asíncrona. Las capas superiores solo agregaron `await`.
 *
 * Los Route Handlers corren en el servidor con firebase-admin, por eso las reglas de
 * seguridad no aplican aquí: la autorización la hacen requireSession/requireRol.
 */

import { DocumentSnapshot, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/server/firebaseAdmin';
import { ESTADOS_OCUPAN_AGENDA } from '@/domain/estadosCita';
import { seCruzan } from '@/domain/disponibilidad';
import { generarCodigoReferido } from '@/domain/referidos';
import { Cita, EstadoCita, Insumo, Intervalo, Rol, Servicio, Usuaria } from '@/types';

interface FiltroCitas {
  desde?: string;
  hasta?: string;
  estado?: EstadoCita | EstadoCita[];
  clientaId?: string;
}

interface FiltroServicios {
  activo?: boolean;
}

interface FiltroUsuarias {
  rol?: Rol;
}

/** Convierte Timestamps de Firestore a ISO para que la respuesta sea JSON plano. */
function limpiar<T>(valor: unknown): T {
  if (valor instanceof Timestamp) return valor.toDate().toISOString() as T;
  if (Array.isArray(valor)) return valor.map((v) => limpiar(v)) as T;
  if (valor && typeof valor === 'object') {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor)) salida[k] = limpiar(v);
    return salida as T;
  }
  return valor as T;
}

function desdeDoc<T>(snap: DocumentSnapshot): T | undefined {
  if (!snap.exists) return undefined;
  return limpiar<T>({ id: snap.id, ...snap.data() });
}

/** Firestore no acepta `undefined`: se eliminan esas claves antes de escribir. */
function sinIndefinidos<T extends object>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

/** Fecha local del negocio (El Salvador, UTC-6) de un ISO con zona -06:00. */
export function fechaNegocio(iso: string): string {
  const ms = Date.parse(iso);
  return new Date(ms - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const col = {
  usuarias: () => adminDb().collection('usuarias'),
  servicios: () => adminDb().collection('servicios'),
  insumos: () => adminDb().collection('insumos'),
  citas: () => adminDb().collection('citas'),
  agendaDia: (fecha: string) => adminDb().doc(`agendaDias/${fecha}`),
};

export class HorarioOcupadoError extends Error {
  constructor() {
    super('Ese horario acaba de ocuparse');
    this.name = 'HorarioOcupadoError';
  }
}

const usuariasRepo = {
  list: async (filtro?: FiltroUsuarias): Promise<Usuaria[]> => {
    const q = filtro?.rol ? col.usuarias().where('rol', '==', filtro.rol) : col.usuarias();
    const snap = await q.get();
    return snap.docs.map((d) => desdeDoc<Usuaria>(d)!);
  },

  findById: async (id: string): Promise<Usuaria | undefined> =>
    desdeDoc<Usuaria>(await col.usuarias().doc(id).get()),

  findByCorreo: async (correo: string): Promise<Usuaria | undefined> => {
    const snap = await col.usuarias().where('correo', '==', correo.trim().toLowerCase()).limit(1).get();
    return snap.empty ? undefined : desdeDoc<Usuaria>(snap.docs[0]);
  },

  /**
   * Crea el perfil de una cuenta nueva de Firebase Auth con el mismo formato que la app
   * móvil: rol clienta, 0 inasistencias y un código de referido único reservado en
   * codigosReferido/{codigo}, todo en una transacción.
   */
  crearPerfil: async (
    uid: string,
    datos: { nombre: string; correo: string; telefono: string; proveedor: 'password' | 'google' }
  ): Promise<Usuaria> => {
    const db = adminDb();
    const ref = col.usuarias().doc(uid);
    let creada: Usuaria | undefined;
    await db.runTransaction(async (tx) => {
      const existente = await tx.get(ref);
      if (existente.exists) {
        creada = desdeDoc<Usuaria>(existente);
        return;
      }
      const usados: string[] = [];
      let codigo = generarCodigoReferido(datos.nombre, usados);
      for (let i = 0; i < 27 && (await tx.get(db.doc(`codigosReferido/${codigo}`))).exists; i++) {
        usados.push(codigo);
        codigo = generarCodigoReferido(datos.nombre, usados);
      }
      const perfil = {
        nombre: datos.nombre.trim(),
        correo: datos.correo.trim().toLowerCase(),
        telefono: datos.telefono,
        rol: 'clienta' as const, // el registro público nunca crea administradoras
        inasistencias: 0,
        codigoReferido: codigo,
        proveedor: datos.proveedor,
        creadaEn: new Date().toISOString(),
      };
      tx.create(ref, { ...perfil, actualizadaEn: FieldValue.serverTimestamp() });
      tx.create(db.doc(`codigosReferido/${codigo}`), { uid });
      creada = { id: uid, ...perfil };
    });
    return creada!;
  },

  update: async (id: string, datos: Partial<Omit<Usuaria, 'id'>>): Promise<Usuaria | undefined> => {
    const ref = col.usuarias().doc(id);
    if (!(await ref.get()).exists) return undefined;
    await ref.update({ ...sinIndefinidos(datos), actualizadaEn: FieldValue.serverTimestamp() });
    return desdeDoc<Usuaria>(await ref.get());
  },
};

const serviciosRepo = {
  list: async (filtro?: FiltroServicios): Promise<Servicio[]> => {
    const snap = await col.servicios().get();
    let resultado = snap.docs.map((d) => desdeDoc<Servicio>(d)!);
    if (filtro?.activo !== undefined) resultado = resultado.filter((s) => s.activo === filtro.activo);
    return resultado.sort((a, b) => a.nombre.localeCompare(b.nombre));
  },

  findById: async (id: string): Promise<Servicio | undefined> =>
    desdeDoc<Servicio>(await col.servicios().doc(id).get()),

  findByNombre: async (nombre: string): Promise<Servicio | undefined> => {
    const normalizado = nombre.trim().toLowerCase();
    return (await serviciosRepo.list()).find((s) => s.nombre.trim().toLowerCase() === normalizado);
  },

  create: async (datos: Omit<Servicio, 'id'> & { id?: string }): Promise<Servicio> => {
    const { id, ...resto } = datos;
    const ref = id ? col.servicios().doc(id) : col.servicios().doc();
    await ref.set(sinIndefinidos(resto));
    return { ...resto, id: ref.id } as Servicio;
  },

  update: async (id: string, datos: Partial<Omit<Servicio, 'id'>>): Promise<Servicio | undefined> => {
    const ref = col.servicios().doc(id);
    if (!(await ref.get()).exists) return undefined;
    await ref.update(sinIndefinidos(datos));
    return desdeDoc<Servicio>(await ref.get());
  },
};

const citasRepo = {
  list: async (filtro?: FiltroCitas): Promise<Cita[]> => {
    // Una sola condición en Firestore (no requiere índices compuestos); el resto se filtra aquí.
    let q: FirebaseFirestore.Query = col.citas();
    if (filtro?.clientaId) {
      q = q.where('clientaId', '==', filtro.clientaId);
    } else if (filtro?.desde || filtro?.hasta) {
      if (filtro.desde) q = q.where('inicioMs', '>=', Date.parse(filtro.desde));
      if (filtro.hasta) q = q.where('inicioMs', '<=', Date.parse(filtro.hasta));
    }
    const snap = await q.get();
    let resultado = snap.docs.map((d) => desdeDoc<Cita>(d)!);

    if (filtro?.estado) {
      const estados = Array.isArray(filtro.estado) ? filtro.estado : [filtro.estado];
      resultado = resultado.filter((c) => estados.includes(c.estado));
    }
    if (filtro?.desde) resultado = resultado.filter((c) => Date.parse(c.inicio) >= Date.parse(filtro.desde!));
    if (filtro?.hasta) resultado = resultado.filter((c) => Date.parse(c.inicio) <= Date.parse(filtro.hasta!));
    return resultado;
  },

  /** Citas de un día del negocio (YYYY-MM-DD). */
  delDia: async (fecha: string): Promise<Cita[]> => {
    const snap = await col.citas().where('fecha', '==', fecha).get();
    return snap.docs.map((d) => desdeDoc<Cita>(d)!);
  },

  findById: async (id: string): Promise<Cita | undefined> =>
    desdeDoc<Cita>(await col.citas().doc(id).get()),

  /**
   * Crea la cita y reserva su bloque en agendaDias/{fecha} en una transacción, igual
   * que la app móvil. Dentro de la transacción se vuelve a revisar que el horario no
   * se cruce con otro bloque: si dos personas (web o móvil) eligen la misma hora, la
   * segunda recibe HorarioOcupadoError.
   */
  crearSiDisponible: async (
    datos: Omit<Cita, 'id' | 'creadaEn'> & { id?: string; creadaEn?: string }
  ): Promise<Cita> => {
    const db = adminDb();
    const ref = datos.id ? col.citas().doc(datos.id) : col.citas().doc();
    const fecha = fechaNegocio(datos.inicio);
    const diaRef = col.agendaDia(fecha);
    const nueva: Cita = {
      ...datos,
      id: ref.id,
      creadaEn: datos.creadaEn || new Date().toISOString(),
    };

    await db.runTransaction(async (tx) => {
      const dia = await tx.get(diaRef);
      const bloques = (dia.data()?.bloques ?? {}) as Record<string, Intervalo & { uid: string }>;
      const propuesto: Intervalo = { inicio: nueva.inicio, fin: nueva.fin };
      if (Object.values(bloques).some((b) => seCruzan(propuesto, b))) {
        throw new HorarioOcupadoError();
      }
      const doc: Record<string, unknown> = { ...nueva };
      delete doc.id;
      tx.create(ref, { ...sinIndefinidos(doc), fecha, inicioMs: Date.parse(nueva.inicio) });
      tx.set(
        diaRef,
        {
          fecha,
          bloques: { [ref.id]: { inicio: nueva.inicio, fin: nueva.fin, uid: nueva.clientaId } },
          ultimaCita: ref.id,
        },
        { merge: true }
      );
    });

    return nueva;
  },

  /** Actualiza la cita y, si deja de ocupar agenda, libera su bloque del día. */
  update: async (id: string, datos: Partial<Omit<Cita, 'id'>>): Promise<Cita | undefined> => {
    const ref = col.citas().doc(id);
    const actual = desdeDoc<Cita>(await ref.get());
    if (!actual) return undefined;

    const batch = adminDb().batch();
    batch.update(ref, { ...sinIndefinidos(datos), actualizadaEn: FieldValue.serverTimestamp() });
    if (datos.estado && !ESTADOS_OCUPAN_AGENDA.has(datos.estado) && ESTADOS_OCUPAN_AGENDA.has(actual.estado)) {
      batch.set(
        col.agendaDia(fechaNegocio(actual.inicio)),
        { bloques: { [id]: FieldValue.delete() }, ultimaCita: id },
        { merge: true }
      );
    }
    await batch.commit();
    return desdeDoc<Cita>(await ref.get());
  },
};

const insumosRepo = {
  list: async (): Promise<Insumo[]> => {
    const snap = await col.insumos().get();
    return snap.docs.map((d) => desdeDoc<Insumo>(d)!).sort((a, b) => a.nombre.localeCompare(b.nombre));
  },

  findById: async (id: string): Promise<Insumo | undefined> =>
    desdeDoc<Insumo>(await col.insumos().doc(id).get()),

  create: async (datos: Omit<Insumo, 'id'> & { id?: string }): Promise<Insumo> => {
    const { id, ...resto } = datos;
    const ref = id ? col.insumos().doc(id) : col.insumos().doc();
    await ref.set(sinIndefinidos(resto));
    return { ...resto, id: ref.id } as Insumo;
  },

  update: async (id: string, datos: Partial<Omit<Insumo, 'id'>>): Promise<Insumo | undefined> => {
    const ref = col.insumos().doc(id);
    if (!(await ref.get()).exists) return undefined;
    await ref.update(sinIndefinidos(datos));
    return desdeDoc<Insumo>(await ref.get());
  },
};

/** Historial de actividad (usuarias/{uid}/actividad), el mismo que muestra la app móvil. */
const actividadRepo = {
  registrar: async (uid: string, tipo: string, descripcion: string, citaId?: string): Promise<void> => {
    try {
      await col
        .usuarias()
        .doc(uid)
        .collection('actividad')
        .add(sinIndefinidos({ tipo, descripcion, citaId, fecha: FieldValue.serverTimestamp() }));
    } catch {
      // El historial es informativo: si falla no se interrumpe la operación principal.
    }
  },
};

export const db = {
  actividad: actividadRepo,
  usuarias: usuariasRepo,
  servicios: serviciosRepo,
  citas: citasRepo,
  insumos: insumosRepo,
};

export default db;
