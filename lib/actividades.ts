export type Actividad = {
  fecha_apertura: string | null;
  fecha_cierre: string;
  bloqueado_manual: boolean;
};

// Misma regla que actividad_admite_entregas() en la migración.
export function estadoActividad(actividad: Actividad): "ABIERTA" | "CERRADA" {
  if (actividad.bloqueado_manual) return "CERRADA";

  const ahora = Date.now();
  const cierre = new Date(actividad.fecha_cierre).getTime();
  if (ahora > cierre) return "CERRADA";

  if (actividad.fecha_apertura) {
    const apertura = new Date(actividad.fecha_apertura).getTime();
    if (ahora < apertura) return "CERRADA";
  }

  return "ABIERTA";
}
