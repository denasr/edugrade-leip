import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BUCKET_RECURSOS, nombreDescarga } from "@/lib/recursos";

// Abre el archivo de un recurso del curso: firma un enlace nuevo en cada
// clic y redirige a él. Así la página del curso no reparte enlaces firmados
// que vencen mientras sigue abierta (lo que hoy pasa con el material de las
// actividades, que caduca a los 10 minutos).
//
// Sirve para docente y estudiante: con el cliente normal, la RLS de
// recursos_curso solo devuelve la fila al docente dueño o a un inscrito si
// el recurso y su unidad están visibles, y la policy del bucket exige lo
// mismo para firmar. Un Route Handler no hereda la protección de ninguna
// página, por eso todo se verifica aquí.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ recursoId: string }> }
) {
  const { recursoId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { data: recurso } = await supabase
    .from("recursos_curso")
    .select("storage_path, nombre_archivo")
    .eq("id", recursoId)
    .maybeSingle();

  if (!recurso?.storage_path) {
    return new Response("Este recurso no existe o no está disponible.", { status: 404 });
  }

  // PDF e imágenes se abren en el navegador; DOCX/PPTX se descargan con su
  // nombre original, sin acentos (ver nombreDescarga). Sin esto se bajarían
  // con el nombre saneado de Storage ("presentacion-final.pptx").
  const extension = recurso.nombre_archivo?.split(".").pop()?.toLowerCase();
  const descargar = extension === "docx" || extension === "pptx";

  const { data: firmado, error } = await supabase.storage
    .from(BUCKET_RECURSOS)
    .createSignedUrl(
      recurso.storage_path,
      60 * 5,
      descargar ? { download: nombreDescarga(recurso.nombre_archivo ?? "archivo") } : undefined
    );

  if (error || !firmado) {
    console.error("No se pudo firmar el recurso:", error);
    return new Response("No se pudo abrir el archivo. Intenta de nuevo.", { status: 500 });
  }

  return NextResponse.redirect(firmado.signedUrl);
}
