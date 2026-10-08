import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contarPendientesTareas } from "@/lib/pendientes-docente";
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

  // Mismo conteo que ya usa el badge de la franja de pestañas dentro de
  // cada curso (contarPendientesTareas, en lib/pendientes-docente.ts)
  // — aquí se corre para todos los cursos del docente a la vez, para no
  // tener que entrar uno por uno a ver dónde hay entregas sin calificar.
  const cursosConPendientes = await Promise.all(
    (cursos ?? []).map(async (curso) => ({
      ...curso,
      pendientes: await contarPendientesTareas(supabase, curso.id),
    }))
  );
  const cursosPendientesOrdenados = cursosConPendientes
    .filter((c) => c.pendientes > 0)
    .sort((a, b) => b.pendientes - a.pendientes);
  const totalPendientes = cursosPendientesOrdenados.reduce(
    (suma, c) => suma + c.pendientes,
    0
  );

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

      {cursos && cursos.length > 0 && (
        <section className="w-full max-w-sm lg:max-w-4xl">
          <h2 className="font-title text-xl text-verde-bosque">
            Por calificar
          </h2>
          {totalPendientes === 0 ? (
            <p className="mt-4 text-sm text-ink/70">
              No tienes entregas pendientes de calificar.
            </p>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
              {cursosPendientesOrdenados.map((curso) => (
                <li
                  key={curso.id}
                  className="card p-4 transition-shadow hover:shadow-md"
                >
                  <Link href={`/docente/cursos/${curso.id}/tareas`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">
                          {curso.nombre}
                        </p>
                        <p className="text-sm text-ink/70">
                          {curso.grupo} · {curso.periodo}
                        </p>
                      </div>
                      <span className="badge-pendiente shrink-0">
                        {curso.pendientes}{" "}
                        {curso.pendientes === 1 ? "pendiente" : "pendientes"}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="w-full max-w-sm lg:max-w-4xl">
        <h2 className="font-title text-xl text-verde-bosque">Mis cursos</h2>

        {!cursos || cursos.length === 0 ? (
          <p className="mt-4 text-sm text-ink/70">
            Todavía no has creado ningún curso.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
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
