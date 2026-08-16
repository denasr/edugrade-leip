"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EstadoCrearCurso = { error: string | null };

export async function crearCurso(
  _estadoPrevio: EstadoCrearCurso,
  formData: FormData
): Promise<EstadoCrearCurso> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const nombre = String(formData.get("nombre") ?? "").trim();
  const grupo = String(formData.get("grupo") ?? "").trim();
  const periodo = String(formData.get("periodo") ?? "").trim();
  const claveAcceso = String(formData.get("clave_acceso") ?? "").trim();

  if (!nombre || !grupo || !periodo || !claveAcceso) {
    return { error: "Todos los campos son obligatorios." };
  }

  const { error } = await supabase.from("cursos").insert({
    docente_id: user.id,
    nombre,
    grupo,
    periodo,
    clave_acceso: claveAcceso,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        error: "Esa clave de acceso ya está en uso. Prueba con otra.",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/docente");
  return { error: null };
}
