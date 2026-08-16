"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EstadoInscripcion = { error: string | null };

export async function inscribirse(
  _estadoPrevio: EstadoInscripcion,
  formData: FormData
): Promise<EstadoInscripcion> {
  const supabase = await createClient();
  const claveAcceso = String(formData.get("clave_acceso") ?? "").trim();

  if (!claveAcceso) {
    return { error: "Ingresa una clave de acceso." };
  }

  const { error } = await supabase.rpc("inscribirse_a_curso", {
    p_clave_acceso: claveAcceso,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/estudiante");
  return { error: null };
}
