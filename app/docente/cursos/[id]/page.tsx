import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { compararPorCierre } from "@/lib/actividades";
import FormularioActividad from "./formulario-actividad";
import FormularioCrearExamen from "./formulario-crear-examen";
import FormularioConfiguracion from "./formulario-configuracion";
import BotonTomarAsistencia from "./boton-tomar-asistencia";
import TarjetaTarea from "./tarjeta-tarea";
import TarjetaExamen from "./tarjeta-examen";

export default async function DetalleCursoDocente({
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
      "id, nombre, grupo, periodo, clave_acceso, porcentaje_examenes, porcentaje_tareas, porcentaje_asistencia"
    )
    .eq("id", id)
    .eq("docente_id", user.id)
    .single();

  if (!curso) redirect("/docente");

  const { data: actividades } = await supabase
    .from("actividades")
    .select(
      "id, titulo, instrucciones, fecha_apertura, fecha_cierre, bloqueado_manual, materiales_actividad(nombre_archivo)"
    )
    .eq("curso_id", id)
    .eq("tipo", "TAREA")
    .order("created_at", { ascending: false });

  actividades?.sort(compararPorCierre);

  const actividadIds = (actividades ?? []).map((a) => a.id);
  const { data: entregas } =
    actividadIds.length > 0
      ? await supabase
          .from("entregas")
          .select("actividad_id, estado")
          .in("actividad_id", actividadIds)
      : { data: [] };

  const conteosPorActividad = new Map<
    string,
    { total: number; pendientes: number }
  >();
  for (const entrega of entregas ?? []) {
    const actual = conteosPorActividad.get(entrega.actividad_id) ?? {
      total: 0,
      pendientes: 0,
    };
    actual.total += 1;
    if (entrega.estado === "PENDIENTE") actual.pendientes += 1;
    conteosPorActividad.set(entrega.actividad_id, actual);
  }

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

  // evaluaciones.entrega_id es UNIQUE, así que Postgrest lo embebe como
  // objeto (o null), no como arreglo.
  type EntregaExamen = {
    actividad_id: string;
    evaluaciones: { calificacion_final: number } | null;
  };

  const { data: entregasExamen } = (
    examenIds.length > 0
      ? await supabase
          .from("entregas")
          .select("actividad_id, evaluaciones(calificacion_final)")
          .in("actividad_id", examenIds)
      : { data: [] }
  ) as { data: EntregaExamen[] | null };

  const statsPorExamen = new Map<
    string,
    { presentados: number; sumaCalif: number; conCalif: number }
  >();
  for (const entrega of entregasExamen ?? []) {
    const actual = statsPorExamen.get(entrega.actividad_id) ?? {
      presentados: 0,
      sumaCalif: 0,
      conCalif: 0,
    };
    actual.presentados += 1;
    if (entrega.evaluaciones) {
      actual.sumaCalif += entrega.evaluaciones.calificacion_final;
      actual.conCalif += 1;
    }
    statsPorExamen.set(entrega.actividad_id, actual);
  }

  const { data: sesionesAsistencia } = await supabase
    .from("sesiones_asistencia")
    .select("id, fecha")
    .eq("curso_id", id)
    .order("fecha", { ascending: false });

  const sesionIds = (sesionesAsistencia ?? []).map((s) => s.id);
  const { data: asistenciasTodas } =
    sesionIds.length > 0
      ? await supabase
          .from("asistencias")
          .select("sesion_id, estado")
          .in("sesion_id", sesionIds)
      : { data: [] };

  const conteoPorSesion = new Map<
    string,
    { presentes: number; ausentes: number }
  >();
  for (const a of asistenciasTodas ?? []) {
    const actual = conteoPorSesion.get(a.sesion_id) ?? {
      presentes: 0,
      ausentes: 0,
    };
    if (a.estado === "presente") actual.presentes += 1;
    else actual.ausentes += 1;
    conteoPorSesion.set(a.sesion_id, actual);
  }

  // Precarga las preguntas (con `correcta`) para el formulario de edición.
  // Solo llega a este punto quien ya se confirmó como docente dueño del
  // curso más arriba, así que es seguro usar la secret key aquí.
  type PreguntaConCorrecta = {
    actividad_id: string;
    enunciado: string;
    opciones: string[];
    correcta: string;
    puntos: number;
  };

  const preguntasPorExamen = new Map<string, PreguntaConCorrecta[]>();
  if (examenIds.length > 0) {
    const admin = createAdminClient();
    const { data: preguntas } = await admin
      .from("preguntas_examen")
      .select("actividad_id, enunciado, opciones, correcta, puntos")
      .in("actividad_id", examenIds)
      .order("orden", { ascending: true });

    for (const pregunta of (preguntas ?? []) as PreguntaConCorrecta[]) {
      const actual = preguntasPorExamen.get(pregunta.actividad_id) ?? [];
      actual.push(pregunta);
      preguntasPorExamen.set(pregunta.actividad_id, actual);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-10 px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <Link href="/docente" className="link-muted">
          ← Mis cursos
        </Link>
        <h1 className="mt-2 font-title text-2xl text-verde-bosque">
          {curso.nombre}
        </h1>
        <p className="mt-1 text-sm text-ink/70">
          {curso.grupo} · {curso.periodo}
        </p>
        <span className="clave-acceso mt-2">{curso.clave_acceso}</span>
      </div>

      <FormularioConfiguracion
        cursoId={curso.id}
        porcentajes={{
          porcentaje_examenes: curso.porcentaje_examenes,
          porcentaje_tareas: curso.porcentaje_tareas,
          porcentaje_asistencia: curso.porcentaje_asistencia,
        }}
      />

      <FormularioActividad cursoId={curso.id} />

      <section className="w-full max-w-sm">
        <h2 className="font-title text-xl text-verde-bosque">Tareas</h2>

        {!actividades || actividades.length === 0 ? (
          <p className="mt-4 text-sm text-ink/60">
            Todavía no has creado ninguna tarea.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {actividades.map((actividad) => (
              <TarjetaTarea
                key={actividad.id}
                actividad={actividad}
                cursoId={curso.id}
                conteo={
                  conteosPorActividad.get(actividad.id) ?? {
                    total: 0,
                    pendientes: 0,
                  }
                }
              />
            ))}
          </ul>
        )}
      </section>

      <FormularioCrearExamen cursoId={curso.id} />

      <section className="w-full max-w-sm">
        <h2 className="font-title text-xl text-verde-bosque">Exámenes</h2>

        {!examenes || examenes.length === 0 ? (
          <p className="mt-4 text-sm text-ink/60">
            Todavía no has creado ningún examen.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {examenes.map((examen) => (
              <TarjetaExamen
                key={examen.id}
                examen={examen}
                cursoId={curso.id}
                stats={
                  statsPorExamen.get(examen.id) ?? {
                    presentados: 0,
                    sumaCalif: 0,
                    conCalif: 0,
                  }
                }
                preguntas={preguntasPorExamen.get(examen.id) ?? []}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="w-full max-w-sm">
        <h2 className="font-title text-xl text-verde-bosque">Asistencia</h2>

        <div className="mt-4">
          <BotonTomarAsistencia cursoId={curso.id} />
        </div>

        {!sesionesAsistencia || sesionesAsistencia.length === 0 ? (
          <p className="mt-4 text-sm text-ink/60">
            Todavía no has tomado asistencia.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {sesionesAsistencia.map((sesion) => {
              const conteo = conteoPorSesion.get(sesion.id) ?? {
                presentes: 0,
                ausentes: 0,
              };
              return (
                <li key={sesion.id} className="card p-4">
                  <Link
                    href={`/docente/cursos/${curso.id}/asistencia/${sesion.fecha}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {new Date(`${sesion.fecha}T00:00:00`).toLocaleDateString(
                      "es-MX",
                      { year: "numeric", month: "long", day: "numeric" }
                    )}
                  </Link>
                  <p className="mt-1 text-xs text-ink/50">
                    {conteo.presentes} presentes · {conteo.ausentes} ausentes
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
