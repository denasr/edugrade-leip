import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type PendientesCurso = { tareas: number; examenes: number };

// Vive fuera de app/docente/cursos/[id] (donde estaba antes) a propósito:
// importarlo desde /docente/page.tsx, que está fuera de ese segmento
// dinámico, hacía que Next.js devolviera 404 en /docente — confirmado en
// vivo, sin ningún otro cambio de por medio. Un helper compartido entre
// rutas no debería vivir dentro de una de ellas de cualquier forma.
//
// Entregas sin calificar (estado PENDIENTE) de un curso, por tipo de
// actividad. Las de tareas incluyen cuestionarios con preguntas abiertas;
// las de exámenes solo existen si el examen tiene preguntas abiertas (uno
// solo de opción múltiple se califica al entregarse). Lo usan las pestañas
// de un curso para los números de la franja, y /docente/page.tsx para
// "Por calificar".
export async function contarPendientesCurso(
  supabase: SupabaseServerClient,
  cursoId: string
): Promise<PendientesCurso> {
  const { data: actividades } = await supabase
    .from("actividades")
    .select("id, tipo")
    .eq("curso_id", cursoId);

  const contar = async (tipo: "TAREA" | "EXAMEN") => {
    const ids = (actividades ?? []).filter((a) => a.tipo === tipo).map((a) => a.id);
    if (ids.length === 0) return 0;
    const { count } = await supabase
      .from("entregas")
      .select("*", { count: "exact", head: true })
      .in("actividad_id", ids)
      .eq("estado", "PENDIENTE");
    return count ?? 0;
  };

  const [tareas, examenes] = await Promise.all([contar("TAREA"), contar("EXAMEN")]);
  return { tareas, examenes };
}
