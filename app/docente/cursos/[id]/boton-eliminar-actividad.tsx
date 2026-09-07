"use client";

import BotonSubmitEliminar from "./boton-submit-eliminar";

export default function BotonEliminarActividad({
  accion,
  titulo,
}: {
  accion: (formData: FormData) => Promise<void>;
  titulo: string;
}) {
  return (
    <form action={accion}>
      <BotonSubmitEliminar
        mensajeConfirmacion={`¿Eliminar "${titulo}"? Esta acción no se puede deshacer.`}
      />
    </form>
  );
}
