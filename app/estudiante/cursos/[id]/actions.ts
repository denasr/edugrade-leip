"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nombreArchivoSeguro } from "@/lib/nombre-archivo";

export type EstadoEntrega = { error: string | null };
export type EstadoExamen = { error: string | null };

const TIPOS_PERMITIDOS = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
];
const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;
const MAXIMO_ARCHIVOS = 10;
const TAMANO_MAXIMO_TOTAL_BYTES = 30 * 1024 * 1024;

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

export async function entregarTarea(
  actividadId: string,
  cursoId: string,
  _estadoPrevio: EstadoEntrega,
  formData: FormData
): Promise<EstadoEntrega> {
  // Todas las llamadas a Supabase de aquí abajo ya verifican su `error` de
  // respuesta (caso esperado: clave duplicada, RLS, etc.), pero ninguna
  // estaba protegida contra una excepción real (timeout, conexión
  // reseteada entre la función serverless y Supabase) — eso se saltaba
  // todos esos checks y tronaba toda la pantalla vía error.tsx. Con este
  // try/catch, ese caso también regresa un {error} amigable y la
  // estudiante se queda en la misma pantalla en vez de perderla.
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
    }

    const comentario = String(formData.get("comentario") ?? "").trim();
    const archivos = formData
      .getAll("archivos")
      .filter((a): a is File => a instanceof File && a.size > 0);

    if (archivos.length === 0) {
      return { error: "Adjunta al menos un archivo para entregar la tarea." };
    }
    if (archivos.length > MAXIMO_ARCHIVOS) {
      return { error: `Puedes adjuntar hasta ${MAXIMO_ARCHIVOS} archivos.` };
    }

    for (const archivo of archivos) {
      if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
        return {
          error: `"${archivo.name}" no es un formato permitido. Usa PDF, DOCX, JPG, PNG o HEIC.`,
        };
      }
      if (archivo.size > TAMANO_MAXIMO_BYTES) {
        return { error: `"${archivo.name}" supera el máximo de 10 MB.` };
      }
    }
    const tamanoTotal = archivos.reduce((suma, a) => suma + a.size, 0);
    if (tamanoTotal > TAMANO_MAXIMO_TOTAL_BYTES) {
      return {
        error: "El total de archivos supera el máximo de 30 MB entre todos.",
      };
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
        return { error: "Ya entregaste esta tarea." };
      }
      return {
        error:
          errorInsert?.message ??
          "No se pudo registrar la entrega. Verifica que la tarea siga abierta.",
      };
    }

    // entrega.id (uuid) como carpeta ya evita colisiones entre estudiantes;
    // el índice al frente evita que dos fotos con el mismo nombre de origen
    // (común en fotos de celular, ej. "IMG_1234.jpg" repetido) se pisen
    // entre sí dentro de la misma entrega. El nombre en sí necesita
    // sanearse porque Supabase Storage rechaza ciertos caracteres (espacios,
    // acentos, paréntesis) con "Invalid key".
    const subidas: { storagePath: string; archivo: File }[] = [];
    for (const [indice, archivo] of archivos.entries()) {
      const storagePath = `${entrega.id}/${indice}-${nombreArchivoSeguro(archivo.name)}`;
      const { error: errorSubida } = await supabase.storage
        .from("archivos-entrega")
        .upload(storagePath, archivo, { contentType: archivo.type });

      if (errorSubida) {
        console.error("Error al subir archivo de entrega:", errorSubida);
        // Todo o nada: se limpia lo que ya se alcanzó a subir en esta misma
        // entrega antes de cortar, para no dejar archivos huérfanos sin
        // ninguna fila que los apunte.
        if (subidas.length > 0) {
          await supabase.storage
            .from("archivos-entrega")
            .remove(subidas.map((s) => s.storagePath));
        }
        await borrarEntregaDeLimpieza(entrega.id);
        return { error: "No se pudo subir el archivo. Intenta de nuevo." };
      }
      subidas.push({ storagePath, archivo });
    }

    const { error: errorArchivo } = await supabase.from("archivos_entrega").insert(
      subidas.map(({ storagePath, archivo }) => ({
        entrega_id: entrega.id,
        nombre_archivo: archivo.name,
        storage_path: storagePath,
        tamano_bytes: archivo.size,
      }))
    );

    if (errorArchivo) {
      await supabase.storage
        .from("archivos-entrega")
        .remove(subidas.map((s) => s.storagePath));
      await borrarEntregaDeLimpieza(entrega.id);
      return { error: errorArchivo.message };
    }

    revalidatePath(`/estudiante/cursos/${cursoId}`);
    return { error: null };
  } catch (err) {
    console.error("Excepción inesperada en entregarTarea:", err);
    return {
      error: "No se pudo entregar la tarea. Intenta de nuevo en un momento.",
    };
  }
}

export async function presentarExamen(
  actividadId: string,
  cursoId: string,
  _estadoPrevio: EstadoExamen,
  formData: FormData
): Promise<EstadoExamen> {
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
    await supabase.from("entregas").delete().eq("id", entrega.id);
    return { error: errorRespuestas.message };
  }

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
}
