import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { compararPorCierre } from "@/lib/actividades";
import {
  calcularCalificacionFinal,
  calcularPorcentajeAsistencia,
  promedioCalificaciones,
} from "@/lib/calificacion-final";

export default async function LibroCalificaciones({
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

  if (perfil?.rol !== "DOCENTE") redirect("/estudiante");

  const { data: curso } = await supabase
    .from("cursos")
    .select(
      "id, nombre, grupo, periodo, porcentaje_tareas, porcentaje_examenes, porcentaje_asistencia"
    )
    .eq("id", id)
    .eq("docente_id", user.id)
    .single();

  if (!curso) redirect("/docente");

  const { data: inscripciones } = await supabase
    .from("inscripciones")
    .select("estudiante_id, created_at")
    .eq("curso_id", id);

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
    .eq("curso_id", id)
    .eq("tipo", "TAREA")
    .order("created_at", { ascending: false });
  tareas?.sort(compararPorCierre);

  const { data: examenes } = await supabase
    .from("actividades")
    .select("id, titulo, fecha_cierre")
    .eq("curso_id", id)
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

  const entregaPorActividadYEstudiante = new Map(
    (entregas ?? []).map((e) => [
      `${e.actividad_id}:${e.estudiante_id}`,
      e.evaluaciones?.calificacion_final ?? null,
    ])
  );
  const entregadaPorActividadYEstudiante = new Set(
    (entregas ?? []).map((e) => `${e.actividad_id}:${e.estudiante_id}`)
  );

  const { data: sesiones } = await supabase
    .from("sesiones_asistencia")
    .select("id, fecha")
    .eq("curso_id", id);

  const sesionIds = (sesiones ?? []).map((s) => s.id);
  const { data: asistencias } =
    sesionIds.length > 0
      ? await supabase
          .from("asistencias")
          .select("sesion_id, estudiante_id, estado")
          .in("sesion_id", sesionIds)
      : { data: [] };

  const fechaPorSesion = new Map((sesiones ?? []).map((s) => [s.id, s.fecha]));

  const estudiantes = (perfilesEstudiantes ?? []).map((estudiante) => {
    const promedioTareas = promedioCalificaciones(
      (tareas ?? []).map((t) =>
        entregaPorActividadYEstudiante.get(`${t.id}:${estudiante.id}`)
      )
    );
    const promedioExamenes = promedioCalificaciones(
      (examenes ?? []).map((e) =>
        entregaPorActividadYEstudiante.get(`${e.id}:${estudiante.id}`)
      )
    );

    const fechaInscripcion = fechaInscripcionPorEstudiante.get(estudiante.id);
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

    return { ...estudiante, resultado };
  });

  function celdaTarea(actividadId: string, estudianteId: string) {
    const clave = `${actividadId}:${estudianteId}`;
    if (!entregadaPorActividadYEstudiante.has(clave)) return "Sin entregar";
    const calificacion = entregaPorActividadYEstudiante.get(clave);
    return calificacion !== null && calificacion !== undefined
      ? `${calificacion.toFixed(1)}/10`
      : "Sin calificar";
  }

  function celdaExamen(actividadId: string, estudianteId: string) {
    const clave = `${actividadId}:${estudianteId}`;
    if (!entregadaPorActividadYEstudiante.has(clave)) return "No presentado";
    const calificacion = entregaPorActividadYEstudiante.get(clave);
    return calificacion !== null && calificacion !== undefined
      ? `${calificacion.toFixed(1)}/10`
      : "Calificando…";
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-4 py-16">
      <div className="w-full max-w-4xl text-center">
        <Link href={`/docente/cursos/${id}`} className="link-muted">
          ← {curso.nombre}
        </Link>
        <h1 className="mt-2 font-title text-2xl text-verde-bosque">
          Libro de calificaciones
        </h1>
        <p className="mt-1 text-sm text-ink/70">
          {curso.grupo} · {curso.periodo}
        </p>
      </div>

      {estudiantes.length === 0 ? (
        <p className="text-sm text-ink/60">
          Todavía no hay estudiantes inscritos en este curso.
        </p>
      ) : (
        <div className="card w-full max-w-4xl overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-verde-bosque/15 text-left">
                <th className="sticky left-0 z-10 whitespace-nowrap bg-superficie px-4 py-3 font-medium text-ink">
                  Estudiante
                </th>
                {(tareas ?? []).map((t) => (
                  <th
                    key={t.id}
                    className="whitespace-nowrap px-3 py-3 font-medium text-ink"
                  >
                    {t.titulo}
                  </th>
                ))}
                {(examenes ?? []).map((e) => (
                  <th
                    key={e.id}
                    className="whitespace-nowrap px-3 py-3 font-medium text-ink"
                  >
                    {e.titulo}
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-3 font-medium text-ink">
                  Asistencia
                </th>
                <th className="whitespace-nowrap bg-verde-bosque/8 px-3 py-3 font-medium text-verde-bosque">
                  Final
                </th>
              </tr>
            </thead>
            <tbody>
              {estudiantes.map((estudiante) => (
                <tr
                  key={estudiante.id}
                  className="border-b border-verde-bosque/10 last:border-0"
                >
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-superficie px-4 py-3 text-ink">
                    {estudiante.nombre_completo}
                  </td>
                  {(tareas ?? []).map((t) => (
                    <td
                      key={t.id}
                      className="whitespace-nowrap px-3 py-3 text-ink/80"
                    >
                      {celdaTarea(t.id, estudiante.id)}
                    </td>
                  ))}
                  {(examenes ?? []).map((e) => (
                    <td
                      key={e.id}
                      className="whitespace-nowrap px-3 py-3 text-ink/80"
                    >
                      {celdaExamen(e.id, estudiante.id)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-3 text-ink/80">
                    {estudiante.resultado.porcentajeAsistencia !== null
                      ? `${estudiante.resultado.porcentajeAsistencia.toFixed(0)}%`
                      : "Sin datos"}
                  </td>
                  <td className="whitespace-nowrap bg-verde-bosque/8 px-3 py-3 font-medium text-verde-bosque">
                    {estudiante.resultado.calificacionFinal !== null
                      ? `${estudiante.resultado.calificacionFinal.toFixed(1)}/10`
                      : "Sin datos"}
                    {estudiante.resultado.calificacionFinal !== null &&
                      estudiante.resultado.esParcial && (
                        <span className="ml-1 text-xs text-terracota">
                          (parcial)
                        </span>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
