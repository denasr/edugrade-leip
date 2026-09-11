import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { compararPorCierre } from "@/lib/actividades";
import { contarPendientesTareas } from "../datos-compartidos";
import EncabezadoCurso from "../encabezado-curso";
import FranjaPestanas from "../franja-pestanas";
import FormularioCrearExamen from "../formulario-crear-examen";
import TarjetaExamen from "../tarjeta-examen";

export default async function ExamenesCurso({
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

  const [{ data: examenes }, pendientesTareas] = await Promise.all([
    supabase
      .from("actividades")
      .select(
        "id, titulo, instrucciones, fecha_apertura, fecha_cierre, bloqueado_manual, visible_estudiantes"
      )
      .eq("curso_id", id)
      .eq("tipo", "EXAMEN")
      .order("created_at", { ascending: false }),
    contarPendientesTareas(supabase, id),
  ]);

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
    <main className="flex flex-1 flex-col items-center gap-8 px-4 py-16">
      <EncabezadoCurso curso={curso} />
      <FranjaPestanas
        cursoId={curso.id}
        activa="examenes"
        pendientesTareas={pendientesTareas}
      />

      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <FormularioCrearExamen cursoId={curso.id} />

        <section className="w-full">
          <h2 className="font-title text-xl text-verde-bosque">Exámenes</h2>

          {!examenes || examenes.length === 0 ? (
            <p className="mt-4 text-sm text-ink/70">
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
      </div>
    </main>
  );
}
