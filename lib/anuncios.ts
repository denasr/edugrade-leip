export type Anuncio = {
  id: string;
  curso_id: string;
  contenido: string;
  fijado: boolean;
  created_at: string;
  editado_at: string | null;
};

export const LARGO_MAXIMO_ANUNCIO = 4000;

const DIA = 24 * 60 * 60 * 1000;

export const COLUMNAS_ANUNCIO = "id, curso_id, contenido, fijado, created_at, editado_at";

// Hora de Zacatecas aunque se renderice en el servidor (Vercel corre en
// UTC) — mismo criterio que el reporte en PDF.
export function fechaAnuncio(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

// "Nuevo" para el estudiante: publicado en los últimos 3 días. No se lleva
// registro de qué anuncios ya leyó cada quien — esto basta para que lo
// reciente destaque sin una tabla más.
export function esAnuncioNuevo(createdAt: string, ahora: Date = new Date()): boolean {
  return ahora.getTime() - new Date(createdAt).getTime() < 3 * DIA;
}

// Desde cuándo un anuncio todavía aparece en el panel principal del
// estudiante (el tablón completo vive en la página de cada curso).
export function inicioAnunciosRecientes(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - 7 * DIA).toISOString();
}
