"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/app/toast-provider";
import { CONFIRMAR_CERRAR_INSCRIPCIONES } from "@/lib/inscripciones-curso";
import { abrirInscripciones, cerrarInscripciones } from "./actions";

// Cerrar inscripciones cierra la puerta aunque alguien tenga la clave
// vigente (cambiar la clave, en cambio, reemplaza la llave). Cerrar pide
// confirmación; reabrir no, porque no le quita nada a nadie.
export default function BotonInscripcionesCurso({
  cursoId,
  cerradas,
}: {
  cursoId: string;
  cerradas: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { mostrar } = useToast();

  function cambiar() {
    if (!cerradas && !confirm(CONFIRMAR_CERRAR_INSCRIPCIONES)) return;
    setError(null);
    startTransition(async () => {
      const resultado = cerradas
        ? await abrirInscripciones(cursoId)
        : await cerrarInscripciones(cursoId);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      mostrar(cerradas ? "Inscripciones abiertas." : "Inscripciones cerradas.");
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
        {pending ? "Guardando…" : cerradas ? "Abrir inscripciones" : "Cerrar inscripciones"}
      </button>
      {error && <p className="text-sm text-terracota">{error}</p>}
    </div>
  );
}
