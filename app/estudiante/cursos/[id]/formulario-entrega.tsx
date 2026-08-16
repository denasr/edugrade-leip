"use client";

import { useActionState, useRef } from "react";
import { entregarTarea, type EstadoEntrega } from "./actions";

const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

const estadoInicial: EstadoEntrega = { error: null };

export default function FormularioEntrega({
  actividadId,
  cursoId,
}: {
  actividadId: string;
  cursoId: string;
}) {
  const entregarEstaTarea = entregarTarea.bind(null, actividadId, cursoId);
  const [state, formAction, pending] = useActionState(
    entregarEstaTarea,
    estadoInicial
  );
  const formRef = useRef<HTMLFormElement>(null);

  function validarArchivo(e: React.FormEvent<HTMLFormElement>) {
    const input = formRef.current?.elements.namedItem(
      "archivo"
    ) as HTMLInputElement | null;
    const archivo = input?.files?.[0];
    if (archivo && archivo.size > TAMANO_MAXIMO_BYTES) {
      e.preventDefault();
      alert("El archivo supera el máximo de 10 MB.");
    }
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={validarArchivo}
      className="mt-3 flex flex-col gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800"
    >
      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Archivo
        <input
          type="file"
          name="archivo"
          required
          accept=".pdf,.docx,.jpg,.jpeg,.png"
          className="text-sm text-zinc-700 dark:text-zinc-300"
        />
        <span className="text-xs text-zinc-500 dark:text-zinc-500">
          PDF, DOCX, JPG o PNG. Máximo 10 MB.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Comentario (opcional)
        <textarea
          name="comentario"
          rows={2}
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
        className="self-start rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {pending ? "Entregando…" : "Entregar tarea"}
      </button>
    </form>
  );
}
