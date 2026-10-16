"use client";

import { useState } from "react";
import BotonSubmitEliminar from "./boton-submit-eliminar";

export default function BotonEliminarActividad({
  accion,
  titulo,
}: {
  accion: (formData: FormData) => Promise<{ error: string | null }>;
  titulo: string;
}) {
  const [error, setError] = useState<string | null>(null);

  // Antes cualquier falla se ignoraba en silencio: la tarjeta seguía ahí sin
  // ningún aviso. Si todo sale bien no hay nada que mostrar — la tarjeta
  // desaparece sola con la revalidación de la página.
  async function eliminar(formData: FormData) {
    setError(null);
    const resultado = await accion(formData);
    if (resultado.error) setError(resultado.error);
  }

  return (
    <form action={eliminar} className="flex flex-col items-end gap-1">
      <BotonSubmitEliminar
        mensajeConfirmacion={`¿Eliminar "${titulo}"? También se borrarán las entregas de los estudiantes y sus archivos. Esta acción no se puede deshacer.`}
      />
      {error && <p className="text-sm text-terracota">{error}</p>}
    </form>
  );
}
