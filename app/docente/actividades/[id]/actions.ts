"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calificarExamen } from "@/lib/calificar-examen";

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

  // "layout": también el modo revisión (revisar/[entregaId]), que cuelga
  // de esta ruta y muestra cuántas faltan por calificar.
  revalidatePath(`/docente/actividades/${actividadId}`, "layout");
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

export type EstadoRespuestasAbiertas = { error: string | null };

// Califica las preguntas abiertas de una entrega de examen o cuestionario:
// el docente asigna los puntos de cada respuesta escrita (de 0 a los puntos
// de la pregunta) y con eso sale la nota, junto con lo que ya se había
// calificado solo de opción múltiple (lib/calificar-examen.ts, la misma
// fórmula que usa presentarExamen). Se puede volver a calificar.
//
// respuestas_examen no tiene policy de update para nadie: se verifica con
// el cliente normal (RLS) que la entrega es de una actividad de este
// docente, y solo después se usa la secret key para escribir los puntos.
export async function calificarRespuestasAbiertas(
  actividadId: string,
  entregaId: string,
  _estadoPrevio: EstadoRespuestasAbiertas,
  formData: FormData
): Promise<EstadoRespuestasAbiertas> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const { data: entrega } = (await supabase
    .from("entregas")
    .select("id, actividad_id, actividades(cursos(docente_id))")
    .eq("id", entregaId)
    .eq("actividad_id", actividadId)
    .maybeSingle()) as {
    data: {
      id: string;
      actividad_id: string;
      actividades: { cursos: { docente_id: string } | null } | null;
    } | null;
  };

  if (!entrega || entrega.actividades?.cursos?.docente_id !== user.id) {
    return { error: "No tienes permiso sobre esta entrega." };
  }

  const admin = createAdminClient();
  const [{ data: preguntas }, { data: respuestas }] = await Promise.all([
    admin
      .from("preguntas_examen")
      .select("id, tipo, correcta, puntos")
      .eq("actividad_id", actividadId),
    admin
      .from("respuestas_examen")
      .select("id, pregunta_id, respuesta_seleccionada, puntos_otorgados")
      .eq("entrega_id", entregaId),
  ]);

  if (!preguntas || !respuestas) {
    return { error: "No se pudieron leer las respuestas. Intenta de nuevo." };
  }

  // Solo se califican las abiertas que sí contestó; una en blanco vale 0
  // sin que el docente tenga que hacer nada.
  const respuestaPorPregunta = new Map(respuestas.map((r) => [r.pregunta_id, r]));
  const actualizaciones: { id: string; puntos: number }[] = [];
  for (const pregunta of preguntas) {
    if (pregunta.tipo !== "ABIERTA") continue;
    const respuesta = respuestaPorPregunta.get(pregunta.id);
    if (!respuesta?.respuesta_seleccionada?.trim()) continue;

    const texto = String(formData.get(`puntos-${pregunta.id}`) ?? "").trim();
    const puntos = Number(texto);
    const maximo = Number(pregunta.puntos);
    if (texto === "" || !Number.isFinite(puntos) || puntos < 0 || puntos > maximo) {
      return { error: `Asigna a cada respuesta escrita entre 0 y sus puntos (máximo ${maximo}).` };
    }
    actualizaciones.push({ id: respuesta.id, puntos });
  }

  for (const { id, puntos } of actualizaciones) {
    const { error } = await admin
      .from("respuestas_examen")
      .update({ puntos_otorgados: puntos })
      .eq("id", id)
      .eq("entrega_id", entregaId);
    if (error) {
      console.error("Error al guardar puntos de respuesta abierta:", error);
      return { error: "No se pudieron guardar los puntos. Intenta de nuevo." };
    }
  }

  const puntosPorRespuesta = new Map(actualizaciones.map((a) => [a.id, a.puntos]));
  const { nota } = calificarExamen(
    preguntas,
    respuestas.map((r) => ({
      ...r,
      puntos_otorgados: puntosPorRespuesta.get(r.id) ?? r.puntos_otorgados,
    }))
  );
  if (nota === null) {
    return { error: "Falta calificar alguna respuesta escrita." };
  }

  const comentarios = String(formData.get("retroalimentacion") ?? "").trim();
  // RLS (evaluaciones del docente) permite este upsert con el cliente normal,
  // igual que calificarEntrega. El trigger marca la entrega como CALIFICADO.
  const { error: errorEvaluacion } = await supabase.from("evaluaciones").upsert(
    {
      entrega_id: entregaId,
      calificacion_final: nota,
      comentarios: comentarios || null,
      origen: "MANUAL",
    },
    { onConflict: "entrega_id" }
  );

  if (errorEvaluacion) {
    return { error: errorEvaluacion.message };
  }

  revalidatePath(`/docente/actividades/${actividadId}`, "layout");
  revalidatePath("/docente/cursos", "layout");
  return { error: null };
}
