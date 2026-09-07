import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contarPendientesTareas } from "../datos-compartidos";
import EncabezadoCurso from "../encabezado-curso";
import FranjaPestanas from "../franja-pestanas";
import BotonTomarAsistencia from "../boton-tomar-asistencia";
import BotonEliminarSesion from "../boton-eliminar-sesion";
import { eliminarSesionAsistencia } from "../actions";

export default async function AsistenciaCurso({
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

  const pendientesTareas = await contarPendientesTareas(supabase, id);

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
    { presentes: number; ausentes: number; justificados: number }
  >();
  for (const a of asistenciasTodas ?? []) {
    const actual = conteoPorSesion.get(a.sesion_id) ?? {
      presentes: 0,
      ausentes: 0,
      justificados: 0,
    };
    if (a.estado === "presente") actual.presentes += 1;
    else if (a.estado === "ausente") actual.ausentes += 1;
    else if (a.estado === "justificado") actual.justificados += 1;
    conteoPorSesion.set(a.sesion_id, actual);
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-4 py-16">
      <EncabezadoCurso curso={curso} />
      <FranjaPestanas
        cursoId={curso.id}
        activa="asistencia"
        pendientesTareas={pendientesTareas}
      />

      <section className="w-full max-w-sm">
        <BotonTomarAsistencia cursoId={curso.id} />

        {!sesionesAsistencia || sesionesAsistencia.length === 0 ? (
          <p className="mt-4 text-sm text-ink/70">
            Todavía no has tomado asistencia.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {sesionesAsistencia.map((sesion) => {
              const conteo = conteoPorSesion.get(sesion.id) ?? {
                presentes: 0,
                ausentes: 0,
                justificados: 0,
              };
              const fechaLegible = new Date(
                `${sesion.fecha}T00:00:00`
              ).toLocaleDateString("es-MX", {
                year: "numeric",
                month: "long",
                day: "numeric",
              });
              const eliminarSesionAction = eliminarSesionAsistencia.bind(
                null,
                curso.id,
                sesion.id
              );
              return (
                <li key={sesion.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/docente/cursos/${curso.id}/asistencia/${sesion.fecha}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {fechaLegible}
                    </Link>
                    <BotonEliminarSesion
                      accion={eliminarSesionAction}
                      fechaLegible={fechaLegible}
                    />
                  </div>
                  <p className="mt-1 text-xs text-ink/70">
                    {conteo.presentes} presentes · {conteo.ausentes} ausentes ·{" "}
                    {conteo.justificados} justificados
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
