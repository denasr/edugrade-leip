import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nombreDescarga } from "@/lib/recursos";

// Abre el material de apoyo de una tarea: firma un enlace nuevo en cada clic
// y redirige a él. Antes la página del curso firmaba el enlace al cargarse,
// por 10 minutos, y si el estudiante la dejaba abierta el clic terminaba en
// un error de Storage (visto en los logs). Mismo patrón que
// /recursos/[recursoId].
//
// La RLS de materiales_actividad solo devuelve la fila al docente de la
// actividad o a un inscrito con la actividad visible (actividad_visible), y
// la policy del bucket exige lo mismo para firmar. Un Route Handler no
// hereda la protección de ninguna página, por eso todo se verifica aquí.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ materialId: string }> }
) {
  const { materialId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { data: material } = await supabase
    .from("materiales_actividad")
    .select("storage_path, nombre_archivo")
    .eq("id", materialId)
    .maybeSingle();

  if (!material) {
    return new Response("Este material no existe o no está disponible.", { status: 404 });
  }

  // PDF e imágenes se abren en el navegador; DOCX se descarga con su nombre
  // original sin acentos (ver nombreDescarga en lib/recursos.ts).
  const extension = material.nombre_archivo.split(".").pop()?.toLowerCase();
  const descargar = extension === "docx";

  const { data: firmado, error } = await supabase.storage
    .from("materiales-actividades")
    .createSignedUrl(
      material.storage_path,
      60 * 5,
      descargar ? { download: nombreDescarga(material.nombre_archivo) } : undefined
    );

  if (error || !firmado) {
    console.error("No se pudo firmar el material:", error);
    return new Response("No se pudo abrir el archivo. Intenta de nuevo.", { status: 500 });
  }

  return NextResponse.redirect(firmado.signedUrl);
}
