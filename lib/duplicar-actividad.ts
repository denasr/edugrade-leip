import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nombreArchivoSeguro } from "@/lib/nombre-archivo";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActividadOrigen = {
  id: string;
  titulo: string;
  tipo: "TAREA" | "EXAMEN";
  instrucciones: string | null;
  intentos_permitidos: number;
  orden_aleatorio: boolean;
};

// Crea una copia de una actividad en otro curso (o en el mismo): mismos
// datos, sus preguntas si es examen o cuestionario, y su material adjunto
// copiado dentro de Storage. Nunca copia entregas. La copia nace oculta
// (visible_estudiantes = false) para que el docente la revise antes de
// publicarla. La usan copiarActividad (una actividad) y duplicarCurso (todas
// las de un curso).
//
// Quien la llama ya verificó que el docente es dueño de la actividad origen
// y del curso destino. Si algo falla a la mitad, deshace lo que alcanzó a
// crear (la actividad y, si ya existía, el archivo copiado).
export async function duplicarActividad(
  supabase: SupabaseServerClient,
  origen: ActividadOrigen,
  cursoDestinoId: string,
  fechas: { fecha_apertura: string | null; fecha_cierre: string }
): Promise<{ error: string | null }> {
  const { data: nueva, error: errorInsert } = await supabase
    .from("actividades")
    .insert({
      curso_id: cursoDestinoId,
      titulo: origen.titulo,
      tipo: origen.tipo,
      instrucciones: origen.instrucciones,
      fecha_apertura: fechas.fecha_apertura,
      fecha_cierre: fechas.fecha_cierre,
      intentos_permitidos: origen.intentos_permitidos,
      orden_aleatorio: origen.orden_aleatorio,
      visible_estudiantes: false,
    })
    .select("id")
    .single();

  if (errorInsert || !nueva) {
    return { error: errorInsert?.message ?? "No se pudo copiar la actividad." };
  }

  // preguntas_examen no tiene ninguna policy (ni para el dueño), mismo
  // motivo que crearExamen/editarExamen: solo la secret key puede tocarla.
  // Cubre tanto un examen como un cuestionario (TAREA con preguntas) — una
  // actividad de archivo normal simplemente no trae ninguna fila aquí.
  const admin = createAdminClient();
  const { data: preguntas } = await admin
    .from("preguntas_examen")
    .select("tipo, enunciado, opciones, correcta, puntos, orden")
    .eq("actividad_id", origen.id)
    .order("orden", { ascending: true });

  if (preguntas && preguntas.length > 0) {
    const { error: errorPreguntas } = await admin
      .from("preguntas_examen")
      .insert(preguntas.map((p) => ({ ...p, actividad_id: nueva.id })));

    if (errorPreguntas) {
      await supabase.from("actividades").delete().eq("id", nueva.id);
      return { error: errorPreguntas.message };
    }
  }

  // Solo una tarea de archivo trae material, nunca un cuestionario ni un
  // examen — en la práctica es a lo más una fila.
  const { data: materiales } = await supabase
    .from("materiales_actividad")
    .select("nombre_archivo, storage_path, tamano_bytes")
    .eq("actividad_id", origen.id);

  if (materiales && materiales.length > 0) {
    const material = materiales[0];
    // .copy() duplica el objeto dentro del propio Storage (nunca pasa por
    // esta función como archivo), así que no importa su tamaño.
    const storagePathNuevo = `${cursoDestinoId}/${nueva.id}/${nombreArchivoSeguro(material.nombre_archivo)}`;
    const { error: errorCopia } = await supabase.storage
      .from("materiales-actividades")
      .copy(material.storage_path, storagePathNuevo);

    if (errorCopia) {
      console.error("Error al copiar material de actividad:", errorCopia);
      await supabase.from("actividades").delete().eq("id", nueva.id);
      return { error: "No se pudo copiar el material adjunto." };
    }

    const { error: errorMaterial } = await supabase.from("materiales_actividad").insert({
      actividad_id: nueva.id,
      nombre_archivo: material.nombre_archivo,
      storage_path: storagePathNuevo,
      tamano_bytes: material.tamano_bytes,
    });

    if (errorMaterial) {
      await supabase.storage.from("materiales-actividades").remove([storagePathNuevo]);
      await supabase.from("actividades").delete().eq("id", nueva.id);
      return { error: errorMaterial.message };
    }
  }

  return { error: null };
}
