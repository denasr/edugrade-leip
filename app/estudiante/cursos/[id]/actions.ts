"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type EstadoEntrega = { error: string | null };
export type EstadoExamen = { error: string | null };

// Vercel impone su propio límite de payload (~4.5 MB) a las Serverless
// Functions, por delante y de forma independiente de cualquier
// `bodySizeLimit` configurado en next.config.ts (ese solo controla el
// límite de Next.js/Node dentro de la función, no el de la plataforma).
// Por eso los archivos de una entrega ya no viajan en el FormData de una
// Server Action: el navegador los sube directo a Supabase Storage (mismo
// origen/credenciales que usaría el cliente normal, mismas policies de
// RLS) y estas Server Actions solo reciben metadata (rutas, nombres,
// tamaños) para escribir en la base de datos. Ver formulario-entrega.tsx.
const MAXIMO_ARCHIVOS = 10;

// entregas nunca tuvo policy de delete para el propio estudiante (solo se
// agregó para el docente, en la migración de eliminar-estudiante) — un
// supabase.from("entregas").delete() con el cliente normal aquí fallaría
// en silencio (0 filas afectadas, sin error) y dejaría la entrega huérfana
// para siempre, bloqueando cualquier reintento futuro por la restricción
// de una entrega por actividad. Confirmado en vivo: así se generaron 7
// entregas reales sin archivos en producción, antes de este fix, cuando
// una subida fallaba a medio camino.
//
// Se usa la secret key nada más para este borrado puntual — la entrega
// que se borra es la que la propia función acaba de crear en esta misma
// invocación, nunca una ajena; no es un acceso nuevo a datos de otro
// usuario, es limpieza de un error a mitad de la propia operación.
async function borrarEntregaDeLimpieza(entregaId: string) {
  const admin = createAdminClient();
  const { error } = await admin.from("entregas").delete().eq("id", entregaId);
  if (error) {
    console.error("No se pudo limpiar la entrega tras un error:", error);
  }
}

export type EstadoCrearEntrega = { error: string | null; entregaId: string | null };

// Paso 1: registra la entrega sin archivos. El navegador sube los archivos
// directo a Storage después de esto (ver formulario-entrega.tsx) y recién
// entonces llama a confirmarArchivosEntrega.
export async function crearEntrega(
  actividadId: string,
  comentario: string
): Promise<EstadoCrearEntrega> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Tu sesión expiró. Vuelve a iniciar sesión.", entregaId: null };
    }

    const { data: entrega, error: errorInsert } = await supabase
      .from("entregas")
      .insert({
        actividad_id: actividadId,
        estudiante_id: user.id,
        comentario_estudiante: comentario || null,
      })
      .select("id")
      .single();

    if (errorInsert || !entrega) {
      if (errorInsert?.code === "23505") {
        return { error: "Ya entregaste esta tarea.", entregaId: null };
      }
      return {
        error:
          errorInsert?.message ??
          "No se pudo registrar la entrega. Verifica que la tarea siga abierta.",
        entregaId: null,
      };
    }

    return { error: null, entregaId: entrega.id };
  } catch (err) {
    console.error("Excepción inesperada en crearEntrega:", err);
    return {
      error: "No se pudo registrar la entrega. Intenta de nuevo en un momento.",
      entregaId: null,
    };
  }
}

export type ArchivoSubido = {
  storagePath: string;
  nombreArchivo: string;
  tamanoBytes: number;
};

// Paso 2 (éxito): el navegador ya subió los archivos a Storage; aquí solo
// se registran en la base de datos. Si esto falla, se deshace todo (Storage
// + la fila de entregas) para no dejar una entrega a medias.
export async function confirmarArchivosEntrega(
  entregaId: string,
  cursoId: string,
  archivos: ArchivoSubido[]
): Promise<EstadoEntrega> {
  try {
    if (archivos.length === 0) {
      await cancelarEntrega(entregaId);
      return { error: "Adjunta al menos un archivo para entregar la tarea." };
    }
    if (archivos.length > MAXIMO_ARCHIVOS) {
      await cancelarEntrega(entregaId);
      return { error: `Puedes adjuntar hasta ${MAXIMO_ARCHIVOS} archivos.` };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
    }

    const { error: errorArchivo } = await supabase.from("archivos_entrega").insert(
      archivos.map((a) => ({
        entrega_id: entregaId,
        nombre_archivo: a.nombreArchivo,
        storage_path: a.storagePath,
        tamano_bytes: a.tamanoBytes,
      }))
    );

    if (errorArchivo) {
      await supabase.storage
        .from("archivos-entrega")
        .remove(archivos.map((a) => a.storagePath));
      await borrarEntregaDeLimpieza(entregaId);
      return { error: errorArchivo.message };
    }

    revalidatePath(`/estudiante/cursos/${cursoId}`);
    return { error: null };
  } catch (err) {
    console.error("Excepción inesperada en confirmarArchivosEntrega:", err);
    await cancelarEntrega(entregaId);
    return {
      error: "No se pudo entregar la tarea. Intenta de nuevo en un momento.",
    };
  }
}

// Paso 2 (fallo): si la subida a Storage falla a mitad de camino en el
// navegador, o confirmarArchivosEntrega no logra guardar la metadata, hay
// que deshacer la entrega — el estudiante nunca tuvo permiso de borrar su
// propia fila en `entregas` (mismo motivo que borrarEntregaDeLimpieza), así
// que también se usa la secret key aquí. Se listan y borran los archivos
// que hayan alcanzado a subirse bajo esta entrega en vez de recibir la
// lista del cliente, para cubrir también el caso en que la conexión se
// cortó antes de que el navegador pudiera avisar cuáles subió.
export async function cancelarEntrega(entregaId: string): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: archivos } = await supabase.storage
      .from("archivos-entrega")
      .list(entregaId);

    if (archivos && archivos.length > 0) {
      await supabase.storage
        .from("archivos-entrega")
        .remove(archivos.map((a) => `${entregaId}/${a.name}`));
    }
  } catch (err) {
    console.error("No se pudieron limpiar los archivos de la entrega:", err);
  }

  await borrarEntregaDeLimpieza(entregaId);
}

export async function presentarExamen(
  actividadId: string,
  cursoId: string,
  _estadoPrevio: EstadoExamen,
  formData: FormData
): Promise<EstadoExamen> {
  // Mismo motivo que crearEntrega/confirmarArchivosEntrega: protege contra una excepción real (no
  // un error esperado que Supabase regresa con calma, sino algo que
  // revienta a medio camino — timeout, conexión reseteada), que sin esto
  // se saltaba todo el manejo de abajo y tronaba la pantalla completa vía
  // error.tsx. Es más delicado aquí que en una tarea: `entregas` tiene un
  // unique(actividad_id, estudiante_id), así que si la excepción revienta
  // después de crear la fila pero antes de guardar las respuestas, un
  // reintento choca con "Ya presentaste este examen" sin que el
  // estudiante haya contestado nada — sin salida visible.
  let entregaId: string | null = null;
  let respuestasGuardadas = false;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
    }

    const respuestas: { pregunta_id: string; respuesta_seleccionada: string }[] =
      [];
    for (const [nombre, valor] of formData.entries()) {
      if (nombre.startsWith("respuesta-") && typeof valor === "string" && valor) {
        respuestas.push({
          pregunta_id: nombre.slice("respuesta-".length),
          respuesta_seleccionada: valor,
        });
      }
    }

    if (respuestas.length === 0) {
      return { error: "Responde al menos una pregunta." };
    }

    const { data: entrega, error: errorInsert } = await supabase
      .from("entregas")
      .insert({
        actividad_id: actividadId,
        estudiante_id: user.id,
      })
      .select("id")
      .single();

    if (errorInsert || !entrega) {
      if (errorInsert?.code === "23505") {
        return { error: "Ya presentaste este examen." };
      }
      return {
        error:
          errorInsert?.message ??
          "No se pudo registrar tu examen. Verifica que siga abierto.",
      };
    }
    entregaId = entrega.id;

    const { error: errorRespuestas } = await supabase
      .from("respuestas_examen")
      .insert(
        respuestas.map((r) => ({
          entrega_id: entrega.id,
          pregunta_id: r.pregunta_id,
          respuesta_seleccionada: r.respuesta_seleccionada,
        }))
      );

    if (errorRespuestas) {
      // Igual que en entregarTarea: el cliente normal del estudiante no
      // tiene (ni ha tenido nunca) permiso de delete sobre `entregas` —
      // este .delete() se veía bien pero fallaba en silencio, dejando la
      // entrega huérfana sin ninguna respuesta guardada y bloqueando
      // cualquier reintento futuro (mismo bug que ya encontramos y
      // corregimos en entregarTarea, aquí sin que nadie lo hubiera notado
      // todavía). Se usa la secret key nada más para este borrado puntual.
      await borrarEntregaDeLimpieza(entrega.id);
      return { error: errorRespuestas.message };
    }
    respuestasGuardadas = true;

    // Calificar: preguntas_examen (con `correcta`) solo es legible con la
    // secret key. Este resultado nunca llega al navegador; solo la nota final.
    const admin = createAdminClient();
    const { data: preguntas, error: errorPreguntas } = await admin
      .from("preguntas_examen")
      .select("id, correcta, puntos")
      .eq("actividad_id", actividadId);

    if (errorPreguntas || !preguntas || preguntas.length === 0) {
      return {
        error:
          "Tu examen se registró, pero no se pudo calificar automáticamente. Avísale a tu docente.",
      };
    }

    const puntosTotales = preguntas.reduce(
      (suma, p) => suma + Number(p.puntos),
      0
    );
    const respuestasPorPregunta = new Map(
      respuestas.map((r) => [r.pregunta_id, r.respuesta_seleccionada])
    );
    const puntosObtenidos = preguntas.reduce((suma, p) => {
      const respuesta = respuestasPorPregunta.get(p.id);
      return respuesta === p.correcta ? suma + Number(p.puntos) : suma;
    }, 0);

    const notaSobreDiez =
      puntosTotales > 0 ? (puntosObtenidos / puntosTotales) * 10 : 0;
    const calificacionFinal = Math.round(notaSobreDiez * 100) / 100;

    const { error: errorEvaluacion } = await admin.from("evaluaciones").insert({
      entrega_id: entrega.id,
      calificacion_final: calificacionFinal,
      origen: "AUTO_EXAMEN",
    });

    if (errorEvaluacion) {
      return {
        error:
          "Tu examen se registró, pero no se pudo calificar automáticamente. Avísale a tu docente.",
      };
    }

    revalidatePath(`/estudiante/cursos/${cursoId}`);
    return { error: null };
  } catch (err) {
    console.error("Excepción inesperada en presentarExamen:", err);
    // Si la excepción reventó antes de guardar las respuestas, no queda
    // nada del estudiante que valga la pena conservar — se limpia la
    // entrega para que pueda reintentar en vez de chocar con "Ya
    // presentaste este examen" sin haber contestado nada. Si ya alcanzó a
    // guardar sus respuestas (la excepción reventó después, ej. al
    // calificar), se deja intacta a propósito — es preferible un examen
    // "registrado, pendiente de calificar a mano" a borrar respuestas
    // reales ya contestadas.
    if (entregaId && !respuestasGuardadas) {
      await borrarEntregaDeLimpieza(entregaId);
    }
    return {
      error: "No se pudo registrar tu examen. Intenta de nuevo en un momento.",
    };
  }
}

export type PreguntaRevisada = {
  enunciado: string;
  opciones: string[];
  correcta: string;
  seleccionada: string | null;
  puntos: number;
};

export type EstadoRevisionExamen = {
  error: string | null;
  preguntas: PreguntaRevisada[] | null;
};

// preguntas_examen.correcta solo es legible con la secret key (sin ninguna
// policy, mismo patrón que en presentarExamen) — aquí se usa nada más
// después de confirmar con el cliente normal que la entrega es del
// estudiante que pregunta y que ya está calificada; nunca se expone la
// respuesta correcta de un examen todavía abierto ni de la entrega de otro
// estudiante.
export async function obtenerRevisionExamen(
  entregaId: string
): Promise<EstadoRevisionExamen> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Tu sesión expiró. Vuelve a iniciar sesión.", preguntas: null };
    }

    const { data: entrega } = await supabase
      .from("entregas")
      .select("id, actividad_id, evaluaciones(id)")
      .eq("id", entregaId)
      .eq("estudiante_id", user.id)
      .maybeSingle();

    if (!entrega) {
      return { error: "No tienes acceso a este examen.", preguntas: null };
    }
    if (!entrega.evaluaciones) {
      return { error: "Este examen todavía no tiene calificación.", preguntas: null };
    }

    // Las respuestas del estudiante sí tienen policy de lectura propia
    // (respuestas_select con es_dueno_de_entrega) — no hace falta la
    // secret key para esta parte.
    const { data: respuestas } = await supabase
      .from("respuestas_examen")
      .select("pregunta_id, respuesta_seleccionada")
      .eq("entrega_id", entregaId);

    const respuestaPorPregunta = new Map(
      (respuestas ?? []).map((r) => [r.pregunta_id, r.respuesta_seleccionada])
    );

    const admin = createAdminClient();
    const { data: preguntas, error: errorPreguntas } = await admin
      .from("preguntas_examen")
      .select("id, enunciado, opciones, correcta, puntos")
      .eq("actividad_id", entrega.actividad_id)
      .order("orden", { ascending: true });

    if (errorPreguntas || !preguntas) {
      return {
        error: "No se pudo cargar la revisión. Intenta de nuevo.",
        preguntas: null,
      };
    }

    return {
      error: null,
      preguntas: preguntas.map((p) => ({
        enunciado: p.enunciado,
        opciones: p.opciones,
        correcta: p.correcta,
        seleccionada: respuestaPorPregunta.get(p.id) ?? null,
        puntos: p.puntos,
      })),
    };
  } catch (err) {
    console.error("Excepción inesperada en obtenerRevisionExamen:", err);
    return {
      error: "No se pudo cargar la revisión. Intenta de nuevo en un momento.",
      preguntas: null,
    };
  }
}
