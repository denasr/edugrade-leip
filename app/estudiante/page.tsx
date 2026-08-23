import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import FormularioInscripcion from "./formulario-inscripcion";

// select("cursos(...)") es una relación many-to-one (FK en inscripciones),
// así que Postgrest devuelve un objeto; el tipado por defecto de supabase-js
// (sin generar tipos desde el esquema) lo infiere como arreglo, por eso el cast.
type InscripcionConCurso = {
  id: string;
  cursos: { id: string; nombre: string; grupo: string; periodo: string } | null;
};

export default async function PanelEstudiante() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol, nombre_completo")
    .eq("id", user.id)
    .single();

  if (perfil?.rol !== "ESTUDIANTE") redirect("/docente");

  const { data: inscripciones } = (await supabase
    .from("inscripciones")
    .select("id, cursos(id, nombre, grupo, periodo)")
    .eq("estudiante_id", user.id)
    .order("created_at", { ascending: false })) as {
    data: InscripcionConCurso[] | null;
  };

  return (
    <main className="flex flex-1 flex-col items-center gap-10 px-4 py-16">
      <div className="text-center">
        <h1 className="font-title text-2xl text-verde-bosque">
          Panel del estudiante
        </h1>
        <p className="mt-2 text-sm text-ink/70">
          Bienvenido, {perfil.nombre_completo}.
        </p>
      </div>

      {!inscripciones || inscripciones.length === 0 ? (
        <FormularioInscripcion />
      ) : (
        <section className="w-full max-w-sm">
          <h2 className="font-title text-xl text-verde-bosque">
            Mis cursos
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            {inscripciones.map((inscripcion) => {
              const curso = inscripcion.cursos;
              if (!curso) return null;
              return (
                <li
                  key={inscripcion.id}
                  className="card p-4 transition-shadow hover:shadow-md"
                >
                  <Link href={`/estudiante/cursos/${curso.id}`}>
                    <p className="font-medium text-ink">{curso.nombre}</p>
                    <p className="text-sm text-ink/70">
                      {curso.grupo} · {curso.periodo}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
