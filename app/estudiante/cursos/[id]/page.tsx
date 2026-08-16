import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { estadoActividad } from "@/lib/actividades";

export default async function DetalleCursoEstudiante({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/registro");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (perfil?.rol !== "ESTUDIANTE") redirect("/docente");

  const { data: inscripcion } = await supabase
    .from("inscripciones")
    .select("id")
    .eq("curso_id", id)
    .eq("estudiante_id", user.id)
    .maybeSingle();

  if (!inscripcion) redirect("/estudiante");

  const { data: curso } = await supabase
    .from("cursos")
    .select("nombre, grupo, periodo")
    .eq("id", id)
    .single();

  if (!curso) redirect("/estudiante");

  const { data: actividades } = await supabase
    .from("actividades")
    .select(
      "id, titulo, instrucciones, fecha_apertura, fecha_cierre, ponderacion, bloqueado_manual, materiales_actividad(nombre_archivo, storage_path)"
    )
    .eq("curso_id", id)
    .eq("tipo", "TAREA")
    .order("created_at", { ascending: false });

  const actividadesConEnlace = await Promise.all(
    (actividades ?? []).map(async (actividad) => {
      const material = actividad.materiales_actividad[0] ?? null;
      let enlaceDescarga: string | null = null;

      if (material) {
        const { data } = await supabase.storage
          .from("materiales-actividades")
          .createSignedUrl(material.storage_path, 60 * 10);
        enlaceDescarga = data?.signedUrl ?? null;
      }

      return {
        ...actividad,
        nombreArchivo: material?.nombre_archivo ?? null,
        enlaceDescarga,
      };
    })
  );

  return (
    <main className="flex flex-1 flex-col items-center gap-10 px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <Link
          href="/estudiante"
          className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
        >
          ← Mis cursos
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {curso.nombre}
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {curso.grupo} · {curso.periodo}
        </p>
      </div>

      <section className="w-full max-w-sm">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Tareas
        </h2>

        {actividadesConEnlace.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            Todavía no hay tareas publicadas en este curso.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {actividadesConEnlace.map((actividad) => {
              const estado = estadoActividad(actividad);
              return (
                <li
                  key={actividad.id}
                  className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">
                      {actividad.titulo}
                    </p>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                        estado === "ABIERTA"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {estado === "ABIERTA" ? "Abierta" : "Cerrada"}
                    </span>
                  </div>

                  {actividad.instrucciones && (
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {actividad.instrucciones}
                    </p>
                  )}

                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                    {actividad.fecha_apertura
                      ? `Abre ${new Date(
                          actividad.fecha_apertura
                        ).toLocaleString("es-MX")} · `
                      : ""}
                    Cierra{" "}
                    {new Date(actividad.fecha_cierre).toLocaleString("es-MX")}
                    {" · "}
                    Ponderación {actividad.ponderacion}
                  </p>

                  {actividad.enlaceDescarga && (
                    <a
                      href={actividad.enlaceDescarga}
                      className="mt-2 inline-block text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                    >
                      Descargar {actividad.nombreArchivo}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
