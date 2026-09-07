"use client";

import BotonSubmitEliminar from "./boton-submit-eliminar";

export default function BotonEliminarSesion({
  accion,
  fechaLegible,
}: {
  accion: (formData: FormData) => Promise<void>;
  fechaLegible: string;
}) {
  return (
    <form action={accion}>
      <BotonSubmitEliminar
        mensajeConfirmacion={`Esto eliminará la asistencia registrada de todos los estudiantes para el ${fechaLegible}. Esta acción no se puede deshacer. ¿Continuar?`}
      />
    </form>
  );
}
