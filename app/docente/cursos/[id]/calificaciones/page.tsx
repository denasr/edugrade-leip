import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  obtenerLibroCalificaciones,
  textoAsistencia,
  textoCalificacionFinalBase,
  textoCeldaExamen,
  textoCeldaTarea,
} from "@/lib/libro-calificaciones";

export default async function LibroCalificaciones({
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

  const libro = await obtenerLibroCalificaciones(supabase, id, user.id);
  if (!libro) redirect("/docente");

  const { curso, tareas, examenes, estudiantes } = libro;

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-4 py-16">
      <div className="w-full max-w-4xl text-center">
        <Link href={`/docente/cursos/${id}`} className="link-muted">
          ← {curso.nombre}
        </Link>
        <h1 className="mt-2 font-title text-2xl text-verde-bosque">
          Libro de calificaciones
        </h1>
        <p className="mt-1 text-sm text-ink/70">
          {curso.grupo} · {curso.periodo}
        </p>
      </div>

      {estudiantes.length === 0 ? (
        <p className="text-sm text-ink/60">
          Todavía no hay estudiantes inscritos en este curso.
        </p>
      ) : (
        <>
          <a
            href={`/docente/cursos/${id}/calificaciones/export`}
            className="btn-primary"
          >
            Exportar a Excel
          </a>

          <div className="card w-full max-w-4xl overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-verde-bosque/15 text-left">
                  <th className="sticky left-0 z-10 whitespace-nowrap bg-superficie px-4 py-3 font-medium text-ink">
                    Estudiante
                  </th>
                  {tareas.map((t) => (
                    <th
                      key={t.id}
                      className="whitespace-nowrap px-3 py-3 font-medium text-ink"
                    >
                      {t.titulo}
                    </th>
                  ))}
                  {examenes.map((e) => (
                    <th
                      key={e.id}
                      className="whitespace-nowrap px-3 py-3 font-medium text-ink"
                    >
                      {e.titulo}
                    </th>
                  ))}
                  <th className="whitespace-nowrap px-3 py-3 font-medium text-ink">
                    Asistencia
                  </th>
                  <th className="whitespace-nowrap bg-verde-bosque/8 px-3 py-3 font-medium text-verde-bosque">
                    Final
                  </th>
                </tr>
              </thead>
              <tbody>
                {estudiantes.map((estudiante) => (
                  <tr
                    key={estudiante.id}
                    className="border-b border-verde-bosque/10 last:border-0"
                  >
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-superficie px-4 py-3 text-ink">
                      {estudiante.nombre_completo}
                    </td>
                    {tareas.map((t) => (
                      <td
                        key={t.id}
                        className="whitespace-nowrap px-3 py-3 text-ink/80"
                      >
                        {textoCeldaTarea(estudiante.celdas.get(t.id))}
                      </td>
                    ))}
                    {examenes.map((e) => (
                      <td
                        key={e.id}
                        className="whitespace-nowrap px-3 py-3 text-ink/80"
                      >
                        {textoCeldaExamen(estudiante.celdas.get(e.id))}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-3 text-ink/80">
                      {textoAsistencia(estudiante.resultado.porcentajeAsistencia)}
                    </td>
                    <td className="whitespace-nowrap bg-verde-bosque/8 px-3 py-3 font-medium text-verde-bosque">
                      {textoCalificacionFinalBase(estudiante.resultado)}
                      {estudiante.resultado.calificacionFinal !== null &&
                        estudiante.resultado.esParcial && (
                          <span className="ml-1 text-xs text-terracota">
                            (parcial)
                          </span>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
