import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerTodasLasFilas } from "@/lib/leer-todas-las-filas";
import { calcularFaltantes } from "@/lib/faltantes-tarea";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Datos del Resumen de un curso para el docente: qué espera calificación, la
// línea del semestre, los próximos cierres y la asistencia reciente. Solo
// agrega lo que ya existe; no calcula ninguna nota.
//
// Quien la llama ya verificó con RLS que el curso es del docente.

export type ActividadLinea = {
  id: string;
  titulo: string;
  tipo: "TAREA" | "EXAMEN";
  esCuestionario: boolean;
  fecha_apertura: string | null;
  fecha_cierre: string;
  visible: boolean;
  bloqueada: boolean;
  porCalificar: number;
  // Enlace para calificar: entregas con archivo, o respuestas escritas.
  hrefCalificar: string;
};

export type ProximoCierre = ActividadLinea & {
  entregaron: number;
  inscritos: number;
};

export type SesionResumen = {
  fecha: string;
  // presentes / (presentes + ausentes), sin justificados; null si no hay
  // ninguno de los dos (mismo criterio que calcularPorcentajeAsistencia).
  porcentaje: number | null;
};

export type ResumenCursoDocente = {
  actividades: ActividadLinea[];
  proximosCierres: ProximoCierre[];
  sesiones: SesionResumen[];
  promedioAsistencia: number | null;
  inscritos: number;
};

const MAX_PROXIMOS = 4;
const MAX_SESIONES = 8;

export async function obtenerResumenCursoDocente(
  supabase: SupabaseServerClient,
  cursoId: string
): Promise<ResumenCursoDocente> {
  const ahora = Date.now();

  const [{ data: actividadesFilas }, { data: inscripciones }] = await Promise.all([
    supabase
      .from("actividades")
      .select(
        "id, titulo, tipo, fecha_apertura, fecha_cierre, visible_estudiantes, bloqueado_manual"
      )
      .eq("curso_id", cursoId)
      .order("fecha_cierre", { ascending: true }),
    supabase.from("inscripciones").select("estudiante_id").eq("curso_id", cursoId),
  ]);

  const filas = actividadesFilas ?? [];
  const ids = filas.map((a) => a.id);
  const estudianteIds = (inscripciones ?? []).map((i) => i.estudiante_id);

  // Cuestionario = tarea con filas en preguntas_examen. Esa tabla no tiene
  // policy: se lee solo actividad_id con la secret key (mismo patrón que la
  // pestaña Tareas), ya verificado el curso.
  const cuestionarios = new Set<string>();
  if (ids.length > 0) {
    const admin = createAdminClient();
    const { data: preguntas } = await admin
      .from("preguntas_examen")
      .select("actividad_id")
      .in("actividad_id", ids);
    for (const p of preguntas ?? []) cuestionarios.add(p.actividad_id);
  }

  // Mismo criterio que contarPendientesCurso (estado PENDIENTE), para que la
  // suma por actividad coincida con los números de la franja de pestañas.
  const entregas =
    ids.length > 0
      ? await leerTodasLasFilas<{
          id: string;
          actividad_id: string;
          estudiante_id: string;
          estado: string;
          archivos_entrega: { count: number }[];
          evaluaciones: { id: string } | null;
        }>((desde, hasta) =>
          supabase
            .from("entregas")
            .select(
              "id, actividad_id, estudiante_id, estado, archivos_entrega(count), evaluaciones(id)"
            )
            .in("actividad_id", ids)
            .order("id")
            .range(desde, hasta)
        )
      : [];

  const porActividad = new Map<string, typeof entregas>();
  for (const e of entregas) {
    const lista = porActividad.get(e.actividad_id) ?? [];
    lista.push(e);
    porActividad.set(e.actividad_id, lista);
  }

  const actividades: ActividadLinea[] = filas.map((a) => {
    const tipo = a.tipo as "TAREA" | "EXAMEN";
    const esCuestionario = tipo === "TAREA" && cuestionarios.has(a.id);
    const porCalificar = (porActividad.get(a.id) ?? []).filter(
      (e) => e.estado === "PENDIENTE"
    ).length;
    return {
      id: a.id,
      titulo: a.titulo,
      tipo,
      esCuestionario,
      fecha_apertura: a.fecha_apertura,
      fecha_cierre: a.fecha_cierre,
      visible: a.visible_estudiantes,
      bloqueada: a.bloqueado_manual,
      porCalificar,
      hrefCalificar:
        tipo === "EXAMEN" || esCuestionario
          ? `/docente/actividades/${a.id}/respuestas`
          : `/docente/actividades/${a.id}`,
    };
  });

  const proximosCierres: ProximoCierre[] = actividades
    .filter(
      (a) => a.visible && !a.bloqueada && new Date(a.fecha_cierre).getTime() > ahora
    )
    .slice(0, MAX_PROXIMOS)
    .map((a) => {
      const faltantes = calcularFaltantes(
        estudianteIds,
        (porActividad.get(a.id) ?? []).map((e) => ({
          estudiante_id: e.estudiante_id,
          numArchivos: e.archivos_entrega[0]?.count ?? 0,
          calificada: e.evaluaciones !== null,
        })),
        a.tipo === "EXAMEN" || a.esCuestionario
      );
      return {
        ...a,
        entregaron: estudianteIds.length - faltantes.length,
        inscritos: estudianteIds.length,
      };
    });

  // Asistencia: las últimas sesiones, en orden cronológico para la gráfica.
  const { data: sesionesFilas } = await supabase
    .from("sesiones_asistencia")
    .select("id, fecha")
    .eq("curso_id", cursoId)
    .order("fecha", { ascending: false })
    .limit(MAX_SESIONES);
  const sesionesRecientes = (sesionesFilas ?? []).reverse();

  let sesiones: SesionResumen[] = [];
  let promedioAsistencia: number | null = null;
  if (sesionesRecientes.length > 0) {
    const registros = await leerTodasLasFilas<{ sesion_id: string; estado: string }>(
      (desde, hasta) =>
        supabase
          .from("asistencias")
          .select("sesion_id, estado")
          .in(
            "sesion_id",
            sesionesRecientes.map((s) => s.id)
          )
          .order("id")
          .range(desde, hasta)
    );
    let presentesTotal = 0;
    let contadosTotal = 0;
    sesiones = sesionesRecientes.map((s) => {
      const propios = registros.filter((r) => r.sesion_id === s.id);
      const presentes = propios.filter((r) => r.estado === "presente").length;
      const ausentes = propios.filter((r) => r.estado === "ausente").length;
      presentesTotal += presentes;
      contadosTotal += presentes + ausentes;
      return {
        fecha: s.fecha,
        porcentaje:
          presentes + ausentes > 0 ? (presentes / (presentes + ausentes)) * 100 : null,
      };
    });
    promedioAsistencia = contadosTotal > 0 ? (presentesTotal / contadosTotal) * 100 : null;
  }

  return {
    actividades,
    proximosCierres,
    sesiones,
    promedioAsistencia,
    inscritos: estudianteIds.length,
  };
}
