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

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
const UMBRAL_HORAS_PRECISAS = 6 * HORA;

function pluralizar(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}

// Texto relativo en español para fecha_cierre, ej. "cierra en 2 días",
// "cierra hoy", "cierra en 3 horas", "cerró hace 1 día".
export function textoRelativoCierre(
  fechaCierre: string,
  ahora: Date = new Date()
): string {
  const cierre = new Date(fechaCierre);
  const diffMs = cierre.getTime() - ahora.getTime();
  const pasado = diffMs <= 0;
  const abs = Math.abs(diffMs);

  if (abs < HORA) {
    const min = Math.max(1, Math.round(abs / MINUTO));
    const texto = pluralizar(min, "minuto", "minutos");
    return pasado ? `cerró hace ${texto}` : `cierra en ${texto}`;
  }

  const inicioHoy = new Date(ahora);
  inicioHoy.setHours(0, 0, 0, 0);
  const inicioCierre = new Date(cierre);
  inicioCierre.setHours(0, 0, 0, 0);
  const diffDias = Math.round(
    (inicioCierre.getTime() - inicioHoy.getTime()) / DIA
  );

  if (diffDias === 0) {
    if (abs < UMBRAL_HORAS_PRECISAS) {
      const horas = Math.round(abs / HORA);
      const texto = pluralizar(horas, "hora", "horas");
      return pasado ? `cerró hace ${texto}` : `cierra en ${texto}`;
    }
    return pasado ? "cerró hoy" : "cierra hoy";
  }
  if (diffDias === 1) return "cierra mañana";
  if (diffDias === -1) return "cerró ayer";

  const dias = Math.abs(diffDias);
  const texto = pluralizar(dias, "día", "días");
  return pasado ? `cerró hace ${texto}` : `cierra en ${texto}`;
}

// Convierte una fecha guardada (ISO, timestamptz) al formato que espera un
// <input type="datetime-local"> para precargarlo, en hora local del navegador.
export function fechaParaInput(fechaIso: string | null): string {
  if (!fechaIso) return "";
  const d = new Date(fechaIso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

// Comparador para ordenar actividades por cercanía a su fecha_cierre:
// abiertas primero (la más próxima primero), cerradas al final (la más
// recientemente cerrada primero).
export function compararPorCierre(
  a: { fecha_cierre: string },
  b: { fecha_cierre: string }
): number {
  const ahora = Date.now();
  const ta = new Date(a.fecha_cierre).getTime();
  const tb = new Date(b.fecha_cierre).getTime();
  const aAbierta = ta >= ahora;
  const bAbierta = tb >= ahora;

  if (aAbierta && !bAbierta) return -1;
  if (!aAbierta && bAbierta) return 1;
  if (aAbierta && bAbierta) return ta - tb;
  return tb - ta;
}
