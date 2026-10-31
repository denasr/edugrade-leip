import mammoth from "mammoth";

// Cómo se muestra cada archivo de una entrega dentro del modo revisión
// del docente (/docente/actividades/[id]/revisar/[entregaId]). Por
// extensión, mismo criterio que formulario-entrega.tsx: File.type no es
// confiable y en Storage solo queda el nombre.
export type TipoVistaPrevia = "pdf" | "imagen" | "docx" | "ninguna";

export function tipoVistaPrevia(nombreArchivo: string): TipoVistaPrevia {
  const extension = nombreArchivo.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "pdf") return "pdf";
  // HEIC/HEIF no: solo Safari lo muestra, el resto de los navegadores no.
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(extension)) return "imagen";
  if (extension === "docx") return "docx";
  return "ninguna";
}

// Un .docx no lo muestra ningún navegador. Se convierte a HTML aquí en el
// servidor con mammoth en vez de mandarlo a un visor externo (p. ej. el de
// Microsoft Office), para que el trabajo del estudiante no salga a otro
// servicio. Es una aproximación: conserva texto, títulos, listas, tablas e
// imágenes, pero no márgenes, fuentes ni encabezados de página — por eso
// el modo revisión siempre deja también el enlace de descarga.
//
// El HTML resultante se muestra en un <iframe sandbox> sin scripts (ver
// vista-previa-entrega.tsx), así que un enlace o contenido raro dentro del
// documento no puede ejecutar nada en la página del docente.
export async function docxAHtml(contenido: ArrayBuffer): Promise<string | null> {
  try {
    const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(contenido) });
    return value.trim() ? value : null;
  } catch (err) {
    console.error("No se pudo convertir el .docx para la vista previa:", err);
    return null;
  }
}
