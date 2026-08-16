"use client";

import { useActionState, useEffect, useRef } from "react";
import { crearActividad, type EstadoActividad } from "./actions";

const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

const estadoInicial: EstadoActividad = { error: null };

export default function FormularioActividad({ cursoId }: { cursoId: string }) {
  const crearActividadDelCurso = crearActividad.bind(null, cursoId);
  const [state, formAction, pending] = useActionState(
    crearActividadDelCurso,
    estadoInicial
  );
  const formRef = useRef<HTMLFormElement>(null);
  const primerRender = useRef(true);

  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    if (!pending && state.error === null) {
      formRef.current?.reset();
    }
  }, [state, pending]);

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
      className="w-full max-w-sm rounded-lg border border-zinc-200 p-6 dark:border-zinc-800"
    >
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Nueva tarea
      </h2>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Título
          <input
            type="text"
            name="titulo"
            required
            className="rounded border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Instrucciones
          <textarea
            name="instrucciones"
            rows={3}
            className="rounded border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Fecha de apertura (opcional)
          <input
            type="datetime-local"
            name="fecha_apertura"
            className="rounded border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Fecha de cierre
          <input
            type="datetime-local"
            name="fecha_cierre"
            required
            className="rounded border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Ponderación
          <input
            type="number"
            name="ponderacion"
            required
            min={0}
            step="any"
            defaultValue={10}
            className="rounded border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Material de apoyo (opcional)
          <input
            type="file"
            name="archivo"
            accept=".pdf,.docx,.jpg,.jpeg,.png"
            className="text-sm text-zinc-700 dark:text-zinc-300"
          />
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
            PDF, DOCX, JPG o PNG. Máximo 10 MB.
          </span>
        </label>

        {state.error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {pending ? "Creando…" : "Crear tarea"}
        </button>
      </div>
    </form>
  );
}
