"use client";

import { useActionState } from "react";
import { inscribirse, type EstadoInscripcion } from "./actions";

const estadoInicial: EstadoInscripcion = { error: null };

export default function FormularioInscripcion() {
  const [state, formAction, pending] = useActionState(
    inscribirse,
    estadoInicial
  );

  return (
    <form
      action={formAction}
      className="w-full max-w-sm rounded-lg border border-zinc-200 p-6 dark:border-zinc-800"
    >
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Inscribirte a un curso
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Pide la clave de acceso a tu docente.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Clave de acceso
          <input
            type="text"
            name="clave_acceso"
            required
            autoComplete="off"
            className="rounded border border-zinc-300 px-3 py-2 font-mono uppercase text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
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
          className="mt-2 rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {pending ? "Inscribiendo…" : "Inscribirme"}
        </button>
      </div>
    </form>
  );
}
