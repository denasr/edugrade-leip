"use client";

export default function BotonEliminarActividad({
  accion,
  titulo,
}: {
  accion: (formData: FormData) => Promise<void>;
  titulo: string;
}) {
  return (
    <form action={accion}>
      <button
        type="submit"
        onClick={(e) => {
          if (!confirm(`¿Eliminar "${titulo}"? Esta acción no se puede deshacer.`)) {
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
