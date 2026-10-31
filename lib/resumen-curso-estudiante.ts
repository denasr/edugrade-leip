import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizarIntentosVencidos } from "@/lib/intentos-examen";
import { compararPorCierre, estadoActividad } from "@/lib/actividades";
import {
  calcularCalificacionFinal,
  calcularPorcentajeAsistencia,
  promedioCalificaciones,
  type ResultadoCalificacionFinal,
} from "@/lib/calificacion-final";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Todo lo que la vista de un curso del estudiante calcula sobre su propio
// desempeño: sus tareas y exámenes con su entrega, su asistencia y su
// calificación final. Lo consumen tanto /estudiante/cursos/[id] como el
// reporte en PDF (reporte/route.ts), para que el PDF nunca pueda dar un
// número distinto al que el estudiante ve en pantalla — mismo criterio que
// lib/libro-calificaciones.ts para el libro del docente y su Excel.

// evaluaciones.entrega_id es UNIQUE, así que Postgrest lo embebe como
// objeto (o null), a diferencia de archivos_entrega que sí es un arreglo.
export type EntregaTareaPropia = {
  id: string;
  actividad_id: string;
  comentario_estudiante: string | null;
  archivos_entrega: { nombre_archivo: string }[];
  evaluaciones: { calificacion_final: number; comentarios: string | null } | null;
};

export type EntregaExamenPropia = {
  id: string;
  actividad_id: string;
  evaluaciones: { calificacion_final: number; comentarios: string | null } | null;
};

type TareaCruda = {
  id: string;
  titulo: string;
  instrucciones: string | null;
  fecha_apertura: string | null;
  fecha_cierre: string;
  bloqueado_manual: boolean;
  visible_estudiantes: boolean;
  orden_aleatorio: boolean;
  limite_minutos: number | null;
  materiales_actividad: { nombre_archivo: string; storage_path: string }[];
};

type ExamenCrudo = {
  id: string;
  titulo: string;
  instrucciones: string | null;
  fecha_apertura: string | null;
  fecha_cierre: string;
  bloqueado_manual: boolean;
  visible_estudiantes: boolean;
  intentos_permitidos: number;
  orden_aleatorio: boolean;
  limite_minutos: number | null;
};

export type TareaDelEstudiante = TareaCruda & {
  // "Cuestionario": misma tarea (cuenta para porcentaje_tareas) pero con
  // preguntas autocalificadas en vez de un archivo.
  esCuestionario: boolean;
  entrega: EntregaTareaPropia | null;
};

export type ExamenDelEstudiante = ExamenCrudo & {
  // El intento más reciente, que es el que cuenta para la calificación.
  entrega: EntregaExamenPropia | null;
  intentosUsados: number;
};

export type ResumenCursoEstudiante = {
  curso: {
    nombre: string;
    grupo: string;
    periodo: string;
    porcentaje_tareas: number;
    porcentaje_examenes: number;
    porcentaje_asistencia: number;
  };
  fechaInscripcion: string;
  tareas: TareaDelEstudiante[];
  examenes: ExamenDelEstudiante[];
  asistencia: { presentes: number; ausentes: number; justificados: number };
  resultadoFinal: ResultadoCalificacionFinal;
};

// null si el estudiante no está inscrito en el curso (o el curso no existe).
// La inscripción se verifica aquí con el cliente normal (RLS) ANTES de usar
// la secret key, que solo lee lo puntual de este estudiante: qué actividades
// son cuestionarios y sus propios registros de asistencia (ver "Lecturas
// protegidas server-side" en CLAUDE.md).
export async function obtenerResumenCursoEstudiante(
  supabase: SupabaseServerClient,
  cursoId: string,
  estudianteId: string
): Promise<ResumenCursoEstudiante | null> {
  const { data: inscripcion } = await supabase
    .from("inscripciones")
    .select("id, created_at")
    .eq("curso_id", cursoId)
    .eq("estudiante_id", estudianteId)
    .maybeSingle();

  if (!inscripcion) return null;

  const { data: curso } = await supabase
    .from("cursos")
    .select(
      "nombre, grupo, periodo, porcentaje_tareas, porcentaje_examenes, porcentaje_asistencia"
    )
    .eq("id", cursoId)
    .single();

  if (!curso) return null;

  const admin = createAdminClient();
  // Antes de leer entregas: los intentos con tiempo que vencieron sin que
  // el estudiante los enviara se entregan aquí con su último avance (ver
  // lib/intentos-examen.ts).
  await finalizarIntentosVencidos(admin, { estudianteId });

  // ---- Tareas (incluye cuestionarios) ----
  const { data: tareasCrudas } = (await supabase
    .from("actividades")
    .select(
      "id, titulo, instrucciones, fecha_apertura, fecha_cierre, bloqueado_manual, visible_estudiantes, orden_aleatorio, limite_minutos, materiales_actividad(nombre_archivo, storage_path)"
    )
    .eq("curso_id", cursoId)
    .eq("tipo", "TAREA")
    .order("created_at", { ascending: false })) as { data: TareaCruda[] | null };

  const tareaIds = (tareasCrudas ?? []).map((a) => a.id);

  const { data: entregasTareas } = (
    tareaIds.length > 0
      ? await supabase
          .from("entregas")
          .select(
            "id, actividad_id, comentario_estudiante, archivos_entrega(nombre_archivo), evaluaciones(calificacion_final, comentarios)"
          )
          .eq("estudiante_id", estudianteId)
          .in("actividad_id", tareaIds)
      : { data: [] }
  ) as { data: EntregaTareaPropia[] | null };

  const entregaPorTarea = new Map(
    (entregasTareas ?? []).map((e) => [e.actividad_id, e])
  );

  // preguntas_examen no tiene ninguna policy de RLS: solo se lee qué
  // actividades tienen preguntas, nunca su contenido.
  const { data: preguntasCuestionarios } =
    tareaIds.length > 0
      ? await admin
          .from("preguntas_examen")
          .select("actividad_id")
          .in("actividad_id", tareaIds)
      : { data: [] };
  const idsCuestionarios = new Set(
    (preguntasCuestionarios ?? []).map((p) => p.actividad_id)
  );

  // "Oculta": se filtra aquí y no en la consulta, a propósito — si el
  // estudiante ya tiene una entrega para una actividad que se ocultó
  // después, debe seguir viéndola (ver migración 20260911120000).
  const tareas: TareaDelEstudiante[] = (tareasCrudas ?? [])
    .filter((a) => a.visible_estudiantes || entregaPorTarea.has(a.id))
    .sort(compararPorCierre)
    .map((a) => ({
      ...a,
      esCuestionario: idsCuestionarios.has(a.id),
      entrega: entregaPorTarea.get(a.id) ?? null,
    }));

  // ---- Exámenes ----
  const { data: examenesCrudos } = (await supabase
    .from("actividades")
    .select(
      "id, titulo, instrucciones, fecha_apertura, fecha_cierre, bloqueado_manual, visible_estudiantes, intentos_permitidos, orden_aleatorio, limite_minutos"
    )
    .eq("curso_id", cursoId)
    .eq("tipo", "EXAMEN")
    .order("created_at", { ascending: false })) as { data: ExamenCrudo[] | null };

  const examenIds = (examenesCrudos ?? []).map((e) => e.id);

  // Con "2 intentos" puede haber más de una entrega por examen: ordenar
  // ascendente y dejar que la clave repetida se sobreescriba en el Map deja
  // el intento más reciente, que es el que cuenta.
  const { data: entregasExamen } = (
    examenIds.length > 0
      ? await supabase
          .from("entregas")
          .select("id, actividad_id, evaluaciones(calificacion_final, comentarios)")
          .eq("estudiante_id", estudianteId)
          .in("actividad_id", examenIds)
          .order("created_at", { ascending: true })
      : { data: [] }
  ) as { data: EntregaExamenPropia[] | null };

  const entregaPorExamen = new Map(
    (entregasExamen ?? []).map((e) => [e.actividad_id, e])
  );
  const intentosPorExamen = new Map<string, number>();
  for (const e of entregasExamen ?? []) {
    intentosPorExamen.set(e.actividad_id, (intentosPorExamen.get(e.actividad_id) ?? 0) + 1);
  }

  const examenes: ExamenDelEstudiante[] = (examenesCrudos ?? [])
    .filter((e) => e.visible_estudiantes || entregaPorExamen.has(e.id))
    .sort(compararPorCierre)
    .map((e) => ({
      ...e,
      entrega: entregaPorExamen.get(e.id) ?? null,
      intentosUsados: intentosPorExamen.get(e.id) ?? 0,
    }));

  // ---- Asistencia, desde que este estudiante se inscribió ----
  const fechaInscripcion = new Date(inscripcion.created_at).toISOString().slice(0, 10);

  const { data: sesiones } = await admin
    .from("sesiones_asistencia")
    .select("id")
    .eq("curso_id", cursoId)
    .gte("fecha", fechaInscripcion);

  const sesionIds = (sesiones ?? []).map((s) => s.id);
  const asistencia = { presentes: 0, ausentes: 0, justificados: 0 };
  if (sesionIds.length > 0) {
    const { data: misAsistencias } = await admin
      .from("asistencias")
      .select("estado")
      .eq("estudiante_id", estudianteId)
      .in("sesion_id", sesionIds);

    for (const a of misAsistencias ?? []) {
      if (a.estado === "presente") asistencia.presentes += 1;
      else if (a.estado === "ausente") asistencia.ausentes += 1;
      else if (a.estado === "justificado") asistencia.justificados += 1;
    }
  }

  // ---- Calificación final (misma fórmula que el libro del docente) ----
  const promedioTareas = promedioCalificaciones(
    (entregasTareas ?? []).map((e) => e.evaluaciones?.calificacion_final)
  );
  const promedioExamenes = promedioCalificaciones(
    examenes.map((e) => e.entrega?.evaluaciones?.calificacion_final)
  );
  const resultadoFinal = calcularCalificacionFinal(
    promedioTareas,
    promedioExamenes,
    calcularPorcentajeAsistencia(asistencia.presentes, asistencia.ausentes),
    curso
  );

  return {
    curso,
    fechaInscripcion: inscripcion.created_at,
    tareas,
    examenes,
    asistencia,
    resultadoFinal,
  };
}

// ---- Situación de cada actividad, para el reporte ----

export type SituacionActividad =
  | { tipo: "CALIFICADA"; calificacion: number }
  | { tipo: "SIN_CALIFICAR" }
  | { tipo: "POR_ENTREGAR" }
  | { tipo: "NO_ENTREGADA" }
  | { tipo: "NO_DISPONIBLE" };

// Una entrega de tarea sin archivos ni calificación es un intento que se
// quedó a medias (ver crearEntrega): cuenta como "sin entregar", igual que
// en la tarjeta del estudiante. Un cuestionario nunca lleva archivo, así que
// ahí basta con que exista la entrega.
export function tieneEntregaReal(tarea: TareaDelEstudiante): boolean {
  if (!tarea.entrega) return false;
  if (tarea.esCuestionario) return true;
  return tarea.entrega.archivos_entrega.length > 0 || tarea.entrega.evaluaciones !== null;
}

// Sin entrega: "por entregar" si todavía se puede, "no entregada" si ya
// pasó la fecha de cierre, y "no disponible" si todavía no abre o el docente
// la bloqueó antes de su cierre — esa no cuenta ni como pendiente ni como
// falta, porque el estudiante no ha tenido oportunidad de entregarla.
export function situacionActividad(
  actividad: { fecha_apertura: string | null; fecha_cierre: string; bloqueado_manual: boolean },
  entregada: boolean,
  calificacion: number | null | undefined
): SituacionActividad {
  if (entregada) {
    return calificacion !== null && calificacion !== undefined
      ? { tipo: "CALIFICADA", calificacion }
      : { tipo: "SIN_CALIFICAR" };
  }
  if (estadoActividad(actividad) === "ABIERTA") return { tipo: "POR_ENTREGAR" };
  if (Date.now() > new Date(actividad.fecha_cierre).getTime()) return { tipo: "NO_ENTREGADA" };
  return { tipo: "NO_DISPONIBLE" };
}
