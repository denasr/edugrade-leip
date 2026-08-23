import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import FormularioAsistencia from "./formulario-asistencia";

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export default async function AsistenciaFecha({
  params,
}: {
  params: Promise<{ id: string; fecha: string }>;
}) {
  const { id, fecha } = await params;

  if (!FECHA_REGEX.test(fecha)) {
    redirect(`/docente/cursos/${id}`);
  }

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
    .select("id, nombre")
    .eq("id", id)
    .eq("docente_id", user.id)
    .single();

  if (!curso) redirect("/docente");

  let { data: sesion } = await supabase
    .from("sesiones_asistencia")
    .select("id, fecha")
    .eq("curso_id", id)
    .eq("fecha", fecha)
    .maybeSingle();

  if (!sesion) {
    const { data: nuevaSesion, error } = await supabase
      .from("sesiones_asistencia")
      .insert({ curso_id: id, fecha, creado_por: user.id })
      .select("id, fecha")
      .single();

    if (nuevaSesion) {
      sesion = nuevaSesion;
    } else if (error?.code === "23505") {
      // Carrera: otra petición ya creó la sesión de este día. La leemos.
      const { data: sesionExistente } = await supabase
        .from("sesiones_asistencia")
        .select("id, fecha")
        .eq("curso_id", id)
        .eq("fecha", fecha)
        .single();
      sesion = sesionExistente;
    }
  }

  if (!sesion) redirect(`/docente/cursos/${id}`);

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

  const { data: asistenciasActuales } = await supabase
    .from("asistencias")
    .select("estudiante_id, estado")
    .eq("sesion_id", sesion.id);

  const estadoPorEstudiante = new Map(
    (asistenciasActuales ?? []).map((a) => [a.estudiante_id, a.estado])
  );

  const estudiantes = (perfilesEstudiantes ?? []).map((p) => ({
    id: p.id,
    nombre_completo: p.nombre_completo,
    estado: estadoPorEstudiante.get(p.id) ?? "presente",
  }));

  const fechaLegible = new Date(`${fecha}T00:00:00`).toLocaleDateString(
    "es-MX",
    { weekday: "long", year: "numeric", month: "long", day: "numeric" }
  );

  return (
    <main className="flex flex-1 flex-col items-center gap-10 px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <Link href={`/docente/cursos/${id}`} className="link-muted">
          ← {curso.nombre}
        </Link>
        <h1 className="mt-2 font-title text-2xl text-verde-bosque">
          Asistencia
        </h1>
        <p className="mt-1 text-sm text-ink/70">{fechaLegible}</p>
      </div>

      {estudiantes.length === 0 ? (
        <p className="text-sm text-ink/70">
          Todavía no hay estudiantes inscritos en este curso.
        </p>
      ) : (
        <FormularioAsistencia
          cursoId={id}
          sesionId={sesion.id}
          estudiantes={estudiantes}
        />
      )}
    </main>
  );
}
