// Convierte un nombre de archivo original (que puede traer espacios, acentos,
// paréntesis, etc.) en una key segura para Supabase Storage, que rechaza
// ciertos caracteres con "Invalid key". Conserva la extensión; el nombre
// legible para el usuario (columna nombre_archivo) nunca pasa por aquí, se
// guarda el original tal cual.
export function nombreArchivoSeguro(nombreOriginal: string): string {
  const puntoIndex = nombreOriginal.lastIndexOf(".");
  const tieneExtension = puntoIndex > 0 && puntoIndex < nombreOriginal.length - 1;
  const base = tieneExtension ? nombreOriginal.slice(0, puntoIndex) : nombreOriginal;
  const extension = tieneExtension ? nombreOriginal.slice(puntoIndex + 1) : "";

  const baseSegura =
    base
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // quita acentos (á->a, ñ->n, etc.)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "archivo";

  const extensionSegura = extension.toLowerCase().replace(/[^a-z0-9]/g, "");

  return extensionSegura ? `${baseSegura}.${extensionSegura}` : baseSegura;
}
