import type { createClient } from "@/lib/supabase/client";

// Subida directa del navegador a Supabase Storage, compartida por las
// entregas de tareas y los recursos del curso. Directa (no por una Server
// Action) porque Vercel corta el cuerpo de una petición a ~4.5 MB.

// Casi todas las subidas fallidas en producción fueron "Failed to fetch":
// el celular perdió la conexión a mitad del envío y la petición nunca llegó
// a Storage (el OPTIONS previo sí aparece en los logs, el POST no). Un
// reintento automático salva la mayoría de esos cortes. Safari reporta lo
// mismo como "Load failed".
export function esCorteDeRed(error: { name?: string; message: string }): boolean {
  const m = error.message.toLowerCase();
  return (
    error.name === "StorageUnknownError" ||
    m.includes("failed to fetch") ||
    m.includes("load failed") ||
    m.includes("network")
  );
}

// En una red inestable el navegador puede reenviar la misma petición (o el
// primer intento sí llegó y solo se perdió la respuesta), y entonces Storage
// contesta "The resource already exists". Quien llama debe usar una ruta
// única para este archivo (con un uuid o la carpeta recién vaciada), así que
// lo que ya existe ahí es este mismo archivo: cuenta como subido.
function yaExiste(error: { message: string; statusCode?: string }): boolean {
  return error.statusCode === "409" || error.message.toLowerCase().includes("already exists");
}

const INTENTOS_SUBIDA = 3;

export type ErrorSubida = { name?: string; message: string; statusCode?: string };

export async function subirConReintentos(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  storagePath: string,
  archivo: File,
  contentType: string
): Promise<{ error: ErrorSubida | null }> {
  let ultimoError: ErrorSubida | null = null;
  for (let intento = 1; intento <= INTENTOS_SUBIDA; intento++) {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, archivo, { contentType });
    if (!error || yaExiste(error)) return { error: null };
    ultimoError = error;
    if (!esCorteDeRed(error) || intento === INTENTOS_SUBIDA) break;
    await new Promise((r) => setTimeout(r, 1500 * intento));
  }
  return { error: ultimoError };
}
