// Recursos del curso (migración 20261111120000): material de consulta del
// docente organizado por unidades, fuera de tareas y exámenes.

export const BUCKET_RECURSOS = "recursos-curso";

export const LARGO_MAXIMO_TITULO = 200;
export const LARGO_MAXIMO_DESCRIPCION = 1000;
// Igual que file_size_limit del bucket.
export const TAMANO_MAXIMO_RECURSO_BYTES = 25 * 1024 * 1024;

// Tipo por extensión, no por `File.type` (llega vacío o no estándar en
// algunos sistemas; ver formulario-entrega.tsx). Debe coincidir con
// allowed_mime_types del bucket.
const TIPO_POR_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export const ACCEPT_RECURSOS = ".pdf,.docx,.pptx,.jpg,.jpeg,.png";
export const FORMATOS_RECURSOS_TEXTO = "PDF, DOCX, PPTX, JPG o PNG";

export function tipoDeArchivoRecurso(nombre: string): string | null {
  const extension = nombre.split(".").pop()?.toLowerCase() ?? "";
  return TIPO_POR_EXTENSION[extension] ?? null;
}

export type Recurso = {
  id: string;
  unidad_id: string;
  titulo: string;
  descripcion: string | null;
  tipo: "ARCHIVO" | "ENLACE";
  url: string | null;
  nombre_archivo: string | null;
  storage_path: string | null;
  tamano_bytes: number | null;
  orden: number;
  visible: boolean;
};

export type Unidad = {
  id: string;
  titulo: string;
  orden: number;
  visible: boolean;
};

export type UnidadConRecursos = Unidad & { recursos: Recurso[] };

export const COLUMNAS_UNIDAD = "id, titulo, orden, visible";
export const COLUMNAS_RECURSO =
  "id, unidad_id, titulo, descripcion, tipo, url, nombre_archivo, storage_path, tamano_bytes, orden, visible";

// Orden estable: por `orden` y, de empate, por título.
function porOrden<T extends { orden: number; titulo: string }>(a: T, b: T) {
  return a.orden - b.orden || a.titulo.localeCompare(b.titulo, "es");
}

export function agruparPorUnidad(unidades: Unidad[], recursos: Recurso[]): UnidadConRecursos[] {
  return [...unidades].sort(porOrden).map((unidad) => ({
    ...unidad,
    recursos: recursos.filter((r) => r.unidad_id === unidad.id).sort(porOrden),
  }));
}

// Solo http(s): un "javascript:" o similar en un href sería un riesgo.
export function normalizarUrl(texto: string): string | null {
  const limpio = texto.trim();
  if (!limpio) return null;
  const conEsquema = /^[a-z][a-z0-9+.-]*:/i.test(limpio) ? limpio : `https://${limpio}`;
  try {
    const url = new URL(conEsquema);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

// Nombre para la descarga (parámetro `download` del enlace firmado). El SDK
// de Storage lo codifica dos veces, y un acento o un paréntesis llegaban al
// navegador como "Presentaci%C3%B3n %28final%29.pptx" (comprobado contra el
// Content-Disposition real). Letras sin acento, números, espacios, punto,
// guion y guion bajo sí llegan intactos.
export function nombreDescarga(nombreOriginal: string): string {
  const limpio = nombreOriginal
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ._-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ (\.[A-Za-z0-9]+)$/, "$1")
    .replace(/^[-. ]+/, "")
    .trim();
  return limpio || "archivo";
}

export function dominioDeUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function tamanoLegible(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
