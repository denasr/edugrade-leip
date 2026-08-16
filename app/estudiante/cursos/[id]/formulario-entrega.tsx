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
      className="mt-3 flex flex-col gap-3 border-t border-verde-bosque/15 pt-3"
    >
      <label className="flex flex-col gap-1 text-sm text-ink/80">
        Archivo
        <input
          type="file"
          name="archivo"
          required
          accept=".pdf,.docx,.jpg,.jpeg,.png"
          className="text-sm text-ink/70 file:mr-3 file:rounded-full file:border-0 file:bg-verde-bosque/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-verde-bosque"
        />
        <span className="text-xs text-ink/50">
          PDF, DOCX, JPG o PNG. Máximo 10 MB.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink/80">
        Comentario (opcional)
        <textarea name="comentario" rows={2} className="input" />
      </label>

      {state.error && <p className="text-sm text-terracota">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary self-start"
      >
        {pending ? "Entregando…" : "Entregar tarea"}
      </button>
    </form>
  );
}
