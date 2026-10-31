import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { docxAHtml, tipoVistaPrevia } from "@/lib/vista-previa-archivo";
import FormularioCalificacion from "../../formulario-calificacion";
import VistaPreviaEntrega, { type ArchivoParaRevision } from "./vista-previa-entrega";

// Mismo cast que en ../../page.tsx: actividades → cursos es many-to-one.
type ActividadConCurso = {
  id: string;
  titulo: string;
  cursos: { nombre: string; docente_id: string } | null;
};

type EntregaResumen = {
  id: string;
  estudiante_id: string;
  archivos_entrega: { id: string }[];
  evaluaciones: { id: string } | null;
};

type EntregaDetalle = {
  id: string;
  comentario_estudiante: string | null;
  created_at: string;
  archivos_entrega: { nombre_archivo: string; storage_path: string }[];
  evaluaciones: { calificacion_final: number; comentarios: string | null } | null;
};

// Lo bastante para leer un trabajo largo con calma antes de que el
// enlace de "Abrir aparte" caduque.
const VIGENCIA_ENLACE_SEGUNDOS = 30 * 60;

// Modo revisión: una entrega a la vez, con el archivo a la vista y la
// calificación al lado, y "Guardar y siguiente" para pasar a la próxima
// sin calificar. La lista completa sigue en /docente/actividades/[id].
export default async function RevisarEntrega({
  params,
}: {
  params: Promise<{ id: string; entregaId: string }>;
}) {
  const { id, entregaId } = await params;
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
    .select("id, titulo, cursos(nombre, docente_id)")
    .eq("id", id)
    .single()) as { data: ActividadConCurso | null };

  if (!actividad || actividad.cursos?.docente_id !== user.id) redirect("/docente");

  // Todas las entregas de la actividad, en el mismo orden que la lista,
  // solo para la navegación (cuál sigue, cuántas faltan). Una por
  // estudiante: no llega al límite de 1000 filas.
  const { data: entregas } = (await supabase
    .from("entregas")
    .select("id, estudiante_id, archivos_entrega(id), evaluaciones(id)")
    .eq("actividad_id", id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })) as { data: EntregaResumen[] | null };

  const lista = entregas ?? [];
  const indice = lista.findIndex((e) => e.id === entregaId);
  if (indice === -1) redirect(`/docente/actividades/${id}`);

  // "Pendiente" = entregó algo y no tiene nota. Una entrega a medias (sin
  // archivos) no cuenta: no hay nada que calificar.
  const esPendiente = (e: EntregaResumen) =>
    e.evaluaciones === null && e.archivos_entrega.length > 0;
  const pendientes = lista.filter(esPendiente).length;

  // La siguiente sin calificar después de esta (dando la vuelta al final);
  // si ya no queda ninguna, de regreso a la lista.
  const siguientePendiente = [...lista.slice(indice + 1), ...lista.slice(0, indice)].find(
    esPendiente
  );
  const rutaRevision = (eId: string) => `/docente/actividades/${id}/revisar/${eId}`;
  const siguienteHref = siguientePendiente
    ? rutaRevision(siguientePendiente.id)
    : `/docente/actividades/${id}`;

  const anterior = indice > 0 ? lista[indice - 1] : null;
  const siguiente = indice < lista.length - 1 ? lista[indice + 1] : null;

  const { data: entrega } = (await supabase
    .from("entregas")
    .select(
      "id, comentario_estudiante, created_at, archivos_entrega(nombre_archivo, storage_path), evaluaciones(calificacion_final, comentarios)"
    )
    .eq("id", entregaId)
    .single()) as { data: EntregaDetalle | null };

  if (!entrega) redirect(`/docente/actividades/${id}`);

  const { data: perfilEstudiante } = await supabase
    .from("perfiles")
    .select("nombre_completo")
    .eq("id", lista[indice].estudiante_id)
    .single();

  const archivos: ArchivoParaRevision[] = await Promise.all(
    entrega.archivos_entrega.map(async (archivo) => {
      const tipo = tipoVistaPrevia(archivo.nombre_archivo);
      let enlace: string | null = null;
      let html: string | null = null;

      // Mismo criterio que la lista: si Storage falla, se degrada a "no se
      // pudo cargar" en ese archivo, nunca un 500 de toda la página.
      try {
        const { data, error } = await supabase.storage
          .from("archivos-entrega")
          .createSignedUrl(archivo.storage_path, VIGENCIA_ENLACE_SEGUNDOS);
        if (error) console.error("Error al firmar URL de entrega:", error);
        enlace = data?.signedUrl ?? null;

        if (tipo === "docx") {
          const { data: blob, error: errorDescarga } = await supabase.storage
            .from("archivos-entrega")
            .download(archivo.storage_path);
          if (errorDescarga) console.error("Error al descargar .docx:", errorDescarga);
          if (blob) html = await docxAHtml(await blob.arrayBuffer());
        }
      } catch (err) {
        console.error("Excepción al preparar archivo de entrega:", err);
      }

      return { nombreArchivo: archivo.nombre_archivo, enlace, tipo, html };
    })
  );

  const evaluacion = entrega.evaluaciones;

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-10">
      <div className="w-full max-w-6xl">
        <Link href={`/docente/actividades/${id}`} className="link-muted">
          ← Todas las entregas
        </Link>
        <h1 className="mt-1 font-title text-2xl text-verde-bosque">{actividad.titulo}</h1>
        <p className="text-sm text-ink/70">
          {actividad.cursos?.nombre} · Entrega {indice + 1} de {lista.length} ·{" "}
          {pendientes === 0
            ? "todas calificadas"
            : `${pendientes} sin calificar`}
        </p>
      </div>

      <nav
        aria-label="Navegar entre entregas"
        className="flex w-full max-w-6xl items-center justify-between gap-2"
      >
        {anterior ? (
          <Link href={rutaRevision(anterior.id)} className="link-muted">
            ← Anterior
          </Link>
        ) : (
          <span />
        )}
        {siguiente ? (
          <Link href={rutaRevision(siguiente.id)} className="link-muted">
            Siguiente →
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Archivos entregados" className="flex min-w-0 flex-col gap-4">
          {archivos.length === 0 ? (
            <p className="card p-4 text-sm text-ink/70">
              Esta entrega no tiene archivos (la subida pudo quedarse a medias).
            </p>
          ) : (
            archivos.map((archivo, i) => <VistaPreviaEntrega key={i} archivo={archivo} />)
          )}
        </section>

        <aside className="card h-fit p-4 lg:sticky lg:top-4">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-ink">
              {perfilEstudiante?.nombre_completo ?? "—"}
            </p>
            <span className={evaluacion ? "badge-calificado" : "badge-pendiente"}>
              {evaluacion ? "Calificado" : "Pendiente"}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink/70">
            Entregó el{" "}
            {new Date(entrega.created_at).toLocaleString("es-MX", {
              timeZone: "America/Mexico_City",
            })}
          </p>
          {entrega.comentario_estudiante && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink/70">
              Comentario: {entrega.comentario_estudiante}
            </p>
          )}

          <FormularioCalificacion
            // key: al pasar a otra entrega, el formulario arranca de cero con
            // la nota de esa entrega en vez de conservar lo escrito antes.
            key={entrega.id}
            actividadId={id}
            entregaId={entrega.id}
            notaActual={evaluacion?.calificacion_final ?? null}
            comentarioActual={evaluacion?.comentarios ?? null}
            siguienteHref={siguienteHref}
          />
        </aside>
      </div>
    </main>
  );
}
