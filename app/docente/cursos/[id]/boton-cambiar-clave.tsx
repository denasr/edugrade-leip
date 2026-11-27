"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/app/toast-provider";
import { cambiarClaveAcceso } from "./actions";
import BotonCopiarClave from "./boton-copiar-clave";

// Renovar la clave (p. ej. tras limpiar el grupo al terminar el ciclo) para
// que la anterior ya no sirva. La clave nueva aparece también en la franja
// verde del curso al revalidarse; aquí se repite junto al botón para que el
// docente la vea sin buscarla.
export default function BotonCambiarClave({ cursoId }: { cursoId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [claveNueva, setClaveNueva] = useState<string | null>(null);
  const { mostrar } = useToast();

  function cambiar() {
    if (
      !confirm(
        "Se generará una clave de acceso nueva. La clave actual dejará de funcionar para inscripciones nuevas; los estudiantes ya inscritos no se ven afectados. ¿Continuar?"
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const resultado = await cambiarClaveAcceso(cursoId);
      if (resultado.error) {
        setError(resultado.error);
        setClaveNueva(null);
        return;
      }
      setClaveNueva(resultado.claveNueva ?? null);
      mostrar("Clave de acceso cambiada.");
    });
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-start gap-2">
      <button
        type="button"
        onClick={cambiar}
        disabled={pending}
        className="link-muted w-full justify-center disabled:opacity-50"
      >
        {pending ? "Cambiando clave…" : "Cambiar clave de acceso"}
      </button>
      {error && <p className="text-sm text-terracota">{error}</p>}
      {claveNueva && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-1 rounded-full bg-verde-bosque py-0.5 pl-4 text-crema"
        >
          <span className="text-sm text-crema/85">Clave nueva</span>
          <span className="ml-1 font-mono text-base tracking-wider">{claveNueva}</span>
          <BotonCopiarClave clave={claveNueva} />
        </div>
      )}
    </div>
  );
}
