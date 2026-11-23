'use client';

/**
 * ACCESO CON GOOGLE — BLACK CAT NAILS WEB (Entrega final)
 *
 * Botón "Continuar con Google" (Firebase Authentication, ventana emergente). Si es el
 * primer ingreso de esa cuenta, Google no entrega el teléfono: se muestra un diálogo
 * para completar el perfil, igual que la pantalla CompletarPerfil de la app móvil.
 */

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { obtenerAuth } from '@/lib/firebase';
import { completarPerfilSchema, CompletarPerfilInput } from '@/schemas/auth';
import { PerfilIncompletoError } from '@/services/authService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Usuaria } from '@/types';

function LogoGoogle() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

interface AccesoGoogleProps {
  onListo: (usuaria: Usuaria, esNueva: boolean) => void;
  onError: (mensaje: string) => void;
}

export function AccesoGoogle({ onListo, onError }: AccesoGoogleProps) {
  const { loginConGoogle, completarPerfil } = useAuth();
  const [cargando, setCargando] = useState(false);
  const [pendiente, setPendiente] = useState<{ nombre: string; correo: string } | null>(null);
  const [errorPerfil, setErrorPerfil] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CompletarPerfilInput>({
    resolver: zodResolver(completarPerfilSchema),
    defaultValues: { nombre: '', telefono: '' },
  });

  // Firebase carga su iframe de Google al crear Auth. Si eso ocurre recién al tocar el
  // botón, la ventana se abre después de una espera y el navegador la bloquea; por eso
  // se inicializa al montar el componente.
  useEffect(() => {
    try {
      obtenerAuth();
    } catch {
      // Sin configuración de Firebase: el error se muestra al intentar entrar.
    }
  }, []);

  const entrar = async () => {
    setCargando(true);
    try {
      const usuaria = await loginConGoogle();
      onListo(usuaria, false);
    } catch (e) {
      if (e instanceof PerfilIncompletoError) {
        reset({ nombre: e.nombre, telefono: '' });
        setPendiente({ nombre: e.nombre, correo: e.correo });
      } else {
        onError(e instanceof Error ? e.message : 'No se pudo iniciar sesión con Google');
      }
    } finally {
      setCargando(false);
    }
  };

  const guardarPerfil = async (datos: CompletarPerfilInput) => {
    setErrorPerfil(null);
    try {
      const usuaria = await completarPerfil(datos);
      setPendiente(null);
      onListo(usuaria, true);
    } catch (e) {
      setErrorPerfil(e instanceof Error ? e.message : 'No se pudo guardar tu perfil');
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 my-5 text-xs text-white/40">
        <span className="h-px flex-1 bg-white/10" />o<span className="h-px flex-1 bg-white/10" />
      </div>
      <Button
        type="button"
        variant="outline"
        size="xl"
        className="w-full gap-3"
        disabled={cargando}
        onClick={entrar}
      >
        {cargando ? <Loader2 className="size-5 animate-spin" /> : <LogoGoogle />}
        Continuar con Google
      </Button>

      <Dialog open={pendiente !== null} onOpenChange={(abierto) => !abierto && setPendiente(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Completá tu perfil</DialogTitle>
            <DialogDescription>
              Es tu primer ingreso con {pendiente?.correo}. Necesitamos tu teléfono para confirmar tus citas.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(guardarPerfil)} className="space-y-3" noValidate>
            {errorPerfil && (
              <p role="alert" className="text-xs text-red-300">
                {errorPerfil}
              </p>
            )}
            <div className="space-y-1.5">
              <Input placeholder="Nombre completo" aria-invalid={!!errors.nombre} {...register('nombre')} />
              {errors.nombre && <p className="text-[#ff4444] text-xs px-1">{errors.nombre.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Input
                placeholder="Teléfono (8 dígitos)"
                inputMode="numeric"
                aria-invalid={!!errors.telefono}
                {...register('telefono')}
              />
              {errors.telefono && <p className="text-[#ff4444] text-xs px-1">{errors.telefono.message}</p>}
            </div>
            <Button type="submit" size="xl" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-5 animate-spin" /> : 'Guardar y continuar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AccesoGoogle;
