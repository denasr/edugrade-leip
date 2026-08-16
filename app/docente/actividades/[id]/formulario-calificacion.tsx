"use client";

import { useActionState } from "react";
import { calificarEntrega, type EstadoCalificacion } from "./actions";

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
  const calificarEstaEntrega = calificarEntrega.bind(
    null,
    actividadId,
    entregaId
  );
  const [state, formAction, pending] = useActionState(
    calificarEstaEntrega,
    estadoInicial
  );

  return (
    <form
      action={formAction}
      className="mt-3 flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800"
    >
      <label className="flex w-24 flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Nota
        <input
          type="number"
          name="nota"
          required
          min={0}
          max={10}
          step="0.1"
          defaultValue={notaActual ?? undefined}
          className="rounded border border-zinc-300 px-2 py-1 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Retroalimentación
        <textarea
          name="retroalimentacion"
          rows={2}
          defaultValue={comentarioActual ?? ""}
          className="rounded border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
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
