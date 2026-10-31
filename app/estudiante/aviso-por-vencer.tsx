// Etiqueta "Por vencer" para tareas y exámenes que el estudiante todavía no
// entrega y cierran en menos de 2 días (ver cierraPronto en lib/actividades.ts).
export default function AvisoPorVencer() {
  return (
    <span className="badge-por-vencer">
      <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-terracota" />
      Por vencer
    </span>
  );
}
