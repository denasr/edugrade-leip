import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contarPendientesTareas } from "./datos-compartidos";
import EncabezadoCurso from "./encabezado-curso";
import FranjaPestanas from "./franja-pestanas";
import FormularioConfiguracion from "./formulario-configuracion";

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
      "id, nombre, grupo, periodo, clave_acceso, porcentaje_examenes, porcentaje_tareas, porcentaje_asistencia"
    )
    .eq("id", id)
    .eq("docente_id", user.id)
    .single();

  if (!curso) redirect("/docente");

  const pendientesTareas = await contarPendientesTareas(supabase, id);

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-4 py-16">
      <EncabezadoCurso curso={curso} />
      <FranjaPestanas
        cursoId={curso.id}
        activa="resumen"
        pendientesTareas={pendientesTareas}
      />

      <FormularioConfiguracion
        cursoId={curso.id}
        porcentajes={{
          porcentaje_examenes: curso.porcentaje_examenes,
          porcentaje_tareas: curso.porcentaje_tareas,
          porcentaje_asistencia: curso.porcentaje_asistencia,
        }}
      />
    </main>
  );
}
