import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FormularioCurso from "./formulario-curso";

export default async function PanelDocente() {
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

  if (perfil?.rol !== "DOCENTE") redirect("/estudiante");

  const { data: cursos } = await supabase
    .from("cursos")
    .select("id, nombre, grupo, periodo, clave_acceso, inscripciones(count)")
    .eq("docente_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="flex flex-1 flex-col items-center gap-10 px-4 py-16">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Panel del docente
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Bienvenido, {perfil.nombre_completo}.
        </p>
      </div>

      <FormularioCurso />

      <section className="w-full max-w-sm">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Mis cursos
        </h2>

        {!cursos || cursos.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            Todavía no has creado ningún curso.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {cursos.map((curso) => (
              <li
                key={curso.id}
                className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {curso.nombre}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {curso.grupo} · {curso.periodo}
                </p>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="rounded bg-zinc-100 px-2 py-1 font-mono text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50">
                    {curso.clave_acceso}
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {curso.inscripciones[0]?.count ?? 0} inscritos
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
