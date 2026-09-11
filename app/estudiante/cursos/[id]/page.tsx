import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { estadoActividad, compararPorCierre } from "@/lib/actividades";
import {
  calcularCalificacionFinal,
  calcularPorcentajeAsistencia,
  promedioCalificaciones,
  textoNotaParcial,
} from "@/lib/calificacion-final";
import TarjetaTareaEstudiante from "./tarjeta-tarea-estudiante";
import TarjetaExamenEstudiante from "./tarjeta-examen-estudiante";

export default async function DetalleCursoEstudiante({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (perfil?.rol !== "ESTUDIANTE") redirect("/docente");

  const { data: inscripcion } = await supabase
    .from("inscripciones")
    .select("id, created_at")
    .eq("curso_id", id)
    .eq("estudiante_id", user.id)
    .maybeSingle();

  if (!inscripcion) redirect("/estudiante");

  const { data: curso } = await supabase
    .from("cursos")
    .select(
      "nombre, grupo, periodo, porcentaje_tareas, porcentaje_examenes, porcentaje_asistencia"
    )
    .eq("id", id)
    .single();

  if (!curso) redirect("/estudiante");

  const { data: actividades } = await supabase
    .from("actividades")
    .select(
      "id, titulo, instrucciones, fecha_apertura, fecha_cierre, bloqueado_manual, materiales_actividad(nombre_archivo, storage_path)"
    )
    .eq("curso_id", id)
    .eq("tipo", "TAREA")
    .order("created_at", { ascending: false });

  actividades?.sort(compararPorCierre);

  const actividadIds = (actividades ?? []).map((a) => a.id);

  // evaluaciones.entrega_id es UNIQUE, así que Postgrest lo embebe como
  // objeto (o null), a diferencia de archivos_entrega que sí es un arreglo.
  type EntregaConDetalle = {
    id: string;
    actividad_id: string;
    comentario_estudiante: string | null;
    archivos_entrega: { nombre_archivo: string }[];
    evaluaciones: { calificacion_final: number; comentarios: string | null } | null;
  };

  const { data: entregas } = (
    actividadIds.length > 0
      ? await supabase
          .from("entregas")
          .select(
            "id, actividad_id, comentario_estudiante, archivos_entrega(nombre_archivo), evaluaciones(calificacion_final, comentarios)"
          )
          .eq("estudiante_id", user.id)
          .in("actividad_id", actividadIds)
      : { data: [] }
  ) as { data: EntregaConDetalle[] | null };

  const entregasPorActividad = new Map(
    (entregas ?? []).map((entrega) => [entrega.actividad_id, entrega])
  );

  // "Cuestionario": misma tarea (cuenta para porcentaje_tareas) pero con
  // preguntas de opción múltiple autocalificadas en vez de un archivo — se
  // distingue únicamente por tener filas en preguntas_examen. Esa tabla no
  // tiene ninguna policy de RLS (ver CLAUDE.md), así que esta consulta debe
  // ir con la secret key — la inscripción a este curso ya se verificó
  // arriba, este solo lee el dato puntual de qué actividades tienen
  // preguntas, nunca su contenido.
  const admin = createAdminClient();
  const { data: preguntasCuestionarios } =
    actividadIds.length > 0
      ? await admin
          .from("preguntas_examen")
          .select("actividad_id")
          .in("actividad_id", actividadIds)
      : { data: [] };
  const idsCuestionarios = new Set(
    (preguntasCuestionarios ?? []).map((p) => p.actividad_id)
  );

  type PreguntaEstudianteTarea = {
    id: string;
    enunciado: string;
    opciones: string[];
    puntos: number;
  };

  const actividadesConEnlace = await Promise.all(
    (actividades ?? []).map(async (actividad) => {
      const esCuestionario = idsCuestionarios.has(actividad.id);
      const entregaActual = entregasPorActividad.get(actividad.id) ?? null;
      const estado = estadoActividad(actividad);

      let preguntas: PreguntaEstudianteTarea[] = [];
      if (esCuestionario && !entregaActual && estado === "ABIERTA") {
        const { data } = await supabase
          .from("preguntas_examen_estudiante")
          .select("id, enunciado, opciones, puntos")
          .eq("actividad_id", actividad.id)
          .order("orden", { ascending: true });
        preguntas = (data ?? []) as PreguntaEstudianteTarea[];
      }

      // Un cuestionario no tiene material de apoyo ni archivo que descargar
      // — el material sí lo permite el esquema para una tarea de archivo,
      // pero aquí no aplica.
      const material = esCuestionario
        ? null
        : (actividad.materiales_actividad[0] ?? null);
      let enlaceDescarga: string | null = null;

      if (material) {
        // No debe tronar toda la página si Storage falla (red, timeout):
        // sin enlace de descarga es degradación aceptable, un 500 no.
        try {
          const { data, error } = await supabase.storage
            .from("materiales-actividades")
            .createSignedUrl(material.storage_path, 60 * 10);
          if (error) console.error("Error al firmar URL de material:", error);
          enlaceDescarga = data?.signedUrl ?? null;
        } catch (err) {
          console.error("Excepción al firmar URL de material:", err);
        }
      }

      return {
        ...actividad,
        esCuestionario,
        preguntas,
        nombreArchivo: material?.nombre_archivo ?? null,
        enlaceDescarga,
        entrega: entregaActual,
      };
    })
  );

  const { data: examenes } = await supabase
    .from("actividades")
    .select(
      "id, titulo, instrucciones, fecha_apertura, fecha_cierre, bloqueado_manual"
    )
    .eq("curso_id", id)
    .eq("tipo", "EXAMEN")
    .order("created_at", { ascending: false });

  examenes?.sort(compararPorCierre);

  const examenIds = (examenes ?? []).map((e) => e.id);

  type EntregaExamenPropia = {
    id: string;
    actividad_id: string;
    evaluaciones: {
      calificacion_final: number;
      comentarios: string | null;
    } | null;
  };

  const { data: entregasExamen } = (
    examenIds.length > 0
      ? await supabase
          .from("entregas")
          .select("id, actividad_id, evaluaciones(calificacion_final, comentarios)")
          .eq("estudiante_id", user.id)
          .in("actividad_id", examenIds)
      : { data: [] }
  ) as { data: EntregaExamenPropia[] | null };

  const entregaExamenPorActividad = new Map(
    (entregasExamen ?? []).map((e) => [e.actividad_id, e])
  );

  type PreguntaEstudiante = {
    id: string;
    enunciado: string;
    opciones: string[];
    puntos: number;
  };

  const examenesConPreguntas = await Promise.all(
    (examenes ?? []).map(async (examen) => {
      const entrega = entregaExamenPorActividad.get(examen.id) ?? null;
      const estado = estadoActividad(examen);
      let preguntas: PreguntaEstudiante[] = [];

      if (!entrega && estado === "ABIERTA") {
        const { data } = await supabase
          .from("preguntas_examen_estudiante")
          .select("id, enunciado, opciones, puntos")
          .eq("actividad_id", examen.id)
          .order("orden", { ascending: true });
        preguntas = (data ?? []) as PreguntaEstudiante[];
      }

      return { ...examen, entrega, preguntas };
    })
  );

  const promedioTareas = promedioCalificaciones(
    (entregas ?? []).map((e) => e.evaluaciones?.calificacion_final)
  );

  const promedioExamenes = promedioCalificaciones(
    (entregasExamen ?? []).map((e) => e.evaluaciones?.calificacion_final)
  );

  // La lectura de asistencia va con la secret key: hoy no hay policy de
  // lectura para el estudiante (se dejó fuera a propósito hasta este
  // encargo), y en vez de agregar una nueva policy calculamos aquí, ya
  // verificada la inscripción arriba, y solo devolvemos al cliente el
  // porcentaje ya calculado — nunca las filas crudas de otros estudiantes.
  const fechaInscripcion = new Date(inscripcion.created_at)
    .toISOString()
    .slice(0, 10);

  const { data: sesionesDesdeInscripcion } = await admin
    .from("sesiones_asistencia")
    .select("id")
    .eq("curso_id", id)
    .gte("fecha", fechaInscripcion);

  const sesionIds = (sesionesDesdeInscripcion ?? []).map((s) => s.id);

  let sesionesPresente = 0;
  let sesionesAusente = 0;
  if (sesionIds.length > 0) {
    const { data: misAsistencias } = await admin
      .from("asistencias")
      .select("estado")
      .eq("estudiante_id", user.id)
      .in("sesion_id", sesionIds);

    for (const a of misAsistencias ?? []) {
      if (a.estado === "presente") sesionesPresente += 1;
      else if (a.estado === "ausente") sesionesAusente += 1;
      // "justificado" se excluye del cálculo, ni suma ni resta.
    }
  }

  const porcentajeAsistencia = calcularPorcentajeAsistencia(
    sesionesPresente,
    sesionesAusente
  );

  const resultadoFinal = calcularCalificacionFinal(
    promedioTareas,
    promedioExamenes,
    porcentajeAsistencia,
    curso
  );
  const notaParcial = textoNotaParcial(resultadoFinal.categoriasFaltantes);

  return (
    <main className="flex flex-1 flex-col items-center gap-10 px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <Link href="/estudiante" className="link-muted">
          ← Mis cursos
        </Link>
        <h1 className="mt-2 font-title text-2xl text-verde-bosque">
          {curso.nombre}
        </h1>
        <p className="mt-1 text-sm text-ink/70">
          {curso.grupo} · {curso.periodo}
        </p>
      </div>

      <section className="card w-full max-w-sm p-6">
        <h2 className="font-title text-xl text-verde-bosque">
          Calificación final
        </h2>

        <div className="mt-4 flex flex-col gap-2 text-sm text-ink/80">
          <div className="flex items-center justify-between">
            <span>Tareas ({curso.porcentaje_tareas}%)</span>
            <span>
              {resultadoFinal.promedioTareas !== null
                ? `${resultadoFinal.promedioTareas.toFixed(1)}/10`
                : "Sin datos"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Exámenes ({curso.porcentaje_examenes}%)</span>
            <span>
              {resultadoFinal.promedioExamenes !== null
                ? `${resultadoFinal.promedioExamenes.toFixed(1)}/10`
                : "Sin datos"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Asistencia ({curso.porcentaje_asistencia}%)</span>
            <span>
              {resultadoFinal.porcentajeAsistencia !== null
                ? `${resultadoFinal.porcentajeAsistencia.toFixed(0)}%`
                : "Sin datos"}
            </span>
          </div>
        </div>

        <div className="mt-4 border-t border-verde-bosque/15 pt-4">
          <p className="font-title text-2xl text-verde-bosque">
            {resultadoFinal.calificacionFinal !== null
              ? `${resultadoFinal.calificacionFinal.toFixed(1)}/10`
              : "Sin datos suficientes"}
          </p>
          {notaParcial && (
            <p className="mt-1 text-xs text-terracota">{notaParcial}</p>
          )}
        </div>
      </section>

      <section className="w-full max-w-sm">
        <h2 className="font-title text-xl text-verde-bosque">Tareas</h2>

        {actividadesConEnlace.length === 0 ? (
          <p className="mt-4 text-sm text-ink/70">
            Todavía no hay tareas publicadas en este curso.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {actividadesConEnlace.map((actividad) => (
              <TarjetaTareaEstudiante
                key={actividad.id}
                actividad={actividad}
                cursoId={id}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="w-full max-w-sm">
        <h2 className="font-title text-xl text-verde-bosque">Exámenes</h2>

        {examenesConPreguntas.length === 0 ? (
          <p className="mt-4 text-sm text-ink/70">
            Todavía no hay exámenes publicados en este curso.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {examenesConPreguntas.map((examen) => (
              <TarjetaExamenEstudiante key={examen.id} examen={examen} cursoId={id} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
