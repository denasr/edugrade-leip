import type { createClient } from "@/lib/supabase/server";
import { compararPorCierre } from "@/lib/actividades";
import {
  calcularCalificacionFinal,
  calcularPorcentajeAsistencia,
  promedioCalificaciones,
  type ResultadoCalificacionFinal,
} from "@/lib/calificacion-final";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActividadLibro = { id: string; titulo: string };
export type CeldaActividad = { entregada: boolean; calificacion: number | null };

export type FilaEstudiante = {
  id: string;
  nombre_completo: string;
  celdas: Map<string, CeldaActividad>;
  resultado: ResultadoCalificacionFinal;
};

export type LibroCalificaciones = {
  curso: { id: string; nombre: string; grupo: string; periodo: string };
  tareas: ActividadLibro[];
  examenes: ActividadLibro[];
  estudiantes: FilaEstudiante[];
};

// Reutilizada tanto por la página del libro de calificaciones como por la
// exportación a Excel, para que ambas muestren exactamente los mismos datos
// calculados de la misma forma — nunca se recalcula nada por separado.
// El filtro por docente_id hace también de chequeo de dueño del curso: si
// el curso no existe o no es de este docente, devuelve null.
export async function obtenerLibroCalificaciones(
  supabase: SupabaseServerClient,
  cursoId: string,
  docenteId: string
): Promise<LibroCalificaciones | null> {
  const { data: curso } = await supabase
    .from("cursos")
    .select(
      "id, nombre, grupo, periodo, porcentaje_tareas, porcentaje_examenes, porcentaje_asistencia"
    )
    .eq("id", cursoId)
    .eq("docente_id", docenteId)
    .single();

  if (!curso) return null;

  const { data: inscripciones } = await supabase
    .from("inscripciones")
    .select("estudiante_id, created_at")
    .eq("curso_id", cursoId);

  const estudianteIds = (inscripciones ?? []).map((i) => i.estudiante_id);
  const fechaInscripcionPorEstudiante = new Map(
    (inscripciones ?? []).map((i) => [
      i.estudiante_id,
      i.created_at.slice(0, 10),
    ])
  );

  const { data: perfilesEstudiantes } =
    estudianteIds.length > 0
      ? await supabase
          .from("perfiles")
          .select("id, nombre_completo")
          .in("id", estudianteIds)
          .order("nombre_completo", { ascending: true })
      : { data: [] };

  const { data: tareas } = await supabase
    .from("actividades")
    .select("id, titulo, fecha_cierre")
    .eq("curso_id", cursoId)
    .eq("tipo", "TAREA")
    .order("created_at", { ascending: false });
  tareas?.sort(compararPorCierre);

  const { data: examenes } = await supabase
    .from("actividades")
    .select("id, titulo, fecha_cierre")
    .eq("curso_id", cursoId)
    .eq("tipo", "EXAMEN")
    .order("created_at", { ascending: false });
  examenes?.sort(compararPorCierre);

  const actividadIds = [
    ...(tareas ?? []).map((a) => a.id),
    ...(examenes ?? []).map((e) => e.id),
  ];

  type EntregaConEstudiante = {
    actividad_id: string;
    estudiante_id: string;
    evaluaciones: { calificacion_final: number } | null;
  };

  const { data: entregas } = (
    actividadIds.length > 0
      ? await supabase
          .from("entregas")
          .select(
            "actividad_id, estudiante_id, evaluaciones(calificacion_final)"
          )
          .in("actividad_id", actividadIds)
      : { data: [] }
  ) as { data: EntregaConEstudiante[] | null };

  const celdaPorActividadYEstudiante = new Map<string, CeldaActividad>(
    (entregas ?? []).map((e) => [
      `${e.actividad_id}:${e.estudiante_id}`,
      {
        entregada: true,
        calificacion: e.evaluaciones?.calificacion_final ?? null,
      },
    ])
  );

  const { data: sesiones } = await supabase
    .from("sesiones_asistencia")
    .select("id, fecha")
    .eq("curso_id", cursoId);

  const sesionIds = (sesiones ?? []).map((s) => s.id);
  const { data: asistencias } =
    sesionIds.length > 0
      ? await supabase
          .from("asistencias")
          .select("sesion_id, estudiante_id, estado")
          .in("sesion_id", sesionIds)
      : { data: [] };

  const fechaPorSesion = new Map((sesiones ?? []).map((s) => [s.id, s.fecha]));

  const estudiantes: FilaEstudiante[] = (perfilesEstudiantes ?? []).map(
    (estudiante) => {
      const promedioTareas = promedioCalificaciones(
        (tareas ?? []).map(
          (t) =>
            celdaPorActividadYEstudiante.get(`${t.id}:${estudiante.id}`)
              ?.calificacion
        )
      );
      const promedioExamenes = promedioCalificaciones(
        (examenes ?? []).map(
          (e) =>
            celdaPorActividadYEstudiante.get(`${e.id}:${estudiante.id}`)
              ?.calificacion
        )
      );

      const fechaInscripcion = fechaInscripcionPorEstudiante.get(
        estudiante.id
      );
      let presentes = 0;
      let ausentes = 0;
      for (const a of asistencias ?? []) {
        if (a.estudiante_id !== estudiante.id) continue;
        const fechaSesion = fechaPorSesion.get(a.sesion_id);
        if (!fechaSesion || !fechaInscripcion || fechaSesion < fechaInscripcion)
          continue;
        if (a.estado === "presente") presentes += 1;
        else if (a.estado === "ausente") ausentes += 1;
      }
      const porcentajeAsistencia = calcularPorcentajeAsistencia(
        presentes,
        ausentes
      );

      const resultado = calcularCalificacionFinal(
        promedioTareas,
        promedioExamenes,
        porcentajeAsistencia,
        curso
      );

      const celdas = new Map<string, CeldaActividad>();
      for (const actividad of [...(tareas ?? []), ...(examenes ?? [])]) {
        const celda = celdaPorActividadYEstudiante.get(
          `${actividad.id}:${estudiante.id}`
        );
        celdas.set(actividad.id, celda ?? { entregada: false, calificacion: null });
      }

      return { ...estudiante, celdas, resultado };
    }
  );

  return {
    curso: {
      id: curso.id,
      nombre: curso.nombre,
      grupo: curso.grupo,
      periodo: curso.periodo,
    },
    tareas: tareas ?? [],
    examenes: examenes ?? [],
    estudiantes,
  };
}

export function textoCeldaTarea(celda: CeldaActividad | undefined): string {
  if (!celda || !celda.entregada) return "Sin entregar";
  return celda.calificacion !== null
    ? `${celda.calificacion.toFixed(1)}/10`
    : "Sin calificar";
}

export function textoCeldaExamen(celda: CeldaActividad | undefined): string {
  if (!celda || !celda.entregada) return "No presentado";
  return celda.calificacion !== null
    ? `${celda.calificacion.toFixed(1)}/10`
    : "Calificando…";
}

export function textoAsistencia(
  porcentajeAsistencia: number | null
): string {
  return porcentajeAsistencia !== null
    ? `${porcentajeAsistencia.toFixed(0)}%`
    : "Sin datos";
}

export function textoCalificacionFinalBase(
  resultado: ResultadoCalificacionFinal
): string {
  return resultado.calificacionFinal !== null
    ? `${resultado.calificacionFinal.toFixed(1)}/10`
    : "Sin datos";
}

// Para el Excel, donde no hay forma de resaltar "(parcial)" con un color
// aparte como en pantalla: se agrega como sufijo de texto en la misma celda.
export function textoCalificacionFinalConParcial(
  resultado: ResultadoCalificacionFinal
): string {
  const base = textoCalificacionFinalBase(resultado);
  return resultado.calificacionFinal !== null && resultado.esParcial
    ? `${base} (parcial)`
    : base;
}
