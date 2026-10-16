"use client";

import { useState } from "react";
import { eliminarEntrega } from "./actions";
import { useToast } from "../../../toast-provider";

// confirm() nativo, mismo patrón que BotonEliminarActividad. El mensaje
// cambia según lo que se pierde (una calificación ya puesta) y según si el
// estudiante de verdad va a poder reenviar — si la tarea ya cerró, borrar
// la entrega no le abre ningún formulario hasta que se amplíe la fecha.
export default function BotonEliminarEntrega({
  actividadId,
  entregaId,
  nombreEstudiante,
  calificada,
  actividadAbierta,
}: {
  actividadId: string;
  entregaId: string;
  nombreEstudiante: string;
  calificada: boolean;
  actividadAbierta: boolean;
}) {
  const { mostrar } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function manejarClic() {
    const partes = [
      `¿Eliminar la entrega de ${nombreEstudiante}?`,
      // `calificada` viene del render del servidor y puede ir un paso atrás
      // si se califica y se elimina sin recargar — por eso, sin calificación
      // conocida, el aviso igual menciona que una nota se borraría.
      calificada
        ? "Se borrarán sus archivos y también la calificación que ya le pusiste."
        : "Se borrarán sus archivos (y su calificación, si ya tiene una).",
      actividadAbierta
        ? "Podrá volver a entregar mientras la tarea siga abierta."
        : "La tarea ya está cerrada: para que pueda volver a entregar tendrás que ampliar la fecha de cierre o desbloquearla.",
      "Esta acción no se puede deshacer.",
    ];
    if (!confirm(partes.join("\n\n"))) return;

    setPending(true);
    setError(null);
    const resultado = await eliminarEntrega(actividadId, entregaId);
    setPending(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    mostrar("Entrega eliminada.");
  }

  return (
    <div className="mt-3 flex flex-col items-end gap-1 border-t border-verde-bosque/15 pt-3">
      <button
        type="button"
        onClick={manejarClic}
        disabled={pending}
        className="btn-text-accent disabled:opacity-50"
      >
        {pending ? "Eliminando…" : "Eliminar entrega"}
      </button>
      {error && <p className="text-sm text-terracota">{error}</p>}
    </div>
  );
}
