import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { compararPorCierre } from "@/lib/actividades";
import EncabezadoCurso from "../encabezado-curso";
import FranjaPestanas from "../franja-pestanas";
import FormularioActividad from "../formulario-actividad";
import FormularioCrearExamen from "../formulario-crear-examen";
import TarjetaTarea from "../tarjeta-tarea";
import TarjetaExamen from "../tarjeta-examen";

export default async function TareasCurso({
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
    .select("id, nombre, grupo, periodo, clave_acceso")
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

  // "Cuestionario": misma tarea (tipo="TAREA", cuenta para porcentaje_tareas)
  // pero con preguntas de opción múltiple autocalificadas en vez de un
  // archivo — se distingue únicamente por tener filas en preguntas_examen,
  // no hay una columna aparte para marcarlo. Esa tabla no tiene ninguna
  // policy de RLS (ver CLAUDE.md), así que esta consulta va con la secret
  // key — el curso ya se verificó como propio del docente arriba.
  const admin = createAdminClient();
  const { data: preguntasTodas } =
    actividadIds.length > 0
      ? await admin
          .from("preguntas_examen")
          .select("actividad_id")
          .in("actividad_id", actividadIds)
      : { data: [] };
  const idsCuestionarios = new Set(
    (preguntasTodas ?? []).map((p) => p.actividad_id)
  );

  type EntregaConEvaluacion = {
    actividad_id: string;
    estado: string;
    evaluaciones: { calificacion_final: number } | null;
  };

  const { data: entregas } = (
    actividadIds.length > 0
      ? await supabase
          .from("entregas")
          .select("actividad_id, estado, evaluaciones(calificacion_final)")
          .in("actividad_id", actividadIds)
      : { data: [] }
  ) as { data: EntregaConEvaluacion[] | null };

  const conteosPorActividad = new Map<
    string,
    { total: number; pendientes: number }
  >();
  const statsPorCuestionario = new Map<
    string,
    { presentados: number; sumaCalif: number; conCalif: number }
  >();
  for (const entrega of entregas ?? []) {
    if (idsCuestionarios.has(entrega.actividad_id)) {
      const actual = statsPorCuestionario.get(entrega.actividad_id) ?? {
        presentados: 0,
        sumaCalif: 0,
        conCalif: 0,
      };
      actual.presentados += 1;
      if (entrega.evaluaciones) {
        actual.sumaCalif += entrega.evaluaciones.calificacion_final;
        actual.conCalif += 1;
      }
      statsPorCuestionario.set(entrega.actividad_id, actual);
    } else {
      const actual = conteosPorActividad.get(entrega.actividad_id) ?? {
        total: 0,
        pendientes: 0,
      };
      actual.total += 1;
      if (entrega.estado === "PENDIENTE") actual.pendientes += 1;
      conteosPorActividad.set(entrega.actividad_id, actual);
    }
  }

  // Pendientes de calificar a mano (archivo) + lo que un cuestionario
  // pudiera dejar sin autocalificar por un fallo raro (ver
  // presentarExamen) — ambos casos genuinamente necesitan atención.
  const pendientesTareas =
    Array.from(conteosPorActividad.values()).reduce(
      (suma, c) => suma + c.pendientes,
      0
    ) +
    Array.from(statsPorCuestionario.values()).reduce(
      (suma, s) => suma + (s.presentados - s.conCalif),
      0
    );

  // Precarga las preguntas (con `correcta`) de cada cuestionario para su
  // formulario de edición — mismo patrón que ya usa la pestaña Exámenes.
  type PreguntaConCorrecta = {
    actividad_id: string;
    enunciado: string;
    opciones: string[];
    correcta: string;
    puntos: number;
  };

  const preguntasPorActividad = new Map<string, PreguntaConCorrecta[]>();
  if (idsCuestionarios.size > 0) {
    const { data: preguntas } = await admin
      .from("preguntas_examen")
      .select("actividad_id, enunciado, opciones, correcta, puntos")
      .in("actividad_id", Array.from(idsCuestionarios))
      .order("orden", { ascending: true });

    for (const pregunta of (preguntas ?? []) as PreguntaConCorrecta[]) {
      const actual = preguntasPorActividad.get(pregunta.actividad_id) ?? [];
      actual.push(pregunta);
      preguntasPorActividad.set(pregunta.actividad_id, actual);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-4 py-16">
      <EncabezadoCurso curso={curso} />
      <FranjaPestanas
        cursoId={curso.id}
        activa="tareas"
        pendientesTareas={pendientesTareas}
      />

      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex w-full flex-col items-center gap-3">
          <FormularioActividad cursoId={curso.id} />
          <FormularioCrearExamen cursoId={curso.id} tipo="TAREA" />
        </div>

        <section className="w-full">
          <h2 className="font-title text-xl text-verde-bosque">Tareas</h2>

          {!actividades || actividades.length === 0 ? (
            <p className="mt-4 text-sm text-ink/70">
              Todavía no has creado ninguna tarea.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {actividades.map((actividad) =>
                idsCuestionarios.has(actividad.id) ? (
                  <TarjetaExamen
                    key={actividad.id}
                    examen={actividad}
                    cursoId={curso.id}
                    tipo="TAREA"
                    stats={
                      statsPorCuestionario.get(actividad.id) ?? {
                        presentados: 0,
                        sumaCalif: 0,
                        conCalif: 0,
                      }
                    }
                    preguntas={preguntasPorActividad.get(actividad.id) ?? []}
                  />
                ) : (
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
                )
              )}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
