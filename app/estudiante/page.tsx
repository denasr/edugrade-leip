import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FormularioInscripcion from "./formulario-inscripcion";

// select("cursos(...)") es una relación many-to-one (FK en inscripciones),
// así que Postgrest devuelve un objeto; el tipado por defecto de supabase-js
// (sin generar tipos desde el esquema) lo infiere como arreglo, por eso el cast.
type InscripcionConCurso = {
  id: string;
  cursos: { nombre: string; grupo: string; periodo: string } | null;
};

export default async function PanelEstudiante() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/registro");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol, nombre_completo")
    .eq("id", user.id)
    .single();

  if (perfil?.rol !== "ESTUDIANTE") redirect("/docente");

  const { data: inscripciones } = (await supabase
    .from("inscripciones")
    .select("id, cursos(nombre, grupo, periodo)")
    .eq("estudiante_id", user.id)
    .order("created_at", { ascending: false })) as {
    data: InscripcionConCurso[] | null;
  };

  return (
    <main className="flex flex-1 flex-col items-center gap-10 px-4 py-16">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Panel del estudiante
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Bienvenido, {perfil.nombre_completo}.
        </p>
      </div>

      {!inscripciones || inscripciones.length === 0 ? (
        <FormularioInscripcion />
      ) : (
        <section className="w-full max-w-sm">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Mis cursos
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            {inscripciones.map((inscripcion) => {
              const curso = inscripcion.cursos;
              return (
                <li
                  key={inscripcion.id}
                  className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {curso?.nombre}
                  </p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {curso?.grupo} · {curso?.periodo}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
