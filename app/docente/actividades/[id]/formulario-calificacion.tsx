"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { calificarEntrega, type EstadoCalificacion } from "./actions";
import { useToast } from "../../../toast-provider";

const estadoInicial: EstadoCalificacion = { error: null };

export default function FormularioCalificacion({
  actividadId,
  entregaId,
  notaActual,
  comentarioActual,
  siguienteHref,
}: {
  actividadId: string;
  entregaId: string;
  notaActual: number | null;
  comentarioActual: string | null;
  // Solo en el modo revisión: a dónde lleva "Guardar y siguiente" (la
  // siguiente entrega sin calificar, o de vuelta a la lista si ya no hay).
  siguienteHref?: string;
}) {
  const { mostrar } = useToast();
  const router = useRouter();

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
      if (siguienteHref && formData.get("despues") === "siguiente") {
        router.push(siguienteHref);
      }
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

      <div className="flex flex-wrap items-center gap-2">
        {siguienteHref && (
          <button
            type="submit"
            name="despues"
            value="siguiente"
            disabled={pending}
            className="btn-primary px-4 py-1.5"
          >
            {pending ? "Guardando…" : "Guardar y siguiente →"}
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className={`${siguienteHref ? "btn-secondary" : "btn-primary"} self-start px-4 py-1.5`}
        >
          {pending && !siguienteHref
            ? "Guardando…"
            : notaActual !== null
              ? "Actualizar calificación"
              : siguienteHref
                ? "Solo guardar"
                : "Calificar"}
        </button>
      </div>
    </form>
  );
}
