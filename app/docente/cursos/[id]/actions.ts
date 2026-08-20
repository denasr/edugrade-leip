"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type EstadoActividad = { error: string | null };
export type EstadoConfiguracion = { error: string | null };

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

  revalidatePath(`/docente/cursos/${cursoId}`);
  return { error: null };
}

const TIPOS_PERMITIDOS = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
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
      return { error: "Formato no permitido. Usa PDF, DOCX, JPG o PNG." };
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
    const storagePath = `${cursoId}/${actividad.id}/${archivoFile.name}`;

    const { error: errorSubida } = await supabase.storage
      .from("materiales-actividades")
      .upload(storagePath, archivoFile, { contentType: archivoFile.type });

    if (errorSubida) {
      await supabase.from("actividades").delete().eq("id", actividad.id);
      return { error: `No se pudo subir el archivo: ${errorSubida.message}` };
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

  revalidatePath(`/docente/cursos/${cursoId}`);
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
      return { error: "Formato no permitido. Usa PDF, DOCX, JPG o PNG." };
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
      const storagePath = `${cursoId}/${actividadId}/${archivoFile.name}`;

      const { error: errorSubida } = await supabase.storage
        .from("materiales-actividades")
        .upload(storagePath, archivoFile, { contentType: archivoFile.type });

      if (errorSubida) {
        return {
          error: `No se pudo subir el archivo: ${errorSubida.message}`,
        };
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

  revalidatePath(`/docente/cursos/${cursoId}`);
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

  revalidatePath(`/docente/cursos/${cursoId}`);
}

type PreguntaEntrada = {
  enunciado: string;
  opciones: string[];
  correcta: string;
  puntos: number;
};

export async function crearExamen(
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

  if (!titulo || !fechaCierre) {
    return {
      error: "Título y fecha de cierre son obligatorios.",
    };
  }

  let preguntas: PreguntaEntrada[];
  try {
    preguntas = JSON.parse(preguntasJson);
  } catch {
    return { error: "No se pudieron leer las preguntas." };
  }

  if (!Array.isArray(preguntas) || preguntas.length === 0) {
    return { error: "Agrega al menos una pregunta." };
  }

  const preguntasNormalizadas = preguntas.map((p) => ({
    enunciado: String(p.enunciado ?? "").trim(),
    opciones: (p.opciones ?? []).map((o) => String(o).trim()),
    correcta: String(p.correcta ?? "").trim(),
    puntos: Number(p.puntos),
  }));

  for (const [i, p] of preguntasNormalizadas.entries()) {
    if (!p.enunciado) {
      return { error: `La pregunta ${i + 1} necesita un enunciado.` };
    }
    if (p.opciones.length !== 4 || p.opciones.some((o) => !o)) {
      return { error: `La pregunta ${i + 1} necesita 4 opciones no vacías.` };
    }
    if (!p.opciones.includes(p.correcta)) {
      return {
        error: `La pregunta ${i + 1} necesita marcar cuál opción es correcta.`,
      };
    }
    if (!Number.isFinite(p.puntos) || p.puntos <= 0) {
      return { error: `La pregunta ${i + 1} necesita puntos mayores a 0.` };
    }
  }

  const { data: actividad, error: errorInsert } = await supabase
    .from("actividades")
    .insert({
      curso_id: cursoId,
      titulo,
      tipo: "EXAMEN",
      instrucciones: instrucciones || null,
      fecha_apertura: fechaApertura || null,
      fecha_cierre: fechaCierre,
    })
    .select("id")
    .single();

  if (errorInsert || !actividad) {
    return {
      error: errorInsert?.message ?? "No se pudo crear el examen.",
    };
  }

  const admin = createAdminClient();
  const { error: errorPreguntas } = await admin
    .from("preguntas_examen")
    .insert(
      preguntasNormalizadas.map((p, i) => ({
        actividad_id: actividad.id,
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

  revalidatePath(`/docente/cursos/${cursoId}`);
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

  if (!titulo || !fechaCierre) {
    return {
      error: "Título y fecha de cierre son obligatorios.",
    };
  }

  let preguntas: PreguntaEntrada[];
  try {
    preguntas = JSON.parse(preguntasJson);
  } catch {
    return { error: "No se pudieron leer las preguntas." };
  }

  if (!Array.isArray(preguntas) || preguntas.length === 0) {
    return { error: "Agrega al menos una pregunta." };
  }

  const preguntasNormalizadas = preguntas.map((p) => ({
    enunciado: String(p.enunciado ?? "").trim(),
    opciones: (p.opciones ?? []).map((o) => String(o).trim()),
    correcta: String(p.correcta ?? "").trim(),
    puntos: Number(p.puntos),
  }));

  for (const [i, p] of preguntasNormalizadas.entries()) {
    if (!p.enunciado) {
      return { error: `La pregunta ${i + 1} necesita un enunciado.` };
    }
    if (p.opciones.length !== 4 || p.opciones.some((o) => !o)) {
      return { error: `La pregunta ${i + 1} necesita 4 opciones no vacías.` };
    }
    if (!p.opciones.includes(p.correcta)) {
      return {
        error: `La pregunta ${i + 1} necesita marcar cuál opción es correcta.`,
      };
    }
    if (!Number.isFinite(p.puntos) || p.puntos <= 0) {
      return { error: `La pregunta ${i + 1} necesita puntos mayores a 0.` };
    }
  }

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

  // Reemplaza el set completo de preguntas solo si de verdad cambió algo:
  // más simple y robusto que diferenciar altas/bajas/modificaciones
  // individualmente, pero sin destruir respuestas_examen (por el cascade
  // hacia preguntas_examen) cuando la edición no tocó las preguntas —
  // p. ej. si el docente solo cambió la ponderación.
  const admin = createAdminClient();
  const { data: preguntasActuales } = await admin
    .from("preguntas_examen")
    .select("enunciado, opciones, correcta, puntos")
    .eq("actividad_id", actividadId)
    .order("orden", { ascending: true });

  const sinCambios =
    (preguntasActuales ?? []).length === preguntasNormalizadas.length &&
    (preguntasActuales ?? []).every((actual, i) => {
      const nueva = preguntasNormalizadas[i];
      return (
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

  revalidatePath(`/docente/cursos/${cursoId}`);
  return { error: null };
}

export async function eliminarActividad(
  cursoId: string,
  actividadId: string,
  _formData: FormData
) {
  const supabase = await createClient();

  const { data: materiales } = await supabase
    .from("materiales_actividad")
    .select("storage_path")
    .eq("actividad_id", actividadId);

  if (materiales && materiales.length > 0) {
    await supabase.storage
      .from("materiales-actividades")
      .remove(materiales.map((m) => m.storage_path));
  }

  await supabase.from("actividades").delete().eq("id", actividadId);

  revalidatePath(`/docente/cursos/${cursoId}`);
}
