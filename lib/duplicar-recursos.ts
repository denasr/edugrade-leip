import type { createClient } from "@/lib/supabase/server";
import { BUCKET_RECURSOS, COLUMNAS_RECURSO, COLUMNAS_UNIDAD, type Recurso, type Unidad } from "@/lib/recursos";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Copia las unidades y recursos de un curso a otro (usada por
// duplicarCurso), con los archivos copiados dentro de Storage a la carpeta
// del curso nuevo. Conserva orden y visibilidad: a diferencia de las
// actividades, un recurso no tiene fechas que ajustar. Devuelve las rutas
// ya copiadas para que quien llama las borre si algo falla (todo o nada).
export async function duplicarRecursosCurso(
  supabase: Supabase,
  cursoOrigenId: string,
  cursoDestinoId: string
): Promise<{ error: string | null; rutasCopiadas: string[] }> {
  const rutasCopiadas: string[] = [];

  const [{ data: unidades, error: errorUnidades }, { data: recursos, error: errorRecursos }] =
    (await Promise.all([
      supabase.from("unidades_recursos").select(COLUMNAS_UNIDAD).eq("curso_id", cursoOrigenId),
      supabase.from("recursos_curso").select(COLUMNAS_RECURSO).eq("curso_id", cursoOrigenId),
    ])) as unknown as [
      { data: Unidad[] | null; error: unknown },
      { data: Recurso[] | null; error: unknown },
    ];
  if (errorUnidades || errorRecursos) {
    return { error: "No se pudieron leer los recursos del curso.", rutasCopiadas };
  }

  for (const unidad of unidades ?? []) {
    const { data: nuevaUnidad, error } = await supabase
      .from("unidades_recursos")
      .insert({
        curso_id: cursoDestinoId,
        titulo: unidad.titulo,
        orden: unidad.orden,
        visible: unidad.visible,
      })
      .select("id")
      .single();
    if (error || !nuevaUnidad) {
      return { error: `No se pudo copiar la unidad "${unidad.titulo}".`, rutasCopiadas };
    }

    for (const recurso of (recursos ?? []).filter((r) => r.unidad_id === unidad.id)) {
      let storagePath: string | null = null;
      if (recurso.storage_path) {
        const nombre = recurso.storage_path.split("/").pop();
        storagePath = `${cursoDestinoId}/${crypto.randomUUID()}/${nombre}`;
        const { error: errorCopia } = await supabase.storage
          .from(BUCKET_RECURSOS)
          .copy(recurso.storage_path, storagePath);
        if (errorCopia) {
          return { error: `No se pudo copiar el archivo de "${recurso.titulo}".`, rutasCopiadas };
        }
        rutasCopiadas.push(storagePath);
      }

      const { error: errorRecurso } = await supabase.from("recursos_curso").insert({
        curso_id: cursoDestinoId,
        unidad_id: nuevaUnidad.id,
        titulo: recurso.titulo,
        descripcion: recurso.descripcion,
        tipo: recurso.tipo,
        url: recurso.url,
        nombre_archivo: recurso.nombre_archivo,
        storage_path: storagePath,
        tamano_bytes: recurso.tamano_bytes,
        orden: recurso.orden,
        visible: recurso.visible,
      });
      if (errorRecurso) {
        return { error: `No se pudo copiar el recurso "${recurso.titulo}".`, rutasCopiadas };
      }
    }
  }

  return { error: null, rutasCopiadas };
}
