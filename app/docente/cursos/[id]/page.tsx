import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contarPendientesCurso } from "@/lib/pendientes-docente";
import EncabezadoCurso from "./encabezado-curso";
import FranjaPestanas from "./franja-pestanas";
import FormularioConfiguracion from "./formulario-configuracion";
import FormularioDuplicarCurso from "./formulario-duplicar-curso";
import BotonArchivarCurso from "./boton-archivar-curso";

export default async function ResumenCurso({
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
      "id, nombre, grupo, periodo, clave_acceso, porcentaje_examenes, porcentaje_tareas, porcentaje_asistencia, archivado_at"
    )
    .eq("id", id)
    .eq("docente_id", user.id)
    .single();

  if (!curso) redirect("/docente");

  const pendientes = await contarPendientesCurso(supabase, id);

  const { count: totalActividades } = await supabase
    .from("actividades")
    .select("id", { count: "exact", head: true })
    .eq("curso_id", id);

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-4 py-16">
      <EncabezadoCurso curso={curso} />
      {curso.archivado_at && (
        <p className="card w-full max-w-sm p-4 text-center text-sm text-ink/80">
          Curso archivado el{" "}
          {new Date(curso.archivado_at).toLocaleDateString("es-MX", {
            timeZone: "America/Mexico_City",
            dateStyle: "long",
          })}
          . No aparece en tu lista principal ni acepta inscripciones nuevas.
        </p>
      )}
      <FranjaPestanas
        cursoId={curso.id}
        activa="resumen"
        pendientes={pendientes}
      />

      <FormularioConfiguracion
        cursoId={curso.id}
        porcentajes={{
          porcentaje_examenes: curso.porcentaje_examenes,
          porcentaje_tareas: curso.porcentaje_tareas,
          porcentaje_asistencia: curso.porcentaje_asistencia,
        }}
      />

      <FormularioDuplicarCurso
        cursoId={curso.id}
        curso={{ nombre: curso.nombre, grupo: curso.grupo, periodo: curso.periodo }}
        totalActividades={totalActividades ?? 0}
      />

      <BotonArchivarCurso cursoId={curso.id} archivado={curso.archivado_at !== null} />
    </main>
  );
}
