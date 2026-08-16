"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EstadoCalificacion = { error: string | null };

export async function calificarEntrega(
  actividadId: string,
  entregaId: string,
  _estadoPrevio: EstadoCalificacion,
  formData: FormData
): Promise<EstadoCalificacion> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const notaTexto = String(formData.get("nota") ?? "").trim();
  const retroalimentacion = String(
    formData.get("retroalimentacion") ?? ""
  ).trim();

  const nota = Number(notaTexto);
  if (notaTexto === "" || Number.isNaN(nota) || nota < 0 || nota > 10) {
    return { error: "La calificación debe ser un número entre 0 y 10." };
  }

  const { error } = await supabase.from("evaluaciones").upsert(
    {
      entrega_id: entregaId,
      calificacion_final: nota,
      comentarios: retroalimentacion || null,
      origen: "MANUAL",
    },
    { onConflict: "entrega_id" }
  );

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/docente/actividades/${actividadId}`);
  return { error: null };
}
