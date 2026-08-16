import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { estadoActividad } from "@/lib/actividades";
import FormularioActividad from "./formulario-actividad";
import FormularioCrearExamen from "./formulario-crear-examen";
import BotonEliminarActividad from "./boton-eliminar-actividad";
import { alternarBloqueo, eliminarActividad } from "./actions";

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

  if (!user) redirect("/registro");

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
      "id, titulo, instrucciones, fecha_apertura, fecha_cierre, ponderacion, bloqueado_manual, materiales_actividad(nombre_archivo)"
    )
    .eq("curso_id", id)
    .eq("tipo", "TAREA")
    .order("created_at", { ascending: false });

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
      "id, titulo, instrucciones, fecha_apertura, fecha_cierre, ponderacion, bloqueado_manual"
    )
    .eq("curso_id", id)
    .eq("tipo", "EXAMEN")
    .order("created_at", { ascending: false });

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

  return (
    <main className="flex flex-1 flex-col items-center gap-10 px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <Link
          href="/docente"
          className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
        >
          ← Mis cursos
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {curso.nombre}
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {curso.grupo} · {curso.periodo}
        </p>
        <span className="mt-2 inline-block rounded bg-zinc-100 px-2 py-1 font-mono text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50">
          {curso.clave_acceso}
        </span>
      </div>

      <FormularioActividad cursoId={curso.id} />

      <section className="w-full max-w-sm">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Tareas
        </h2>

        {!actividades || actividades.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            Todavía no has creado ninguna tarea.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {actividades.map((actividad) => {
              const estado = estadoActividad(actividad);
              const conteo = conteosPorActividad.get(actividad.id) ?? {
                total: 0,
                pendientes: 0,
              };
              const alternarBloqueoAction = alternarBloqueo.bind(
                null,
                curso.id,
                actividad.id,
                !actividad.bloqueado_manual
              );
              const eliminarActividadAction = eliminarActividad.bind(
                null,
                curso.id,
                actividad.id
              );

              return (
                <li
                  key={actividad.id}
                  className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/docente/actividades/${actividad.id}`}
                      className="font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                    >
                      {actividad.titulo}
                    </Link>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                        estado === "ABIERTA"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {estado === "ABIERTA" ? "Abierta" : "Cerrada"}
                    </span>
                  </div>

                  <Link
                    href={`/docente/actividades/${actividad.id}`}
                    className="mt-1 inline-block text-xs text-zinc-500 hover:underline dark:text-zinc-500"
                  >
                    {conteo.total} entregas · {conteo.pendientes} pendientes
                  </Link>

                  {actividad.instrucciones && (
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {actividad.instrucciones}
                    </p>
                  )}

                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                    {actividad.fecha_apertura
                      ? `Abre ${new Date(
                          actividad.fecha_apertura
                        ).toLocaleString("es-MX")} · `
                      : ""}
                    Cierra{" "}
                    {new Date(actividad.fecha_cierre).toLocaleString("es-MX")}
                    {" · "}
                    Ponderación {actividad.ponderacion}
                  </p>

                  {actividad.materiales_actividad.length > 0 && (
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                      Material: {actividad.materiales_actividad[0].nombre_archivo}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-4">
                    <form action={alternarBloqueoAction}>
                      <button
                        type="submit"
                        className="text-sm text-zinc-700 hover:underline dark:text-zinc-300"
                      >
                        {actividad.bloqueado_manual
                          ? "Desbloquear"
                          : "Bloquear"}
                      </button>
                    </form>
                    <BotonEliminarActividad
                      accion={eliminarActividadAction}
                      titulo={actividad.titulo}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <FormularioCrearExamen cursoId={curso.id} />

      <section className="w-full max-w-sm">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Exámenes
        </h2>

        {!examenes || examenes.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            Todavía no has creado ningún examen.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {examenes.map((examen) => {
              const estado = estadoActividad(examen);
              const stats = statsPorExamen.get(examen.id) ?? {
                presentados: 0,
                sumaCalif: 0,
                conCalif: 0,
              };
              const promedio =
                stats.conCalif > 0
                  ? (stats.sumaCalif / stats.conCalif).toFixed(1)
                  : "—";
              const alternarBloqueoAction = alternarBloqueo.bind(
                null,
                curso.id,
                examen.id,
                !examen.bloqueado_manual
              );
              const eliminarActividadAction = eliminarActividad.bind(
                null,
                curso.id,
                examen.id
              );

              return (
                <li
                  key={examen.id}
                  className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">
                      {examen.titulo}
                    </p>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                        estado === "ABIERTA"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {estado === "ABIERTA" ? "Abierta" : "Cerrada"}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                    {stats.presentados} presentados · promedio {promedio}/10
                  </p>

                  {examen.instrucciones && (
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {examen.instrucciones}
                    </p>
                  )}

                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                    {examen.fecha_apertura
                      ? `Abre ${new Date(
                          examen.fecha_apertura
                        ).toLocaleString("es-MX")} · `
                      : ""}
                    Cierra{" "}
                    {new Date(examen.fecha_cierre).toLocaleString("es-MX")}
                    {" · "}
                    Ponderación {examen.ponderacion}
                  </p>

                  <div className="mt-3 flex items-center gap-4">
                    <form action={alternarBloqueoAction}>
                      <button
                        type="submit"
                        className="text-sm text-zinc-700 hover:underline dark:text-zinc-300"
                      >
                        {examen.bloqueado_manual ? "Desbloquear" : "Bloquear"}
                      </button>
                    </form>
                    <BotonEliminarActividad
                      accion={eliminarActividadAction}
                      titulo={examen.titulo}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
