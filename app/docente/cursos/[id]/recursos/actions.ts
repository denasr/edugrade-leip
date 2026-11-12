"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  BUCKET_RECURSOS,
  LARGO_MAXIMO_DESCRIPCION,
  LARGO_MAXIMO_TITULO,
  TAMANO_MAXIMO_RECURSO_BYTES,
  normalizarUrl,
  tipoDeArchivoRecurso,
} from "@/lib/recursos";

// Todas las escrituras van con el cliente normal: las policies
// *_docente de unidades_recursos y recursos_curso (y las del bucket
// recursos-curso) ya restringen todo al docente dueño del curso. Cuando RLS
// rechaza un update/delete no da error, solo afecta 0 filas; por eso los que
// devuelven estado piden `.select()` para distinguirlo.

export type EstadoRecursos = { error: string | null };

type Supabase = Awaited<ReturnType<typeof createClient>>;

function revalidarRecursos(cursoId: string) {
  revalidatePath(`/docente/cursos/${cursoId}/recursos`);
  revalidatePath(`/estudiante/cursos/${cursoId}`);
}

function leerTitulo(formData: FormData): { titulo: string } | { error: string } {
  const titulo = String(formData.get("titulo") ?? "").trim();
  if (!titulo) return { error: "Escribe un título." };
  if (titulo.length > LARGO_MAXIMO_TITULO) {
    return { error: `El título no puede pasar de ${LARGO_MAXIMO_TITULO} caracteres.` };
  }
  return { titulo };
}

function leerDescripcion(formData: FormData): { descripcion: string | null } | { error: string } {
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  if (descripcion.length > LARGO_MAXIMO_DESCRIPCION) {
    return {
      error: `La descripción no puede pasar de ${LARGO_MAXIMO_DESCRIPCION} caracteres.`,
    };
  }
  return { descripcion: descripcion || null };
}

async function siguienteOrden(
  supabase: Supabase,
  tabla: "unidades_recursos" | "recursos_curso",
  columna: "curso_id" | "unidad_id",
  valor: string
): Promise<number> {
  const { data } = await supabase
    .from(tabla)
    .select("orden")
    .eq(columna, valor)
    .order("orden", { ascending: false })
    .limit(1);
  return data && data.length > 0 ? data[0].orden + 1 : 0;
}

// Sube o baja un elemento un lugar y renumera a todos sus hermanos 0..n-1,
// para que empates viejos en `orden` no dejen el botón sin efecto.
async function mover(
  supabase: Supabase,
  tabla: "unidades_recursos" | "recursos_curso",
  columna: "curso_id" | "unidad_id",
  valor: string,
  id: string,
  direccion: "arriba" | "abajo"
) {
  const { data: hermanos } = await supabase
    .from(tabla)
    .select("id, orden, titulo")
    .eq(columna, valor)
    .order("orden", { ascending: true })
    .order("titulo", { ascending: true });
  if (!hermanos) return;

  const lista = hermanos.map((h) => h.id);
  const i = lista.indexOf(id);
  const j = direccion === "arriba" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];

  await Promise.all(
    lista.map((idHermano, orden) =>
      hermanos.find((h) => h.id === idHermano)!.orden === orden
        ? null
        : supabase.from(tabla).update({ orden }).eq("id", idHermano)
    )
  );
}

// ---- Unidades ----

export async function crearUnidad(
  cursoId: string,
  _estadoPrevio: EstadoRecursos,
  formData: FormData
): Promise<EstadoRecursos> {
  const supabase = await createClient();
  const leido = leerTitulo(formData);
  if ("error" in leido) return leido;

  const { error } = await supabase.from("unidades_recursos").insert({
    curso_id: cursoId,
    titulo: leido.titulo,
    visible: formData.get("ocultar") !== "on",
    orden: await siguienteOrden(supabase, "unidades_recursos", "curso_id", cursoId),
  });
  if (error) {
    console.error("Error al crear unidad de recursos:", error);
    return { error: "No se pudo crear la unidad. Intenta de nuevo." };
  }

  revalidarRecursos(cursoId);
  return { error: null };
}

export async function renombrarUnidad(
  cursoId: string,
  unidadId: string,
  _estadoPrevio: EstadoRecursos,
  formData: FormData
): Promise<EstadoRecursos> {
  const supabase = await createClient();
  const leido = leerTitulo(formData);
  if ("error" in leido) return leido;

  const { data, error } = await supabase
    .from("unidades_recursos")
    .update({ titulo: leido.titulo })
    .eq("id", unidadId)
    .eq("curso_id", cursoId)
    .select("id");
  if (error || !data || data.length === 0) {
    if (error) console.error("Error al renombrar unidad:", error);
    return { error: "No se pudo guardar el cambio. Intenta de nuevo." };
  }

  revalidarRecursos(cursoId);
  return { error: null };
}

export async function cambiarVisibleUnidad(
  cursoId: string,
  unidadId: string,
  visible: boolean,
  _formData: FormData
) {
  const supabase = await createClient();
  await supabase
    .from("unidades_recursos")
    .update({ visible })
    .eq("id", unidadId)
    .eq("curso_id", cursoId);
  revalidarRecursos(cursoId);
}

export async function moverUnidad(
  cursoId: string,
  unidadId: string,
  direccion: "arriba" | "abajo",
  _formData: FormData
) {
  const supabase = await createClient();
  await mover(supabase, "unidades_recursos", "curso_id", cursoId, unidadId, direccion);
  revalidarRecursos(cursoId);
}

// Los archivos en Storage no dependen de ninguna FK: se quitan antes de que
// el cascade borre las filas que guardan su ruta.
export async function eliminarUnidad(cursoId: string, unidadId: string, _formData: FormData) {
  const supabase = await createClient();
  const { data: archivos } = await supabase
    .from("recursos_curso")
    .select("storage_path")
    .eq("unidad_id", unidadId)
    .eq("curso_id", cursoId)
    .not("storage_path", "is", null);
  const rutas = (archivos ?? []).map((a) => a.storage_path as string);
  if (rutas.length > 0) {
    await supabase.storage.from(BUCKET_RECURSOS).remove(rutas);
  }

  await supabase.from("unidades_recursos").delete().eq("id", unidadId).eq("curso_id", cursoId);
  revalidarRecursos(cursoId);
}

// ---- Recursos ----

export async function crearEnlace(
  cursoId: string,
  unidadId: string,
  _estadoPrevio: EstadoRecursos,
  formData: FormData
): Promise<EstadoRecursos> {
  const supabase = await createClient();
  const titulo = leerTitulo(formData);
  if ("error" in titulo) return titulo;
  const descripcion = leerDescripcion(formData);
  if ("error" in descripcion) return descripcion;
  const url = normalizarUrl(String(formData.get("url") ?? ""));
  if (!url) return { error: "Escribe una dirección válida, por ejemplo https://youtube.com/…" };

  const { error } = await supabase.from("recursos_curso").insert({
    curso_id: cursoId,
    unidad_id: unidadId,
    tipo: "ENLACE",
    titulo: titulo.titulo,
    descripcion: descripcion.descripcion,
    url,
    visible: formData.get("ocultar") !== "on",
    orden: await siguienteOrden(supabase, "recursos_curso", "unidad_id", unidadId),
  });
  if (error) {
    console.error("Error al crear enlace:", error, { cursoId, unidadId });
    return { error: "No se pudo agregar el enlace. Intenta de nuevo." };
  }

  revalidarRecursos(cursoId);
  return { error: null };
}

export type ArchivoRecursoSubido = {
  unidadId: string;
  titulo: string;
  descripcion: string;
  ocultar: boolean;
  storagePath: string;
  nombreArchivo: string;
  tamanoBytes: number;
};

// El navegador ya subió el archivo a Storage (ver formulario-recurso.tsx);
// aquí solo se registra. Si falla, se borra el archivo para no dejarlo suelto.
export async function registrarArchivoRecurso(
  cursoId: string,
  archivo: ArchivoRecursoSubido
): Promise<EstadoRecursos> {
  const supabase = await createClient();

  const quitarArchivo = () =>
    supabase.storage.from(BUCKET_RECURSOS).remove([archivo.storagePath]);

  // La ruta la arma el navegador: se valida que caiga dentro de la carpeta
  // de este curso (las policies del bucket ya lo exigen para subirla).
  const partes = archivo.storagePath.split("/");
  if (partes.length !== 3 || partes[0] !== cursoId || partes.includes("..")) {
    return { error: "Ruta de archivo inválida." };
  }

  const fd = new FormData();
  fd.set("titulo", archivo.titulo || archivo.nombreArchivo);
  fd.set("descripcion", archivo.descripcion);
  const titulo = leerTitulo(fd);
  const descripcion = leerDescripcion(fd);
  if ("error" in titulo || "error" in descripcion) {
    await quitarArchivo();
    return "error" in titulo ? titulo : (descripcion as { error: string });
  }
  if (!tipoDeArchivoRecurso(archivo.nombreArchivo)) {
    await quitarArchivo();
    return { error: "Formato no permitido." };
  }
  if (archivo.tamanoBytes > TAMANO_MAXIMO_RECURSO_BYTES) {
    await quitarArchivo();
    return { error: "El archivo supera el máximo de 25 MB." };
  }

  const { error } = await supabase.from("recursos_curso").insert({
    curso_id: cursoId,
    unidad_id: archivo.unidadId,
    tipo: "ARCHIVO",
    titulo: titulo.titulo,
    descripcion: descripcion.descripcion,
    nombre_archivo: archivo.nombreArchivo,
    storage_path: archivo.storagePath,
    tamano_bytes: archivo.tamanoBytes,
    visible: !archivo.ocultar,
    orden: await siguienteOrden(supabase, "recursos_curso", "unidad_id", archivo.unidadId),
  });
  if (error) {
    console.error("Error al registrar archivo de recurso:", error);
    await quitarArchivo();
    return { error: "No se pudo guardar el recurso. Intenta de nuevo." };
  }

  revalidarRecursos(cursoId);
  return { error: null };
}

export async function editarRecurso(
  cursoId: string,
  recursoId: string,
  _estadoPrevio: EstadoRecursos,
  formData: FormData
): Promise<EstadoRecursos> {
  const supabase = await createClient();
  const titulo = leerTitulo(formData);
  if ("error" in titulo) return titulo;
  const descripcion = leerDescripcion(formData);
  if ("error" in descripcion) return descripcion;

  const { data: actual } = await supabase
    .from("recursos_curso")
    .select("tipo, unidad_id")
    .eq("id", recursoId)
    .eq("curso_id", cursoId)
    .maybeSingle();
  if (!actual) return { error: "No se encontró el recurso." };

  const cambios: Record<string, unknown> = {
    titulo: titulo.titulo,
    descripcion: descripcion.descripcion,
  };

  if (actual.tipo === "ENLACE") {
    const url = normalizarUrl(String(formData.get("url") ?? ""));
    if (!url) return { error: "Escribe una dirección válida, por ejemplo https://youtube.com/…" };
    cambios.url = url;
  }

  // Mover a otra unidad: va al final de la nueva. La FK compuesta
  // (unidad_id, curso_id) rechaza una unidad de otro curso.
  const unidadNueva = String(formData.get("unidad_id") ?? "");
  if (unidadNueva && unidadNueva !== actual.unidad_id) {
    cambios.unidad_id = unidadNueva;
    cambios.orden = await siguienteOrden(supabase, "recursos_curso", "unidad_id", unidadNueva);
  }

  const { data, error } = await supabase
    .from("recursos_curso")
    .update(cambios)
    .eq("id", recursoId)
    .eq("curso_id", cursoId)
    .select("id");
  if (error || !data || data.length === 0) {
    if (error) console.error("Error al editar recurso:", error);
    return { error: "No se pudo guardar el cambio. Intenta de nuevo." };
  }

  revalidarRecursos(cursoId);
  return { error: null };
}

export async function cambiarVisibleRecurso(
  cursoId: string,
  recursoId: string,
  visible: boolean,
  _formData: FormData
) {
  const supabase = await createClient();
  await supabase
    .from("recursos_curso")
    .update({ visible })
    .eq("id", recursoId)
    .eq("curso_id", cursoId);
  revalidarRecursos(cursoId);
}

export async function moverRecurso(
  cursoId: string,
  unidadId: string,
  recursoId: string,
  direccion: "arriba" | "abajo",
  _formData: FormData
) {
  const supabase = await createClient();
  await mover(supabase, "recursos_curso", "unidad_id", unidadId, recursoId, direccion);
  revalidarRecursos(cursoId);
}

export async function eliminarRecurso(cursoId: string, recursoId: string, _formData: FormData) {
  const supabase = await createClient();
  const { data: recurso } = await supabase
    .from("recursos_curso")
    .select("storage_path")
    .eq("id", recursoId)
    .eq("curso_id", cursoId)
    .maybeSingle();
  if (!recurso) return;

  // Storage primero: su policy de delete solo pide ser docente del curso,
  // pero si se borrara la fila antes y esto fallara, el archivo quedaría
  // suelto sin ninguna fila que lo apunte.
  if (recurso.storage_path) {
    await supabase.storage.from(BUCKET_RECURSOS).remove([recurso.storage_path]);
  }
  await supabase.from("recursos_curso").delete().eq("id", recursoId).eq("curso_id", cursoId);
  revalidarRecursos(cursoId);
}
