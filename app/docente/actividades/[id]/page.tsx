import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import FormularioCalificacion from "./formulario-calificacion";

// select("cursos(...)") desde actividades es una relación many-to-one (FK en
// actividades), así que Postgrest devuelve un objeto; el tipado por defecto
// de supabase-js (sin generar tipos desde el esquema) lo infiere como
// arreglo, por eso el cast.
type ActividadConCurso = {
  id: string;
  titulo: string;
  curso_id: string;
  cursos: { id: string; nombre: string; docente_id: string } | null;
};

export default async function DetalleActividadDocente({
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

  const { data: actividad } = (await supabase
    .from("actividades")
    .select("id, titulo, curso_id, cursos(id, nombre, docente_id)")
    .eq("id", id)
    .single()) as { data: ActividadConCurso | null };

  if (!actividad || actividad.cursos?.docente_id !== user.id) {
    redirect("/docente");
  }

  // evaluaciones.entrega_id es UNIQUE, así que Postgrest lo embebe como
  // objeto (o null), a diferencia de archivos_entrega que sí es un arreglo.
  type EntregaConDetalle = {
    id: string;
    estudiante_id: string;
    comentario_estudiante: string | null;
    estado: string;
    created_at: string;
    archivos_entrega: { nombre_archivo: string; storage_path: string }[];
    evaluaciones: { calificacion_final: number; comentarios: string | null } | null;
  };

  const { data: entregas } = (await supabase
    .from("entregas")
    .select(
      "id, estudiante_id, comentario_estudiante, estado, created_at, archivos_entrega(nombre_archivo, storage_path), evaluaciones(calificacion_final, comentarios)"
    )
    .eq("actividad_id", id)
    .order("created_at", { ascending: true })) as {
    data: EntregaConDetalle[] | null;
  };

  const estudianteIds = [...new Set((entregas ?? []).map((e) => e.estudiante_id))];
  const { data: perfilesEstudiantes } =
    estudianteIds.length > 0
      ? await supabase
          .from("perfiles")
          .select("id, nombre_completo")
          .in("id", estudianteIds)
      : { data: [] };
  const nombrePorId = new Map(
    (perfilesEstudiantes ?? []).map((p) => [p.id, p.nombre_completo])
  );

  const entregasConEnlace = await Promise.all(
    (entregas ?? []).map(async (entrega) => {
      const archivo = entrega.archivos_entrega[0] ?? null;
      let enlaceDescarga: string | null = null;

      if (archivo) {
        const { data } = await supabase.storage
          .from("archivos-entrega")
          .createSignedUrl(archivo.storage_path, 60 * 10);
        enlaceDescarga = data?.signedUrl ?? null;
      }

      return {
        ...entrega,
        nombreArchivo: archivo?.nombre_archivo ?? null,
        enlaceDescarga,
        nombreEstudiante: nombrePorId.get(entrega.estudiante_id) ?? "—",
      };
    })
  );

  return (
    <main className="flex flex-1 flex-col items-center gap-10 px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <Link href={`/docente/cursos/${actividad.curso_id}`} className="link-muted">
          ← {actividad.cursos?.nombre}
        </Link>
        <h1 className="mt-2 font-title text-2xl text-verde-bosque">
          {actividad.titulo}
        </h1>
      </div>

      <section className="w-full max-w-sm">
        <h2 className="font-title text-xl text-verde-bosque">Entregas</h2>

        {entregasConEnlace.length === 0 ? (
          <p className="mt-4 text-sm text-ink/60">
            Todavía no hay entregas para esta tarea.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {entregasConEnlace.map((entrega) => {
              const evaluacion = entrega.evaluaciones;
              return (
                <li key={entrega.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-ink">
                      {entrega.nombreEstudiante}
                    </p>
                    <span
                      className={
                        entrega.estado === "CALIFICADO"
                          ? "badge-calificado"
                          : "badge-pendiente"
                      }
                    >
                      {entrega.estado === "CALIFICADO"
                        ? "Calificado"
                        : "Pendiente"}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-ink/50">
                    {new Date(entrega.created_at).toLocaleString("es-MX")}
                  </p>

                  {entrega.comentario_estudiante && (
                    <p className="mt-1 text-sm text-ink/70">
                      Comentario: {entrega.comentario_estudiante}
                    </p>
                  )}

                  {entrega.enlaceDescarga && (
                    <a
                      href={entrega.enlaceDescarga}
                      className="mt-2 inline-block text-sm font-medium text-verde-bosque hover:underline"
                    >
                      Descargar {entrega.nombreArchivo}
                    </a>
                  )}

                  <FormularioCalificacion
                    actividadId={id}
                    entregaId={entrega.id}
                    notaActual={evaluacion?.calificacion_final ?? null}
                    comentarioActual={evaluacion?.comentarios ?? null}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
