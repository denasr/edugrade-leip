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
    <form action={formAction} className="card w-full max-w-sm p-6">
      <h2 className="font-title text-xl text-verde-bosque">
        Inscribirte a un curso
      </h2>
      <p className="mt-1 text-sm text-ink/70">
        Pide la clave de acceso a tu docente.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Clave de acceso
          <input
            type="text"
            name="clave_acceso"
            required
            autoComplete="off"
            className="input font-mono uppercase tracking-wide"
          />
        </label>

        {state.error && <p className="text-sm text-terracota">{state.error}</p>}

        <button type="submit" disabled={pending} className="btn-primary mt-2">
          {pending ? "Inscribiendo…" : "Inscribirme"}
        </button>
      </div>
    </form>
  );
}
