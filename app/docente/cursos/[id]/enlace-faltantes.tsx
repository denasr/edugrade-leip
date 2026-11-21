import Link from "next/link";

// Enlace a /docente/actividades/[id]/faltantes desde las tarjetas de la
// pestaña Tareas. `faltantes` null = el curso no tiene inscritos, y entonces
// no hay nada que mostrar.
export default function EnlaceFaltantes({
  actividadId,
  faltantes,
  verbo,
}: {
  actividadId: string;
  faltantes: number | null;
  verbo: "entregado" | "presentado";
}) {
  if (faltantes === null) return null;
  return (
    <Link
      href={`/docente/actividades/${actividadId}/faltantes`}
      className="mt-1 block text-xs font-medium text-verde-bosque hover:underline"
    >
      {faltantes === 0
        ? `Todos han ${verbo}`
        : `${faltantes} sin ${verbo === "entregado" ? "entregar" : "presentar"} · ver quiénes`}
    </Link>
  );
}
