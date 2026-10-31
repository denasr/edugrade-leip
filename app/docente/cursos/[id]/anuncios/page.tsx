import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contarPendientesTareas } from "@/lib/pendientes-docente";
import { COLUMNAS_ANUNCIO, type Anuncio } from "@/lib/anuncios";
import EncabezadoCurso from "../encabezado-curso";
import FranjaPestanas from "../franja-pestanas";
import FormularioAnuncio from "./formulario-anuncio";
import TarjetaAnuncio from "./tarjeta-anuncio";

export default async function AnunciosCurso({
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

  // Fijados primero, después del más nuevo al más viejo — mismo orden que
  // ve el estudiante en la página del curso.
  const { data: anuncios } = (await supabase
    .from("anuncios")
    .select(COLUMNAS_ANUNCIO)
    .eq("curso_id", id)
    .order("fijado", { ascending: false })
    .order("created_at", { ascending: false })) as { data: Anuncio[] | null };

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-4 py-16">
      <EncabezadoCurso curso={curso} />
      <FranjaPestanas
        cursoId={curso.id}
        activa="anuncios"
        pendientesTareas={pendientesTareas}
      />

      <section className="flex w-full max-w-sm flex-col gap-4">
        <FormularioAnuncio cursoId={curso.id} />

        {!anuncios || anuncios.length === 0 ? (
          <p className="text-sm text-ink/70">
            Todavía no has publicado anuncios. Lo que publiques aquí lo verán
            todos los estudiantes inscritos en este curso.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {anuncios.map((anuncio) => (
              <TarjetaAnuncio key={anuncio.id} cursoId={curso.id} anuncio={anuncio} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
