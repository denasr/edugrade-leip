import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import FormularioCurso from "./formulario-curso";

export default async function PanelDocente() {
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

  if (perfil?.rol !== "DOCENTE") redirect("/estudiante");

  const { data: cursos } = await supabase
    .from("cursos")
    .select("id, nombre, grupo, periodo, clave_acceso, inscripciones(count)")
    .eq("docente_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="flex flex-1 flex-col items-center gap-10 px-4 py-16">
      <div className="text-center">
        <h1 className="font-title text-2xl text-verde-bosque">
          Panel del docente
        </h1>
        <p className="mt-2 text-sm text-ink/70">
          Bienvenido, {perfil.nombre_completo}.
        </p>
      </div>

      <FormularioCurso />

      <section className="w-full max-w-sm">
        <h2 className="font-title text-xl text-verde-bosque">Mis cursos</h2>

        {!cursos || cursos.length === 0 ? (
          <p className="mt-4 text-sm text-ink/70">
            Todavía no has creado ningún curso.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {cursos.map((curso) => (
              <li
                key={curso.id}
                className="card p-4 transition-shadow hover:shadow-md"
              >
                <Link href={`/docente/cursos/${curso.id}`}>
                  <p className="font-medium text-ink">{curso.nombre}</p>
                  <p className="text-sm text-ink/70">
                    {curso.grupo} · {curso.periodo}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="clave-acceso">{curso.clave_acceso}</span>
                    <span className="text-ink/70">
                      {curso.inscripciones[0]?.count ?? 0} inscritos
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
