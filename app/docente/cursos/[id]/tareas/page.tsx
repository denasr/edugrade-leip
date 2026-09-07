import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { compararPorCierre } from "@/lib/actividades";
import EncabezadoCurso from "../encabezado-curso";
import FranjaPestanas from "../franja-pestanas";
import FormularioActividad from "../formulario-actividad";
import TarjetaTarea from "../tarjeta-tarea";

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

  const pendientesTareas = Array.from(conteosPorActividad.values()).reduce(
    (suma, c) => suma + c.pendientes,
    0
  );

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-4 py-16">
      <EncabezadoCurso curso={curso} />
      <FranjaPestanas
        cursoId={curso.id}
        activa="tareas"
        pendientesTareas={pendientesTareas}
      />

      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <FormularioActividad cursoId={curso.id} />

        <section className="w-full">
          <h2 className="font-title text-xl text-verde-bosque">Tareas</h2>

          {!actividades || actividades.length === 0 ? (
            <p className="mt-4 text-sm text-ink/70">
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
      </div>
    </main>
  );
}
