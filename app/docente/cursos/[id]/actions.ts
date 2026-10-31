"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nombreArchivoSeguro } from "@/lib/nombre-archivo";
import { duplicarActividad, type ActividadOrigen } from "@/lib/duplicar-actividad";
import { validarPreguntas } from "@/lib/preguntas-examen";

export type EstadoActividad = { error: string | null };
export type EstadoConfiguracion = { error: string | null };

// Ya no hay una sola pantalla /docente/cursos/[id] con todo junto — son
// pestañas en rutas separadas (resumen, tareas, examenes, asistencia,
// anuncios, estudiantes), cada una mostrando el badge de "pendientes" en la
// franja que ven las demás. Por eso cualquier cambio revalida todas juntas en
// vez de solo la ruta donde ocurrió la acción — es la única forma de que
// ese badge no se quede desactualizado en las pestañas que no se visitaron.
function revalidarPestanasCurso(cursoId: string) {
  revalidatePath(`/docente/cursos/${cursoId}`);
  revalidatePath(`/docente/cursos/${cursoId}/tareas`);
  revalidatePath(`/docente/cursos/${cursoId}/examenes`);
  revalidatePath(`/docente/cursos/${cursoId}/asistencia`);
  revalidatePath(`/docente/cursos/${cursoId}/anuncios`);
  revalidatePath(`/docente/cursos/${cursoId}/estudiantes`);
  revalidatePath(`/docente/cursos/${cursoId}/calificaciones`);
}

export async function actualizarConfiguracionCurso(
  cursoId: string,
  _estadoPrevio: EstadoConfiguracion,
  formData: FormData
): Promise<EstadoConfiguracion> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const examenes = Number(formData.get("porcentaje_examenes"));
  const tareas = Number(formData.get("porcentaje_tareas"));
  const asistencia = Number(formData.get("porcentaje_asistencia"));

  if (
    !Number.isInteger(examenes) ||
    !Number.isInteger(tareas) ||
    !Number.isInteger(asistencia) ||
    examenes < 0 ||
    tareas < 0 ||
    asistencia < 0
  ) {
    return { error: "Los porcentajes deben ser números enteros no negativos." };
  }

  if (examenes + tareas + asistencia !== 100) {
    return { error: "Los tres porcentajes deben sumar exactamente 100." };
  }

  // RLS (cursos_update_docente) restringe esto al docente dueño del curso.
  const { error } = await supabase
    .from("cursos")
    .update({
      porcentaje_examenes: examenes,
      porcentaje_tareas: tareas,
      porcentaje_asistencia: asistencia,
    })
    .eq("id", cursoId);

  if (error) {
    return { error: error.message };
  }

  revalidarPestanasCurso(cursoId);
  return { error: null };
}

const TIPOS_PERMITIDOS = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
];
const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

export async function crearActividad(
  cursoId: string,
  _estadoPrevio: EstadoActividad,
  formData: FormData
): Promise<EstadoActividad> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const titulo = String(formData.get("titulo") ?? "").trim();
  const instrucciones = String(formData.get("instrucciones") ?? "").trim();
  const fechaApertura = String(formData.get("fecha_apertura") ?? "").trim();
  const fechaCierre = String(formData.get("fecha_cierre") ?? "").trim();
  const archivo = formData.get("archivo");

  if (!titulo || !fechaCierre) {
    return {
      error: "Título y fecha de cierre son obligatorios.",
    };
  }

  const tieneArchivo = archivo instanceof File && archivo.size > 0;
  const archivoFile = tieneArchivo ? (archivo as File) : null;

  if (archivoFile) {
    if (!TIPOS_PERMITIDOS.includes(archivoFile.type)) {
      return { error: "Formato no permitido. Usa PDF, DOCX, JPG, PNG o HEIC." };
    }
    if (archivoFile.size > TAMANO_MAXIMO_BYTES) {
      return { error: "El archivo supera el máximo de 10 MB." };
    }
  }

  const { data: actividad, error: errorInsert } = await supabase
    .from("actividades")
    .insert({
      curso_id: cursoId,
      titulo,
      tipo: "TAREA",
      instrucciones: instrucciones || null,
      fecha_apertura: fechaApertura || null,
      fecha_cierre: fechaCierre,
    })
    .select("id")
    .single();

  if (errorInsert || !actividad) {
    return {
      error: errorInsert?.message ?? "No se pudo crear la actividad.",
    };
  }

  if (archivoFile) {
    // actividad.id (uuid) como carpeta ya evita colisiones; el nombre en sí
    // necesita sanearse porque Supabase Storage rechaza ciertos caracteres
    // (espacios, acentos, paréntesis) con "Invalid key".
    const storagePath = `${cursoId}/${actividad.id}/${nombreArchivoSeguro(archivoFile.name)}`;

    const { error: errorSubida } = await supabase.storage
      .from("materiales-actividades")
      .upload(storagePath, archivoFile, { contentType: archivoFile.type });

    if (errorSubida) {
      console.error("Error al subir material de actividad:", errorSubida);
      await supabase.from("actividades").delete().eq("id", actividad.id);
      return { error: "No se pudo subir el archivo. Intenta de nuevo." };
    }

    const { error: errorMaterial } = await supabase
      .from("materiales_actividad")
      .insert({
        actividad_id: actividad.id,
        nombre_archivo: archivoFile.name,
        storage_path: storagePath,
        tamano_bytes: archivoFile.size,
      });

    if (errorMaterial) {
      await supabase.storage
        .from("materiales-actividades")
        .remove([storagePath]);
      await supabase.from("actividades").delete().eq("id", actividad.id);
      return { error: errorMaterial.message };
    }
  }

  revalidarPestanasCurso(cursoId);
  return { error: null };
}

export async function editarActividad(
  cursoId: string,
  actividadId: string,
  _estadoPrevio: EstadoActividad,
  formData: FormData
): Promise<EstadoActividad> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const titulo = String(formData.get("titulo") ?? "").trim();
  const instrucciones = String(formData.get("instrucciones") ?? "").trim();
  const fechaApertura = String(formData.get("fecha_apertura") ?? "").trim();
  const fechaCierre = String(formData.get("fecha_cierre") ?? "").trim();
  const archivo = formData.get("archivo");
  const quitarMaterial = formData.get("quitar_material") === "on";

  if (!titulo || !fechaCierre) {
    return {
      error: "Título y fecha de cierre son obligatorios.",
    };
  }

  const tieneArchivoNuevo = archivo instanceof File && archivo.size > 0;
  const archivoFile = tieneArchivoNuevo ? (archivo as File) : null;

  if (archivoFile) {
    if (!TIPOS_PERMITIDOS.includes(archivoFile.type)) {
      return { error: "Formato no permitido. Usa PDF, DOCX, JPG, PNG o HEIC." };
    }
    if (archivoFile.size > TAMANO_MAXIMO_BYTES) {
      return { error: "El archivo supera el máximo de 10 MB." };
    }
  }

  // RLS (actividades_update_docente) ya restringe esto al docente dueño del
  // curso, incluso si la actividad ya tiene entregas.
  const { error: errorUpdate } = await supabase
    .from("actividades")
    .update({
      titulo,
      instrucciones: instrucciones || null,
      fecha_apertura: fechaApertura || null,
      fecha_cierre: fechaCierre,
    })
    .eq("id", actividadId);

  if (errorUpdate) {
    return { error: errorUpdate.message };
  }

  if (archivoFile || quitarMaterial) {
    const { data: materialesActuales } = await supabase
      .from("materiales_actividad")
      .select("id, storage_path")
      .eq("actividad_id", actividadId);

    if (materialesActuales && materialesActuales.length > 0) {
      await supabase.storage
        .from("materiales-actividades")
        .remove(materialesActuales.map((m) => m.storage_path));
      await supabase
        .from("materiales_actividad")
        .delete()
        .in(
          "id",
          materialesActuales.map((m) => m.id)
        );
    }

    if (archivoFile) {
      const storagePath = `${cursoId}/${actividadId}/${nombreArchivoSeguro(archivoFile.name)}`;

      const { error: errorSubida } = await supabase.storage
        .from("materiales-actividades")
        .upload(storagePath, archivoFile, { contentType: archivoFile.type });

      if (errorSubida) {
        console.error("Error al subir material de actividad:", errorSubida);
        return { error: "No se pudo subir el archivo. Intenta de nuevo." };
      }

      const { error: errorMaterial } = await supabase
        .from("materiales_actividad")
        .insert({
          actividad_id: actividadId,
          nombre_archivo: archivoFile.name,
          storage_path: storagePath,
          tamano_bytes: archivoFile.size,
        });

      if (errorMaterial) {
        await supabase.storage
          .from("materiales-actividades")
          .remove([storagePath]);
        return { error: errorMaterial.message };
      }
    }
  }

  revalidarPestanasCurso(cursoId);
  return { error: null };
}

export async function alternarBloqueo(
  cursoId: string,
  actividadId: string,
  nuevoValor: boolean,
  _formData: FormData
) {
  const supabase = await createClient();

  await supabase
    .from("actividades")
    .update({ bloqueado_manual: nuevoValor })
    .eq("id", actividadId);

  revalidarPestanasCurso(cursoId);
}

// Oculta/publica: a diferencia de bloqueado_manual (que bloquea entregas de
// algo que el estudiante sigue viendo), esto controla si la actividad existe
// o no para el estudiante — mismo patrón que alternarBloqueo, reforzado a
// nivel de base de datos (ver migración 20260911120000) para que "oculta"
// también bloquee lectura directa de preguntas/material, no solo el filtro
// en esta página.
export async function alternarVisibilidad(
  cursoId: string,
  actividadId: string,
  nuevoValor: boolean,
  _formData: FormData
) {
  const supabase = await createClient();

  await supabase
    .from("actividades")
    .update({ visible_estudiantes: nuevoValor })
    .eq("id", actividadId);

  revalidarPestanasCurso(cursoId);
}

export async function crearExamen(
  cursoId: string,
  tipo: "TAREA" | "EXAMEN",
  _estadoPrevio: EstadoActividad,
  formData: FormData
): Promise<EstadoActividad> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  // Verifica con el cliente normal (RLS) que quien llama es el docente dueño
  // del curso. Solo después de esto se usa la secret key, y únicamente para
  // tocar preguntas_examen (que no tiene policies para 'authenticated').
  const { data: curso } = await supabase
    .from("cursos")
    .select("id")
    .eq("id", cursoId)
    .eq("docente_id", user.id)
    .maybeSingle();

  if (!curso) {
    return { error: "No tienes permiso sobre este curso." };
  }

  const titulo = String(formData.get("titulo") ?? "").trim();
  const instrucciones = String(formData.get("instrucciones") ?? "").trim();
  const fechaApertura = String(formData.get("fecha_apertura") ?? "").trim();
  const fechaCierre = String(formData.get("fecha_cierre") ?? "").trim();
  const preguntasJson = String(formData.get("preguntas") ?? "");
  // Solo el formulario de examen (no el de cuestionario/tarea) manda este
  // campo — ver formulario-crear-examen.tsx. Si no viene, intentos_permitidos
  // se queda en 1 (el default de la columna), igual que una tarea normal.
  const intentosPermitidos = formData.get("dos_intentos") === "on" ? 2 : 1;
  const ordenAleatorio = formData.get("orden_aleatorio") === "on";
  const textoLimite = String(formData.get("limite_minutos") ?? "").trim();
  const limiteMinutos = textoLimite === "" ? null : Number(textoLimite);
  if (limiteMinutos !== null && (!Number.isInteger(limiteMinutos) || limiteMinutos < 1 || limiteMinutos > 600)) {
    return { error: "El límite de tiempo debe ser un número entero de minutos, de 1 a 600." };
  }

  if (!titulo || !fechaCierre) {
    return {
      error: "Título y fecha de cierre son obligatorios.",
    };
  }

  let entradaPreguntas: unknown;
  try {
    entradaPreguntas = JSON.parse(preguntasJson);
  } catch {
    return { error: "No se pudieron leer las preguntas." };
  }

  const validadas = validarPreguntas(entradaPreguntas);
  if ("error" in validadas) return validadas;
  const preguntasNormalizadas = validadas.preguntas;

  const { data: actividad, error: errorInsert } = await supabase
    .from("actividades")
    .insert({
      curso_id: cursoId,
      titulo,
      tipo,
      instrucciones: instrucciones || null,
      fecha_apertura: fechaApertura || null,
      fecha_cierre: fechaCierre,
      intentos_permitidos: intentosPermitidos,
      orden_aleatorio: ordenAleatorio,
      limite_minutos: limiteMinutos,
    })
    .select("id")
    .single();

  if (errorInsert || !actividad) {
    return {
      error:
        errorInsert?.message ??
        (tipo === "TAREA"
          ? "No se pudo crear el cuestionario."
          : "No se pudo crear el examen."),
    };
  }

  const admin = createAdminClient();
  const { error: errorPreguntas } = await admin
    .from("preguntas_examen")
    .insert(
      preguntasNormalizadas.map((p, i) => ({
        actividad_id: actividad.id,
        tipo: p.tipo,
        enunciado: p.enunciado,
        opciones: p.opciones,
        correcta: p.correcta,
        puntos: p.puntos,
        orden: i,
      }))
    );

  if (errorPreguntas) {
    await supabase.from("actividades").delete().eq("id", actividad.id);
    return { error: errorPreguntas.message };
  }

  revalidarPestanasCurso(cursoId);
  return { error: null };
}

export async function editarExamen(
  cursoId: string,
  actividadId: string,
  _estadoPrevio: EstadoActividad,
  formData: FormData
): Promise<EstadoActividad> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  // Verifica, vía el propio dato de la actividad (no el parámetro recibido),
  // que quien llama es el docente dueño del curso al que pertenece. Solo
  // después de esto se usa la secret key para tocar preguntas_examen.
  const { data: actividadActual } = (await supabase
    .from("actividades")
    .select("curso_id, cursos(docente_id)")
    .eq("id", actividadId)
    .single()) as {
    data: { curso_id: string; cursos: { docente_id: string } | null } | null;
  };

  if (!actividadActual || actividadActual.cursos?.docente_id !== user.id) {
    return { error: "No tienes permiso sobre esta actividad." };
  }

  const titulo = String(formData.get("titulo") ?? "").trim();
  const instrucciones = String(formData.get("instrucciones") ?? "").trim();
  const fechaApertura = String(formData.get("fecha_apertura") ?? "").trim();
  const fechaCierre = String(formData.get("fecha_cierre") ?? "").trim();
  const preguntasJson = String(formData.get("preguntas") ?? "");
  // Mismo criterio que crearExamen: el formulario de cuestionario no manda
  // este campo, así que editar un cuestionario siempre lo deja en 1.
  const intentosPermitidos = formData.get("dos_intentos") === "on" ? 2 : 1;
  const ordenAleatorio = formData.get("orden_aleatorio") === "on";
  const textoLimite = String(formData.get("limite_minutos") ?? "").trim();
  const limiteMinutos = textoLimite === "" ? null : Number(textoLimite);
  if (limiteMinutos !== null && (!Number.isInteger(limiteMinutos) || limiteMinutos < 1 || limiteMinutos > 600)) {
    return { error: "El límite de tiempo debe ser un número entero de minutos, de 1 a 600." };
  }

  if (!titulo || !fechaCierre) {
    return {
      error: "Título y fecha de cierre son obligatorios.",
    };
  }

  let entradaPreguntas: unknown;
  try {
    entradaPreguntas = JSON.parse(preguntasJson);
  } catch {
    return { error: "No se pudieron leer las preguntas." };
  }

  const validadas = validarPreguntas(entradaPreguntas);
  if ("error" in validadas) return validadas;
  const preguntasNormalizadas = validadas.preguntas;

  const { error: errorUpdate } = await supabase
    .from("actividades")
    .update({
      titulo,
      instrucciones: instrucciones || null,
      fecha_apertura: fechaApertura || null,
      fecha_cierre: fechaCierre,
      intentos_permitidos: intentosPermitidos,
      orden_aleatorio: ordenAleatorio,
      limite_minutos: limiteMinutos,
    })
    .eq("id", actividadId);

  if (errorUpdate) {
    return { error: errorUpdate.message };
  }

  // Reemplaza el set completo de preguntas solo si de verdad cambió algo:
  // más simple y robusto que diferenciar altas/bajas/modificaciones
  // individualmente, pero sin destruir respuestas_examen (por el cascade
  // hacia preguntas_examen) cuando la edición no tocó las preguntas —
  // p. ej. si el docente solo cambió la ponderación.
  const admin = createAdminClient();
  const { data: preguntasActuales } = await admin
    .from("preguntas_examen")
    .select("tipo, enunciado, opciones, correcta, puntos")
    .eq("actividad_id", actividadId)
    .order("orden", { ascending: true });

  const sinCambios =
    (preguntasActuales ?? []).length === preguntasNormalizadas.length &&
    (preguntasActuales ?? []).every((actual, i) => {
      const nueva = preguntasNormalizadas[i];
      return (
        (actual.tipo ?? "OPCION_MULTIPLE") === nueva.tipo &&
        actual.enunciado === nueva.enunciado &&
        actual.correcta === nueva.correcta &&
        actual.puntos === nueva.puntos &&
        JSON.stringify(actual.opciones) === JSON.stringify(nueva.opciones)
      );
    });

  if (!sinCambios) {
    const { error: errorBorrar } = await admin
      .from("preguntas_examen")
      .delete()
      .eq("actividad_id", actividadId);

    if (errorBorrar) {
      return { error: errorBorrar.message };
    }

    const { error: errorPreguntas } = await admin
      .from("preguntas_examen")
      .insert(
        preguntasNormalizadas.map((p, i) => ({
          actividad_id: actividadId,
          tipo: p.tipo,
          enunciado: p.enunciado,
          opciones: p.opciones,
          correcta: p.correcta,
          puntos: p.puntos,
          orden: i,
        }))
      );

    if (errorPreguntas) {
      return { error: errorPreguntas.message };
    }
  }

  revalidarPestanasCurso(cursoId);
  return { error: null };
}

// Copia una tarea, cuestionario o examen a otro curso del mismo docente —
// mismo título/instrucciones/preguntas/material, pero fechas nuevas
// (obligatorias, nunca las de origen: casi siempre ya estarían vencidas) y
// siempre oculta al crearse, para que el docente la revise/publique cuando
// esté lista, igual que si la hubiera creado desde cero. Las entregas y
// evaluaciones nunca se copian, por supuesto — son del estudiante, no de la
// actividad.
export async function copiarActividad(
  actividadId: string,
  cursoOrigenId: string,
  _estadoPrevio: EstadoActividad,
  formData: FormData
): Promise<EstadoActividad> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const cursoDestinoId = String(formData.get("curso_destino_id") ?? "").trim();
  const fechaApertura = String(formData.get("fecha_apertura") ?? "").trim();
  const fechaCierre = String(formData.get("fecha_cierre") ?? "").trim();

  if (!cursoDestinoId || !fechaCierre) {
    return { error: "Elige un curso destino y una fecha de cierre." };
  }

  // El <select> del formulario solo lista cursos propios, pero un request
  // directo podría mandar cualquier id — se verifica aparte en vez de
  // confiar en lo que llegó.
  const { data: cursoDestino } = await supabase
    .from("cursos")
    .select("id")
    .eq("id", cursoDestinoId)
    .eq("docente_id", user.id)
    .maybeSingle();

  if (!cursoDestino) {
    return { error: "No tienes permiso sobre el curso destino." };
  }

  // Verifica dueño de la actividad origen vía su propio curso, mismo patrón
  // que editarExamen, y de paso trae lo necesario para duplicarla.
  const { data: actividadOrigen } = (await supabase
    .from("actividades")
    .select(
      "id, titulo, tipo, instrucciones, intentos_permitidos, orden_aleatorio, limite_minutos, cursos(docente_id)"
    )
    .eq("id", actividadId)
    .single()) as {
    data: (ActividadOrigen & { cursos: { docente_id: string } | null }) | null;
  };

  if (!actividadOrigen || actividadOrigen.cursos?.docente_id !== user.id) {
    return { error: "No tienes permiso sobre esta actividad." };
  }

  const resultado = await duplicarActividad(supabase, actividadOrigen, cursoDestinoId, {
    fecha_apertura: fechaApertura || null,
    fecha_cierre: fechaCierre,
  });
  if (resultado.error) return resultado;

  revalidarPestanasCurso(cursoOrigenId);
  revalidarPestanasCurso(cursoDestinoId);
  return { error: null };
}

// Borra la actividad con todo lo que cuelga de ella. Las filas (entregas,
// archivos_entrega, evaluaciones, respuestas, materiales, preguntas) se van
// por `on delete cascade`, pero los objetos de Storage no dependen de
// ninguna FK y hay que quitarlos aparte — antes solo se quitaba el material
// y los archivos que entregaron los estudiantes se quedaban en el bucket sin
// ninguna fila que los apuntara (ver "Reglas de negocio" en CLAUDE.md).
//
// Storage va antes que la fila: storage_entregas_delete_docente valida
// es_docente_de_entrega(entrega_id), que necesita que la entrega siga viva —
// borrando primero la actividad, el remove() "tendría éxito" con 0 objetos
// borrados (mismo motivo que eliminarEntrega y eliminarEstudianteDeCurso).
export async function eliminarActividad(
  cursoId: string,
  actividadId: string,
  _formData: FormData
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
    }

    const { data: actividad } = (await supabase
      .from("actividades")
      .select(
        "id, cursos(docente_id), materiales_actividad(storage_path), entregas(archivos_entrega(storage_path))"
      )
      .eq("id", actividadId)
      .eq("curso_id", cursoId)
      .maybeSingle()) as {
      data: {
        id: string;
        cursos: { docente_id: string } | null;
        materiales_actividad: { storage_path: string }[];
        entregas: { archivos_entrega: { storage_path: string }[] }[];
      } | null;
    };

    if (!actividad || actividad.cursos?.docente_id !== user.id) {
      return { error: "No tienes permiso sobre esta actividad." };
    }

    const rutasEntregas = actividad.entregas.flatMap((e) =>
      e.archivos_entrega.map((a) => a.storage_path)
    );
    const rutasMateriales = actividad.materiales_actividad.map(
      (m) => m.storage_path
    );

    if (rutasEntregas.length > 0) {
      const { error } = await supabase.storage
        .from("archivos-entrega")
        .remove(rutasEntregas);
      if (error) {
        console.error("No se pudieron borrar los archivos de las entregas:", error);
        return { error: "No se pudieron borrar los archivos de las entregas. Intenta de nuevo." };
      }
    }

    if (rutasMateriales.length > 0) {
      const { error } = await supabase.storage
        .from("materiales-actividades")
        .remove(rutasMateriales);
      if (error) {
        console.error("No se pudo borrar el material de apoyo:", error);
        return { error: "No se pudo borrar el material de apoyo. Intenta de nuevo." };
      }
    }

    const { data: borradas, error: errorDelete } = await supabase
      .from("actividades")
      .delete()
      .eq("id", actividadId)
      .select("id");

    if (errorDelete || !borradas || borradas.length === 0) {
      console.error("No se pudo eliminar la actividad:", errorDelete);
      return { error: "No se pudo eliminar la actividad. Intenta de nuevo." };
    }

    revalidarPestanasCurso(cursoId);
    return { error: null };
  } catch (err) {
    console.error("Excepción inesperada en eliminarActividad:", err);
    return { error: "No se pudo eliminar la actividad. Intenta de nuevo en un momento." };
  }
}

export async function eliminarEstudianteDeCurso(
  cursoId: string,
  estudianteId: string,
  _formData: FormData
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  // Confirma con el cliente normal (RLS) que quien llama es el docente
  // dueño del curso, antes de tocar nada — el RPC de abajo repite este
  // mismo chequeo (para no depender solo de esto), pero hacerlo aquí
  // primero da un mensaje de error temprano y evita listar/borrar archivos
  // de Storage si ni siquiera tiene permiso sobre el curso.
  const { data: curso } = await supabase
    .from("cursos")
    .select("id")
    .eq("id", cursoId)
    .eq("docente_id", user.id)
    .maybeSingle();

  if (!curso) {
    return { error: "No tienes permiso sobre este curso." };
  }

  // Junta las rutas de Storage de las entregas de este estudiante en este
  // curso ANTES de tocar nada, porque en cuanto corra la fase 2 (más abajo)
  // ya no va a existir la fila de archivos_entrega que las apunta. Solo
  // lee, no borra nada todavía.
  const { data: entregas } = await supabase
    .from("entregas")
    .select("id, actividades!inner(curso_id), archivos_entrega(storage_path)")
    .eq("estudiante_id", estudianteId)
    .eq("actividades.curso_id", cursoId);

  const storagePaths = (entregas ?? []).flatMap(
    (e) => e.archivos_entrega?.map((a) => a.storage_path) ?? []
  );

  // Fase 1 (transacción atómica): evaluaciones, respuestas_examen,
  // archivos_entrega. Deliberadamente NO borra `entregas` todavía — la
  // policy de Storage (storage_entregas_delete_docente) necesita que esa
  // fila siga existiendo para autorizar el storage.remove() de abajo. Ver
  // el comentario en la migración
  // 20260901120000_add_eliminar_estudiante_de_curso.sql: con un solo RPC
  // que también borrara `entregas`, el storage.remove() posterior fallaba
  // en silencio (0 archivos borrados, sin error) porque la policy ya no
  // encontraba la fila para verificar al dueño — confirmado en vivo.
  const { error: errorFase1 } = await supabase.rpc(
    "eliminar_estudiante_de_curso_datos",
    { p_curso_id: cursoId, p_estudiante_id: estudianteId }
  );

  if (errorFase1) {
    console.error("Error al eliminar datos del estudiante (fase 1):", errorFase1);
    return { error: "No se pudo eliminar al estudiante. Intenta de nuevo." };
  }

  // Borrado de Storage: corre con la fila `entregas` todavía viva (la fase
  // 2, que la borra, todavía no se ha llamado). No fatal si falla — mismo
  // razonamiento de siempre: es preferible terminar de quitar al
  // estudiante del curso a dejarlo a medias por un archivo que de todas
  // formas ya no tiene ninguna fila que lo apunte.
  if (storagePaths.length > 0) {
    const { error: errorStorage } = await supabase.storage
      .from("archivos-entrega")
      .remove(storagePaths);
    if (errorStorage) {
      console.error(
        "Error al borrar archivos de Storage al eliminar estudiante:",
        errorStorage
      );
    }
  }

  // Fase 2 (transacción atómica): entregas, inscripciones. Va al final,
  // después del intento de borrado de Storage (exitoso o no).
  const { error: errorFase2 } = await supabase.rpc(
    "eliminar_estudiante_de_curso_final",
    { p_curso_id: cursoId, p_estudiante_id: estudianteId }
  );

  if (errorFase2) {
    console.error("Error al eliminar estudiante del curso (fase 2):", errorFase2);
    return {
      error:
        "Se eliminaron sus calificaciones y archivos, pero no se pudo completar el resto. Intenta de nuevo.",
    };
  }

  // Sus registros de asistencia en este curso. Ninguna de las dos fases los
  // tocaba, y se quedaban sueltos (un registro de alguien ya no inscrito).
  // Va después de la fase 2 a propósito y no es fatal: si fallara antes, el
  // estudiante podría quedar inscrito sin su asistencia; si falla aquí, lo
  // peor es un registro suelto que no afecta ningún cálculo (el % de
  // asistencia se calcula solo desde la inscripción vigente). Usa la policy
  // asistencias_delete_docente (migración 20260828120000), sin migración nueva.
  const { data: sesiones } = await supabase
    .from("sesiones_asistencia")
    .select("id")
    .eq("curso_id", cursoId);
  const sesionIds = (sesiones ?? []).map((s) => s.id);
  if (sesionIds.length > 0) {
    const { error: errorAsistencia } = await supabase
      .from("asistencias")
      .delete()
      .eq("estudiante_id", estudianteId)
      .in("sesion_id", sesionIds);
    if (errorAsistencia) {
      console.error(
        "No se pudieron borrar los registros de asistencia del estudiante eliminado:",
        errorAsistencia
      );
    }
  }

  revalidatePath("/docente");
  revalidarPestanasCurso(cursoId);
  return { error: null };
}

export async function eliminarSesionAsistencia(
  cursoId: string,
  sesionId: string,
  _formData: FormData
) {
  const supabase = await createClient();

  // RLS (sesiones_asistencia_delete_docente) restringe esto al docente dueño
  // del curso; el on delete cascade de asistencias.sesion_id se encarga de
  // los registros de cada estudiante para esa fecha (a su vez permitido por
  // asistencias_delete_docente, que evalúa RLS igual que un delete directo).
  await supabase.from("sesiones_asistencia").delete().eq("id", sesionId);

  revalidarPestanasCurso(cursoId);
}

// Archivar es solo organización del docente: el curso sale de su lista
// principal y pasa a "Cursos archivados", pero sigue completo y editable.
// Lo único que cambia fuera de eso es que ya no admite inscripciones
// nuevas (inscribirse_a_curso, migración 20261101120000).
export async function cambiarArchivadoCurso(
  cursoId: string,
  archivar: boolean,
  _formData: FormData
) {
  const supabase = await createClient();

  // RLS (cursos_update_docente) restringe esto al docente dueño del curso.
  await supabase
    .from("cursos")
    .update({ archivado_at: archivar ? new Date().toISOString() : null })
    .eq("id", cursoId);

  revalidatePath("/docente");
  revalidarPestanasCurso(cursoId);
}

export type EstadoDuplicarCurso = { error: string | null; nuevoCursoId?: string };

// Curso nuevo para otro semestre/grupo a partir de uno existente: copia la
// ponderación y todas sus tareas, cuestionarios y exámenes (con preguntas y
// material), ocultas y con sus fechas originales para que el docente las
// ajuste y publique una por una. No copia estudiantes, entregas,
// asistencia ni anuncios — eso es de cada semestre.
export async function duplicarCurso(
  cursoOrigenId: string,
  _estadoPrevio: EstadoDuplicarCurso,
  formData: FormData
): Promise<EstadoDuplicarCurso> {
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

  const { data: origen } = await supabase
    .from("cursos")
    .select("porcentaje_tareas, porcentaje_examenes, porcentaje_asistencia")
    .eq("id", cursoOrigenId)
    .eq("docente_id", user.id)
    .single();

  if (!origen) {
    return { error: "No tienes permiso sobre este curso." };
  }

  const { data: nuevo, error: errorCurso } = await supabase
    .from("cursos")
    .insert({
      docente_id: user.id,
      nombre,
      grupo,
      periodo,
      clave_acceso: claveAcceso,
      ...origen,
    })
    .select("id")
    .single();

  if (errorCurso || !nuevo) {
    if (errorCurso?.code === "23505") {
      return { error: "Esa clave de acceso ya está en uso. Prueba con otra." };
    }
    return { error: errorCurso?.message ?? "No se pudo crear el curso." };
  }

  // En orden de creación, para que la copia quede en el mismo orden.
  const { data: actividades } = await supabase
    .from("actividades")
    .select(
      "id, titulo, tipo, instrucciones, intentos_permitidos, orden_aleatorio, limite_minutos, fecha_apertura, fecha_cierre"
    )
    .eq("curso_id", cursoOrigenId)
    .order("created_at", { ascending: true });

  for (const actividad of actividades ?? []) {
    const { error } = await duplicarActividad(supabase, actividad, nuevo.id, {
      fecha_apertura: actividad.fecha_apertura,
      fecha_cierre: actividad.fecha_cierre,
    });

    if (error) {
      // Todo o nada: se borra el curso a medias (sus actividades se van por
      // cascade) y los archivos de material que ya se habían copiado.
      const { data: materiales } = await supabase
        .from("materiales_actividad")
        .select("storage_path, actividades!inner(curso_id)")
        .eq("actividades.curso_id", nuevo.id);
      const rutas = (materiales ?? []).map((m) => m.storage_path);
      if (rutas.length > 0) {
        await supabase.storage.from("materiales-actividades").remove(rutas);
      }
      await supabase.from("cursos").delete().eq("id", nuevo.id);
      return { error: `No se pudo copiar "${actividad.titulo}": ${error}` };
    }
  }

  revalidatePath("/docente");
  return { error: null, nuevoCursoId: nuevo.id };
}
