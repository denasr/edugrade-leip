"use client";

import { useToast } from "@/app/toast-provider";

// La clave se le dicta o se le manda al grupo varias veces al inicio del
// semestre; copiarla con un clic evita errores entre 0/O o 1/I.
export default function BotonCopiarClave({ clave }: { clave: string }) {
  const { mostrar } = useToast();

  async function copiar() {
    try {
      await navigator.clipboard.writeText(clave);
      mostrar("Clave copiada.");
    } catch {
      mostrar("No se pudo copiar. Selecciona la clave y cópiala a mano.");
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className="inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium text-crema underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crema"
    >
      Copiar
    </button>
  );
}
