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

export type EstadoEliminarEntrega = { error: string | null };

// Borra la entrega de un estudiante (archivos, calificación y, si es un
// cuestionario, sus respuestas) para que pueda volver a entregar — caso de
// archivo equivocado o entrega vacía por error. Solo el docente: el
// estudiante nunca tuvo policy de delete sobre `entregas`, a propósito.
//
// Orden: primero Storage, luego la fila. storage_entregas_delete_docente
// valida es_docente_de_entrega(entrega_id), que necesita que la fila de
// `entregas` siga viva — si se borrara antes, el remove() de Storage
// "tendría éxito" con 0 objetos borrados (mismo motivo que la migración
// 20260901120000 parte en dos fases el borrado de un estudiante).
// archivos_entrega, evaluaciones y respuestas_examen se van por el
// `on delete cascade` de entrega_id.
export async function eliminarEntrega(
  actividadId: string,
  entregaId: string
): Promise<EstadoEliminarEntrega> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
    }

    // Con RLS, esto ya confirma que la entrega es de una actividad de un
    // curso de este docente (entregas_select) — si no, no hay fila.
    const { data: entrega } = await supabase
      .from("entregas")
      .select("id, archivos_entrega(storage_path)")
      .eq("id", entregaId)
      .eq("actividad_id", actividadId)
      .maybeSingle();

    if (!entrega) {
      return { error: "No se encontró la entrega." };
    }

    const rutas = entrega.archivos_entrega.map((a) => a.storage_path);
    if (rutas.length > 0) {
      const { error: errorStorage } = await supabase.storage
        .from("archivos-entrega")
        .remove(rutas);
      if (errorStorage) {
        console.error("No se pudieron borrar los archivos de la entrega:", errorStorage);
        return { error: "No se pudieron borrar los archivos. Intenta de nuevo." };
      }
    }

    // .select() para distinguir "borrada" de "0 filas por RLS", que en
    // Postgres no es un error.
    const { data: borradas, error: errorDelete } = await supabase
      .from("entregas")
      .delete()
      .eq("id", entregaId)
      .select("id");

    if (errorDelete || !borradas || borradas.length === 0) {
      console.error("No se pudo borrar la entrega:", errorDelete);
      return { error: "No se pudo eliminar la entrega. Intenta de nuevo." };
    }

    revalidatePath(`/docente/actividades/${actividadId}`);
    return { error: null };
  } catch (err) {
    console.error("Excepción inesperada en eliminarEntrega:", err);
    return { error: "No se pudo eliminar la entrega. Intenta de nuevo en un momento." };
  }
}
