// Quién de los inscritos no ha entregado una actividad. Lo usan la vista
// /docente/actividades/[id]/faltantes y el conteo de la tarjeta en la
// pestaña Tareas, para que el número del enlace y la lista nunca difieran.
//
// Mismo criterio que tieneEntregaReal (lib/resumen-curso-estudiante.ts) en
// la vista del estudiante: una entrega de tarea sin archivos ni calificación
// es un intento que se quedó a medias (ver crearEntrega) y cuenta como "sin
// entregar". Un cuestionario o examen nunca lleva archivo: ahí basta con que
// exista la entrega.

export type EntregaParaFaltantes = {
  estudiante_id: string;
  numArchivos: number;
  calificada: boolean;
};

export function entregaCuenta(
  entrega: EntregaParaFaltantes,
  sinArchivo: boolean
): boolean {
  if (sinArchivo) return true;
  return entrega.numArchivos > 0 || entrega.calificada;
}

export type Faltante = {
  estudiante_id: string;
  // Tiene fila en `entregas` pero a medias (sin archivos ni calificación):
  // el estudiante intentó entregar y la subida no terminó.
  aMedias: boolean;
};

export function calcularFaltantes(
  estudianteIds: string[],
  entregas: EntregaParaFaltantes[],
  sinArchivo: boolean
): Faltante[] {
  const entregaPorEstudiante = new Map(
    entregas.map((e) => [e.estudiante_id, e])
  );
  const faltantes: Faltante[] = [];
  for (const estudianteId of estudianteIds) {
    const entrega = entregaPorEstudiante.get(estudianteId);
    if (entrega && entregaCuenta(entrega, sinArchivo)) continue;
    faltantes.push({ estudiante_id: estudianteId, aMedias: entrega !== undefined });
  }
  return faltantes;
}
