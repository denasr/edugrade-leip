"use client";

import { useActionState, useState } from "react";
import { useToast } from "@/app/toast-provider";

type EstadoEliminar = { error: string | null };

const estadoInicial: EstadoEliminar = { error: null };

export default function ModalEliminarEstudiante({
  accion,
  nombreCompleto,
}: {
  accion: (formData: FormData) => Promise<EstadoEliminar>;
  nombreCompleto: string;
}) {
  const { mostrar } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");

  async function eliminarConAviso(
    prevState: EstadoEliminar,
    formData: FormData
  ): Promise<EstadoEliminar> {
    const resultado = await accion(formData);
    if (!resultado.error) {
      setAbierto(false);
      setConfirmacion("");
      mostrar("Estudiante eliminado del curso.");
    }
    return resultado;
  }

  const [state, formAction, pending] = useActionState(
    eliminarConAviso,
    estadoInicial
  );

  function cerrar() {
    if (pending) return;
    setAbierto(false);
    setConfirmacion("");
  }

  // Salvaguarda extra sobre el propio modal de confirmación: el botón
  // definitivo solo se habilita si el texto escrito coincide exactamente
  // (mayúsculas/espacios incluidos) con el nombre del estudiante.
  const confirmacionValida = confirmacion === nombreCompleto;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="btn-text-accent shrink-0"
      >
        Eliminar
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-eliminar-estudiante"
        >
          <div className="card w-full max-w-sm p-6">
            <h2
              id="titulo-eliminar-estudiante"
              className="font-title text-xl text-verde-bosque"
            >
              Eliminar a {nombreCompleto}
            </h2>
            <p className="mt-3 text-sm text-ink/70">
              Esto borra de forma <strong>permanente</strong>: su inscripción
              a este curso, todas sus entregas de tareas, sus respuestas de
              examen, sus calificaciones, y los archivos que haya subido en
              este curso.
            </p>
            <p className="mt-2 text-sm text-ink/70">
              La cuenta del estudiante <strong>no</strong> se toca — solo su
              relación con este curso. Podría volver a inscribirse con la
              clave de acceso si hace falta.
            </p>

            <form action={formAction} className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm text-ink/80">
                Escribe <strong>{nombreCompleto}</strong> para confirmar:
                <input
                  type="text"
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  className="input"
                  autoComplete="off"
                  autoFocus
                  disabled={pending}
                />
              </label>

              {state.error && (
                <p className="text-sm text-terracota">{state.error}</p>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={!confirmacionValida || pending}
                  className="btn-accent"
                >
                  {pending ? "Eliminando…" : "Eliminar definitivamente"}
                </button>
                <button type="button" onClick={cerrar} className="link-muted">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
