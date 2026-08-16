"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EstadoActividad = { error: string | null };

const TIPOS_PERMITIDOS = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
];
const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

export async function crearActividad(
  cursoId: string,
  _estadoPrevio: EstadoActividad,
  formData: FormData
): Promise<EstadoActividad> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const titulo = String(formData.get("titulo") ?? "").trim();
  const instrucciones = String(formData.get("instrucciones") ?? "").trim();
  const fechaApertura = String(formData.get("fecha_apertura") ?? "").trim();
  const fechaCierre = String(formData.get("fecha_cierre") ?? "").trim();
  const ponderacion = String(formData.get("ponderacion") ?? "").trim();
  const archivo = formData.get("archivo");

  if (!titulo || !fechaCierre || !ponderacion) {
    return {
      error: "Título, fecha de cierre y ponderación son obligatorios.",
    };
  }

  const tieneArchivo = archivo instanceof File && archivo.size > 0;
  const archivoFile = tieneArchivo ? (archivo as File) : null;

  if (archivoFile) {
    if (!TIPOS_PERMITIDOS.includes(archivoFile.type)) {
      return { error: "Formato no permitido. Usa PDF, DOCX, JPG o PNG." };
    }
    if (archivoFile.size > TAMANO_MAXIMO_BYTES) {
      return { error: "El archivo supera el máximo de 10 MB." };
    }
  }

  const { data: actividad, error: errorInsert } = await supabase
    .from("actividades")
    .insert({
      curso_id: cursoId,
      titulo,
      tipo: "TAREA",
      instrucciones: instrucciones || null,
      fecha_apertura: fechaApertura || null,
      fecha_cierre: fechaCierre,
      ponderacion: Number(ponderacion),
    })
    .select("id")
    .single();

  if (errorInsert || !actividad) {
    return {
      error: errorInsert?.message ?? "No se pudo crear la actividad.",
    };
  }

  if (archivoFile) {
    const storagePath = `${cursoId}/${actividad.id}/${archivoFile.name}`;

    const { error: errorSubida } = await supabase.storage
      .from("materiales-actividades")
      .upload(storagePath, archivoFile, { contentType: archivoFile.type });

    if (errorSubida) {
      await supabase.from("actividades").delete().eq("id", actividad.id);
      return { error: `No se pudo subir el archivo: ${errorSubida.message}` };
    }

    const { error: errorMaterial } = await supabase
      .from("materiales_actividad")
      .insert({
        actividad_id: actividad.id,
        nombre_archivo: archivoFile.name,
        storage_path: storagePath,
        tamano_bytes: archivoFile.size,
      });

    if (errorMaterial) {
      await supabase.storage
        .from("materiales-actividades")
        .remove([storagePath]);
      await supabase.from("actividades").delete().eq("id", actividad.id);
      return { error: errorMaterial.message };
    }
  }

  revalidatePath(`/docente/cursos/${cursoId}`);
  return { error: null };
}

export async function alternarBloqueo(
  cursoId: string,
  actividadId: string,
  nuevoValor: boolean,
  _formData: FormData
) {
  const supabase = await createClient();

  await supabase
    .from("actividades")
    .update({ bloqueado_manual: nuevoValor })
    .eq("id", actividadId);

  revalidatePath(`/docente/cursos/${cursoId}`);
}

export async function eliminarActividad(
  cursoId: string,
  actividadId: string,
  _formData: FormData
) {
  const supabase = await createClient();

  const { data: materiales } = await supabase
    .from("materiales_actividad")
    .select("storage_path")
    .eq("actividad_id", actividadId);

  if (materiales && materiales.length > 0) {
    await supabase.storage
      .from("materiales-actividades")
      .remove(materiales.map((m) => m.storage_path));
  }

  await supabase.from("actividades").delete().eq("id", actividadId);

  revalidatePath(`/docente/cursos/${cursoId}`);
}
