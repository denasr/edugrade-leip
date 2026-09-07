import Link from "next/link";

type IdPestana = "resumen" | "tareas" | "examenes" | "asistencia" | "estudiantes";

const PESTANAS: { id: IdPestana; etiqueta: string; sufijo: string }[] = [
  { id: "resumen", etiqueta: "Resumen", sufijo: "" },
  { id: "tareas", etiqueta: "Tareas", sufijo: "/tareas" },
  { id: "examenes", etiqueta: "Exámenes", sufijo: "/examenes" },
  { id: "asistencia", etiqueta: "Asistencia", sufijo: "/asistencia" },
  { id: "estudiantes", etiqueta: "Estudiantes", sufijo: "/estudiantes" },
];

// Componente puramente presentacional: cada pantalla de pestaña ya hizo su
// propia verificación de docente-dueño-del-curso (mismo patrón de siempre
// en este proyecto, cada página se verifica a sí misma) antes de llegar
// aquí, y le pasa lo que necesita mostrar (el conteo de pendientes).
export default function FranjaPestanas({
  cursoId,
  activa,
  pendientesTareas,
}: {
  cursoId: string;
  activa: IdPestana;
  pendientesTareas: number;
}) {
  return (
    <nav
      className="flex w-full max-w-sm overflow-x-auto border-b border-verde-bosque/15 lg:max-w-4xl"
      aria-label="Secciones del curso"
    >
      {PESTANAS.map((pestana) => {
        const esActiva = pestana.id === activa;
        return (
          <Link
            key={pestana.id}
            href={`/docente/cursos/${cursoId}${pestana.sufijo}`}
            aria-current={esActiva ? "page" : undefined}
            className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-1 py-2.5 text-center text-xs font-medium transition-colors ${
              esActiva
                ? "border-verde-bosque text-verde-bosque"
                : "border-transparent text-ink/60 hover:text-ink/80"
            }`}
          >
            {pestana.etiqueta}
            {pestana.id === "tareas" && pendientesTareas > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-terracota px-1 text-[10px] font-bold text-crema">
                {pendientesTareas}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
