"use client";

import { useActionState } from "react";
import { calificarEntrega, type EstadoCalificacion } from "./actions";
import { useToast } from "../../../toast-provider";

const estadoInicial: EstadoCalificacion = { error: null };

export default function FormularioCalificacion({
  actividadId,
  entregaId,
  notaActual,
  comentarioActual,
}: {
  actividadId: string;
  entregaId: string;
  notaActual: number | null;
  comentarioActual: string | null;
}) {
  const { mostrar } = useToast();

  async function calificarConAviso(
    prevState: EstadoCalificacion,
    formData: FormData
  ): Promise<EstadoCalificacion> {
    const resultado = await calificarEntrega(
      actividadId,
      entregaId,
      prevState,
      formData
    );
    if (!resultado.error) {
      mostrar("Calificación guardada.");
    }
    return resultado;
  }

  const [state, formAction, pending] = useActionState(
    calificarConAviso,
    estadoInicial
  );

  return (
    <form
      action={formAction}
      className="mt-3 flex flex-col gap-2 border-t border-verde-bosque/15 pt-3"
    >
      <label className="flex w-24 flex-col gap-1 text-sm text-ink/80">
        Nota
        <input
          type="number"
          name="nota"
          required
          min={0}
          max={10}
          step="0.1"
          defaultValue={notaActual ?? undefined}
          className="input py-1"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink/80">
        Retroalimentación
        <textarea
          name="retroalimentacion"
          rows={2}
          defaultValue={comentarioActual ?? ""}
          className="input"
        />
      </label>

      {state.error && <p className="text-sm text-terracota">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary self-start px-4 py-1.5"
      >
        {pending
          ? "Guardando…"
          : notaActual !== null
            ? "Actualizar calificación"
            : "Calificar"}
      </button>
    </form>
  );
}
