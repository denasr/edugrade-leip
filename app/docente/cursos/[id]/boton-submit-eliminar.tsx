"use client";

import { useFormStatus } from "react-dom";

// Debe vivir en su propio componente: useFormStatus solo lee el estado del
// <form> más cercano en un ANCESTRO, no del componente que lo renderiza.
export default function BotonSubmitEliminar({
  mensajeConfirmacion,
}: {
  mensajeConfirmacion: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(mensajeConfirmacion)) e.preventDefault();
      }}
      className="btn-text-accent disabled:opacity-50"
    >
      {pending ? "Eliminando…" : "Eliminar"}
    </button>
  );
}
