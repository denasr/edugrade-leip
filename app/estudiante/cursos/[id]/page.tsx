import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  estadoActividad,
  motivoCierre,
  compararPorCierre,
  textoRelativoCierre,
} from "@/lib/actividades";
import { IconoArchivo } from "@/lib/icono-archivo";
import FormularioEntrega from "./formulario-entrega";
import FormularioPresentarExamen from "./formulario-presentar-examen";

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
    .select("id")
    .eq("curso_id", id)
    .eq("estudiante_id", user.id)
    .maybeSingle();

  if (!inscripcion) redirect("/estudiante");

  const { data: curso } = await supabase
    .from("cursos")
    .select("nombre, grupo, periodo")
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

  const actividadesConEnlace = await Promise.all(
    (actividades ?? []).map(async (actividad) => {
      const material = actividad.materiales_actividad[0] ?? null;
      let enlaceDescarga: string | null = null;

      if (material) {
        const { data } = await supabase.storage
          .from("materiales-actividades")
          .createSignedUrl(material.storage_path, 60 * 10);
        enlaceDescarga = data?.signedUrl ?? null;
      }

      return {
        ...actividad,
        nombreArchivo: material?.nombre_archivo ?? null,
        enlaceDescarga,
        entrega: entregasPorActividad.get(actividad.id) ?? null,
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
          .select("actividad_id, evaluaciones(calificacion_final, comentarios)")
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

      <section className="w-full max-w-sm">
        <h2 className="font-title text-xl text-verde-bosque">Tareas</h2>

        {actividadesConEnlace.length === 0 ? (
          <p className="mt-4 text-sm text-ink/60">
            Todavía no hay tareas publicadas en este curso.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {actividadesConEnlace.map((actividad) => {
              const estado = estadoActividad(actividad);
              const evaluacion = actividad.entrega?.evaluaciones ?? null;
              const archivoEntregado =
                actividad.entrega?.archivos_entrega[0] ?? null;

              return (
                <li key={actividad.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-ink">{actividad.titulo}</p>
                    <span
                      className={
                        estado === "ABIERTA"
                          ? "badge-abierta"
                          : "badge-cerrada"
                      }
                    >
                      {estado === "ABIERTA" ? "Abierta" : "Cerrada"}
                    </span>
                  </div>

                  {actividad.instrucciones && (
                    <p className="mt-1 text-sm text-ink/70">
                      {actividad.instrucciones}
                    </p>
                  )}

                  <p className="mt-2 text-xs text-ink/50">
                    {actividad.fecha_apertura
                      ? `Abre ${new Date(
                          actividad.fecha_apertura
                        ).toLocaleString("es-MX")} · `
                      : ""}
                    Cierra{" "}
                    {new Date(actividad.fecha_cierre).toLocaleString("es-MX")}
                    {" ("}
                    {textoRelativoCierre(actividad.fecha_cierre)}
                    {")"}
                  </p>

                  {actividad.enlaceDescarga && (
                    <a
                      href={actividad.enlaceDescarga}
                      className="mt-2 flex items-center gap-1.5 text-sm font-medium text-verde-bosque hover:underline"
                    >
                      <IconoArchivo nombreArchivo={actividad.nombreArchivo ?? ""} />
                      Descargar {actividad.nombreArchivo}
                    </a>
                  )}

                  {actividad.entrega ? (
                    <div className="mt-3 border-t border-verde-bosque/15 pt-3 text-sm">
                      <p className="flex items-center gap-1.5 text-ink/70">
                        {archivoEntregado && (
                          <IconoArchivo
                            nombreArchivo={archivoEntregado.nombre_archivo}
                          />
                        )}
                        Entregaste: {archivoEntregado?.nombre_archivo}
                      </p>
                      {actividad.entrega.comentario_estudiante && (
                        <p className="mt-1 text-ink/70">
                          Tu comentario: {actividad.entrega.comentario_estudiante}
                        </p>
                      )}
                      {evaluacion ? (
                        <div className="mt-2">
                          <p className="font-medium text-ink">
                            Calificación: {evaluacion.calificacion_final}/10
                          </p>
                          {evaluacion.comentarios && (
                            <p className="mt-1 text-ink/70">
                              {evaluacion.comentarios}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="badge-pendiente mt-2">
                          Pendiente de calificar
                        </span>
                      )}
                    </div>
                  ) : estado === "ABIERTA" ? (
                    <FormularioEntrega actividadId={actividad.id} cursoId={id} />
                  ) : (
                    <p className="mt-3 border-t border-verde-bosque/15 pt-3 text-sm text-ink/50">
                      No se puede entregar. {motivoCierre(actividad)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="w-full max-w-sm">
        <h2 className="font-title text-xl text-verde-bosque">Exámenes</h2>

        {examenesConPreguntas.length === 0 ? (
          <p className="mt-4 text-sm text-ink/60">
            Todavía no hay exámenes publicados en este curso.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {examenesConPreguntas.map((examen) => {
              const estado = estadoActividad(examen);
              const evaluacion = examen.entrega?.evaluaciones ?? null;

              return (
                <li key={examen.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-ink">{examen.titulo}</p>
                    <span
                      className={
                        estado === "ABIERTA"
                          ? "badge-abierta"
                          : "badge-cerrada"
                      }
                    >
                      {estado === "ABIERTA" ? "Abierta" : "Cerrada"}
                    </span>
                  </div>

                  {examen.instrucciones && (
                    <p className="mt-1 text-sm text-ink/70">
                      {examen.instrucciones}
                    </p>
                  )}

                  <p className="mt-2 text-xs text-ink/50">
                    {examen.fecha_apertura
                      ? `Abre ${new Date(
                          examen.fecha_apertura
                        ).toLocaleString("es-MX")} · `
                      : ""}
                    Cierra{" "}
                    {new Date(examen.fecha_cierre).toLocaleString("es-MX")}
                    {" ("}
                    {textoRelativoCierre(examen.fecha_cierre)}
                    {")"}
                  </p>

                  {examen.entrega ? (
                    <div className="mt-3 border-t border-verde-bosque/15 pt-3 text-sm">
                      {evaluacion ? (
                        <p className="font-medium text-ink">
                          Calificación: {evaluacion.calificacion_final}/10
                        </p>
                      ) : (
                        <span className="badge-pendiente">
                          Presentado, calificando…
                        </span>
                      )}
                    </div>
                  ) : estado === "ABIERTA" ? (
                    <FormularioPresentarExamen
                      actividadId={examen.id}
                      cursoId={id}
                      preguntas={examen.preguntas}
                    />
                  ) : (
                    <p className="mt-3 border-t border-verde-bosque/15 pt-3 text-sm text-ink/50">
                      No se puede presentar. {motivoCierre(examen)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
