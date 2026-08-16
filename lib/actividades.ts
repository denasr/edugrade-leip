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

// Explica por qué una actividad CERRADA no admite entregas.
export function motivoCierre(actividad: Actividad): string | null {
  if (estadoActividad(actividad) === "ABIERTA") return null;
  if (actividad.bloqueado_manual) return "Bloqueada por el docente.";

  const ahora = Date.now();
  if (actividad.fecha_apertura && ahora < new Date(actividad.fecha_apertura).getTime()) {
    return `Abre el ${new Date(actividad.fecha_apertura).toLocaleString("es-MX")}.`;
  }
  return `Cerró el ${new Date(actividad.fecha_cierre).toLocaleString("es-MX")}.`;
}
