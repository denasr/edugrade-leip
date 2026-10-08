import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Vive fuera de app/docente/cursos/[id] (donde estaba antes) a propósito:
// importarlo desde /docente/page.tsx, que está fuera de ese segmento
// dinámico, hacía que Next.js devolviera 404 en /docente — confirmado en
// vivo, sin ningún otro cambio de por medio. Un helper compartido entre
// rutas no debería vivir dentro de una de ellas de cualquier forma.
//
// Usado por las 5 pantallas de pestañas de un curso para el número del
// badge de "Tareas" en la franja, y por /docente/page.tsx para el resumen
// de "Por calificar" across todos los cursos del docente.
export async function contarPendientesTareas(
  supabase: SupabaseServerClient,
  cursoId: string
): Promise<number> {
  const { data: actividades } = await supabase
    .from("actividades")
    .select("id")
    .eq("curso_id", cursoId)
    .eq("tipo", "TAREA");

  const ids = (actividades ?? []).map((a) => a.id);
  if (ids.length === 0) return 0;

  const { count } = await supabase
    .from("entregas")
    .select("*", { count: "exact", head: true })
    .in("actividad_id", ids)
    .eq("estado", "PENDIENTE");

  return count ?? 0;
}
