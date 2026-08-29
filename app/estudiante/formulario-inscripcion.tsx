"use client";

import { useActionState, useRef, useState } from "react";
import { inscribirse, type EstadoInscripcion } from "./actions";
import { useToast } from "../toast-provider";

const estadoInicial: EstadoInscripcion = { error: null };

export default function FormularioInscripcion({
  mostrarBotonToggle = false,
}: {
  mostrarBotonToggle?: boolean;
}) {
  const { mostrar } = useToast();
  const [abierto, setAbierto] = useState(!mostrarBotonToggle);
  const formRef = useRef<HTMLFormElement>(null);

  async function inscribirseConAviso(
    prevState: EstadoInscripcion,
    formData: FormData
  ): Promise<EstadoInscripcion> {
    const resultado = await inscribirse(prevState, formData);
    if (!resultado.error) {
      formRef.current?.reset();
      setAbierto(!mostrarBotonToggle);
      mostrar("Te uniste al curso.");
    }
    return resultado;
  }

  const [state, formAction, pending] = useActionState(
    inscribirseConAviso,
    estadoInicial
  );

  if (mostrarBotonToggle && !abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="btn-primary w-full max-w-sm"
      >
        + Unirme a otro curso
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="card w-full max-w-sm p-6"
    >
      <h2 className="font-title text-xl text-verde-bosque">
        {mostrarBotonToggle ? "Unirme a otro curso" : "Inscribirte a un curso"}
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

        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Inscribiendo…" : "Inscribirme"}
          </button>
          {mostrarBotonToggle && (
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="link-muted"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
