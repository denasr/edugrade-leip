"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EstadoAsistencia = { error: string | null };

export async function guardarAsistencia(
  cursoId: string,
  sesionId: string,
  _estadoPrevio: EstadoAsistencia,
  formData: FormData
): Promise<EstadoAsistencia> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const registros: { sesion_id: string; estudiante_id: string; estado: string }[] =
    [];
  for (const [nombre, valor] of formData.entries()) {
    if (
      nombre.startsWith("estado-") &&
      typeof valor === "string" &&
      (valor === "presente" || valor === "ausente")
    ) {
      registros.push({
        sesion_id: sesionId,
        estudiante_id: nombre.slice("estado-".length),
        estado: valor,
      });
    }
  }

  if (registros.length === 0) {
    return { error: "No hay estudiantes para guardar." };
  }

  // RLS (asistencias_insert_docente / asistencias_update_docente) restringe
  // esto al docente dueño del curso de esta sesión.
  const { error } = await supabase
    .from("asistencias")
    .upsert(registros, { onConflict: "sesion_id,estudiante_id" });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/docente/cursos/${cursoId}`);
  return { error: null };
}
