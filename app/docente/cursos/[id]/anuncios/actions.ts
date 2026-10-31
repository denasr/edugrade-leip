"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { LARGO_MAXIMO_ANUNCIO } from "@/lib/anuncios";

export type EstadoAnuncio = { error: string | null };

// El tablón del docente, la página del curso del estudiante y su panel
// principal (que muestra los anuncios recientes de todos sus cursos).
function revalidarAnuncios(cursoId: string) {
  revalidatePath(`/docente/cursos/${cursoId}/anuncios`);
  revalidatePath(`/estudiante/cursos/${cursoId}`);
  revalidatePath("/estudiante");
}

function validarContenido(formData: FormData): { contenido: string } | { error: string } {
  const contenido = String(formData.get("contenido") ?? "").trim();
  if (!contenido) return { error: "Escribe el anuncio." };
  if (contenido.length > LARGO_MAXIMO_ANUNCIO) {
    return { error: `El anuncio no puede pasar de ${LARGO_MAXIMO_ANUNCIO} caracteres.` };
  }
  return { contenido };
}

export async function publicarAnuncio(
  cursoId: string,
  _estadoPrevio: EstadoAnuncio,
  formData: FormData
): Promise<EstadoAnuncio> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const validado = validarContenido(formData);
  if ("error" in validado) return validado;

  // RLS (anuncios_insert_docente) exige ser el docente dueño del curso.
  const { error } = await supabase.from("anuncios").insert({
    curso_id: cursoId,
    autor_id: user.id,
    contenido: validado.contenido,
    fijado: formData.get("fijado") === "on",
  });

  if (error) {
    console.error("Error al publicar anuncio:", error);
    return { error: "No se pudo publicar el anuncio. Intenta de nuevo." };
  }

  revalidarAnuncios(cursoId);
  return { error: null };
}

export async function editarAnuncio(
  cursoId: string,
  anuncioId: string,
  _estadoPrevio: EstadoAnuncio,
  formData: FormData
): Promise<EstadoAnuncio> {
  const supabase = await createClient();

  const validado = validarContenido(formData);
  if ("error" in validado) return validado;

  // RLS (anuncios_update_docente) restringe esto al docente dueño del curso;
  // .select() para distinguir "se guardó" de "no había nada que pudiera
  // modificar" (RLS no da error, solo deja 0 filas).
  const { data, error } = await supabase
    .from("anuncios")
    .update({ contenido: validado.contenido, editado_at: new Date().toISOString() })
    .eq("id", anuncioId)
    .eq("curso_id", cursoId)
    .select("id");

  if (error || !data || data.length === 0) {
    if (error) console.error("Error al editar anuncio:", error);
    return { error: "No se pudo guardar el cambio. Intenta de nuevo." };
  }

  revalidarAnuncios(cursoId);
  return { error: null };
}

export async function cambiarFijadoAnuncio(
  cursoId: string,
  anuncioId: string,
  fijado: boolean,
  _formData: FormData
) {
  const supabase = await createClient();

  await supabase
    .from("anuncios")
    .update({ fijado })
    .eq("id", anuncioId)
    .eq("curso_id", cursoId);

  revalidarAnuncios(cursoId);
}

export async function eliminarAnuncio(
  cursoId: string,
  anuncioId: string,
  _formData: FormData
) {
  const supabase = await createClient();

  // RLS (anuncios_delete_docente) restringe esto al docente dueño del curso.
  await supabase.from("anuncios").delete().eq("id", anuncioId).eq("curso_id", cursoId);

  revalidarAnuncios(cursoId);
}
