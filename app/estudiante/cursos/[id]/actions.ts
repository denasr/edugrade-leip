"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EstadoEntrega = { error: string | null };

const TIPOS_PERMITIDOS = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
];
const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

export async function entregarTarea(
  actividadId: string,
  cursoId: string,
  _estadoPrevio: EstadoEntrega,
  formData: FormData
): Promise<EstadoEntrega> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const comentario = String(formData.get("comentario") ?? "").trim();
  const archivo = formData.get("archivo");

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Adjunta un archivo para entregar la tarea." };
  }

  if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
    return { error: "Formato no permitido. Usa PDF, DOCX, JPG o PNG." };
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return { error: "El archivo supera el máximo de 10 MB." };
  }

  const { data: entrega, error: errorInsert } = await supabase
    .from("entregas")
    .insert({
      actividad_id: actividadId,
      estudiante_id: user.id,
      comentario_estudiante: comentario || null,
    })
    .select("id")
    .single();

  if (errorInsert || !entrega) {
    if (errorInsert?.code === "23505") {
      return { error: "Ya entregaste esta tarea." };
    }
    return {
      error:
        errorInsert?.message ??
        "No se pudo registrar la entrega. Verifica que la tarea siga abierta.",
    };
  }

  const storagePath = `${entrega.id}/${archivo.name}`;
  const { error: errorSubida } = await supabase.storage
    .from("archivos-entrega")
    .upload(storagePath, archivo, { contentType: archivo.type });

  if (errorSubida) {
    await supabase.from("entregas").delete().eq("id", entrega.id);
    return { error: `No se pudo subir el archivo: ${errorSubida.message}` };
  }

  const { error: errorArchivo } = await supabase
    .from("archivos_entrega")
    .insert({
      entrega_id: entrega.id,
      nombre_archivo: archivo.name,
      storage_path: storagePath,
      tamano_bytes: archivo.size,
    });

  if (errorArchivo) {
    await supabase.storage.from("archivos-entrega").remove([storagePath]);
    await supabase.from("entregas").delete().eq("id", entrega.id);
    return { error: errorArchivo.message };
  }

  revalidatePath(`/estudiante/cursos/${cursoId}`);
  return { error: null };
}
