"use client";

export default function BotonEliminarSesion({
  accion,
  fechaLegible,
}: {
  accion: (formData: FormData) => Promise<void>;
  fechaLegible: string;
}) {
  return (
    <form action={accion}>
      <button
        type="submit"
        onClick={(e) => {
          if (
            !confirm(
              `Esto eliminará la asistencia registrada de todos los estudiantes para el ${fechaLegible}. Esta acción no se puede deshacer. ¿Continuar?`
            )
          ) {
            e.preventDefault();
          }
        }}
        className="btn-text-accent"
      >
        Eliminar
      </button>
    </form>
  );
}
