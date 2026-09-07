import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { contarPendientesTareas } from "../datos-compartidos";
import EncabezadoCurso from "../encabezado-curso";
import FranjaPestanas from "../franja-pestanas";
import ModalEliminarEstudiante from "../modal-eliminar-estudiante";
import { eliminarEstudianteDeCurso } from "../actions";

export default async function EstudiantesCurso({
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

  // Mismo patrón de dos consultas que ya usa la toma de asistencia:
  // inscripciones no tiene FK directa a perfiles (ambas apuntan a
  // auth.users, pero no entre sí), así que no se puede embeber en una sola
  // llamada.
  const { data: inscripciones } = await supabase
    .from("inscripciones")
    .select("estudiante_id")
    .eq("curso_id", id);

  const estudianteIds = (inscripciones ?? []).map((i) => i.estudiante_id);

  const { data: perfilesEstudiantes } =
    estudianteIds.length > 0
      ? await supabase
          .from("perfiles")
          .select("id, nombre_completo")
          .in("id", estudianteIds)
          .order("nombre_completo", { ascending: true })
      : { data: [] };

  // El correo no vive en perfiles, solo en auth.users, sin RLS accesible
  // desde el cliente normal. Ya se verificó arriba (con el cliente normal)
  // que quien pide esto es el docente dueño del curso, y estos IDs ya
  // salieron de inscripciones filtradas por ese mismo curso — así que aquí
  // se usa la secret key nada más para leer el correo puntual de cada uno,
  // mismo patrón que preguntas_examen/asistencia (ver CLAUDE.md).
  const admin = createAdminClient();
  const correoPorId = new Map<string, string>();
  await Promise.all(
    estudianteIds.map(async (estudianteId) => {
      const { data } = await admin.auth.admin.getUserById(estudianteId);
      if (data.user?.email) correoPorId.set(estudianteId, data.user.email);
    })
  );

  const estudiantesInscritos = (perfilesEstudiantes ?? []).map((p) => ({
    id: p.id,
    nombre_completo: p.nombre_completo,
    correo: correoPorId.get(p.id) ?? "—",
  }));

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-4 py-16">
      <EncabezadoCurso curso={curso} />
      <FranjaPestanas
        cursoId={curso.id}
        activa="estudiantes"
        pendientesTareas={pendientesTareas}
      />

      <section className="w-full max-w-sm">
        {estudiantesInscritos.length === 0 ? (
          <p className="text-sm text-ink/70">
            Todavía no hay estudiantes inscritos en este curso.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {estudiantesInscritos.map((estudiante) => (
              <li
                key={estudiante.id}
                className="card flex items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">
                    {estudiante.nombre_completo}
                  </p>
                  <p className="truncate text-sm text-ink/70">
                    {estudiante.correo}
                  </p>
                </div>
                <ModalEliminarEstudiante
                  accion={eliminarEstudianteDeCurso.bind(
                    null,
                    curso.id,
                    estudiante.id
                  )}
                  nombreCompleto={estudiante.nombre_completo}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
