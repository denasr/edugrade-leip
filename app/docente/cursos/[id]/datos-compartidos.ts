import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Usado por las 5 pantallas de pestañas para el número que se muestra en el
// badge de "Tareas" en la franja — se necesita en las 5, no solo en la de
// Tareas, porque la franja (con su badge) se renderiza en todas.
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
