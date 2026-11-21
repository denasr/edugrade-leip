import {
  CALIFICACION_MINIMA,
  textoPromedioGrupo,
  type ResumenGrupo,
} from "@/lib/resumen-grupo";
import type { PesosCurso } from "@/lib/calificacion-final";

function plural(n: number, singular: string, varios: string): string {
  return `${n} ${n === 1 ? singular : varios}`;
}

// Resumen de aprovechamiento del grupo arriba de la tabla del libro. Los
// números salen de resumirGrupo (lib/resumen-grupo.ts), que solo agrega la
// columna "Final" ya calculada; aquí no se calcula nada.
export function ResumenGrupoLibro({
  resumen,
  pesos,
}: {
  resumen: ResumenGrupo;
  pesos: PesosCurso;
}) {
  const {
    totalInscritos,
    conCalificacion,
    sinCalificacion,
    parciales,
    promedioGrupo,
    debajoDelMinimo,
  } = resumen;

  return (
    <section
      aria-labelledby="titulo-resumen-grupo"
      className="card w-full max-w-4xl p-5"
    >
      <h2
        id="titulo-resumen-grupo"
        className="font-title text-xl text-verde-bosque"
      >
        Resumen del grupo
      </h2>

      {totalInscritos === 0 ? (
        <p className="mt-2 text-sm text-ink/70">
          Sin datos: el curso todavía no tiene estudiantes inscritos, así que
          no hay promedio del grupo ni conteo de calificaciones menores a{" "}
          {CALIFICACION_MINIMA}. Se calculará en cuanto haya estudiantes con
          calificación final.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-verde-bosque/8 p-4">
              <dt className="text-sm text-ink/70">Promedio del grupo</dt>
              <dd className="mt-1 font-title text-3xl text-verde-bosque">
                {textoPromedioGrupo(promedioGrupo)}
              </dd>
              <dd className="mt-1 text-xs text-ink/70">
                {conCalificacion > 0
                  ? `Sobre ${plural(conCalificacion, "estudiante", "estudiantes")} con calificación final`
                  : "Ningún estudiante tiene calificación final todavía"}
              </dd>
            </div>
            <div className="rounded-lg border border-verde-bosque/15 p-4">
              <dt className="text-sm text-ink/70">
                Con calificación final menor a {CALIFICACION_MINIMA}
              </dt>
              <dd
                className={`mt-1 font-title text-3xl ${
                  debajoDelMinimo.length > 0
                    ? "text-terracota"
                    : "text-verde-bosque"
                }`}
              >
                {conCalificacion > 0 ? debajoDelMinimo.length : "Sin datos"}
              </dd>
              <dd className="mt-1 text-xs text-ink/70">
                {conCalificacion > 0
                  ? `De ${plural(conCalificacion, "estudiante", "estudiantes")} con calificación final`
                  : "No hay calificaciones finales que contar"}
              </dd>
            </div>
          </dl>

          {debajoDelMinimo.length > 0 && (
            <details className="mt-3">
              <summary className="link-muted cursor-pointer">
                Ver quiénes ({debajoDelMinimo.length})
              </summary>
              <ul className="mt-1 space-y-1 pl-1 text-sm text-ink">
                {debajoDelMinimo.map((e) => (
                  <li key={e.id}>
                    {e.nombre_completo} —{" "}
                    <span className="font-medium text-terracota">
                      {e.calificacionFinal.toFixed(2)}/10
                    </span>
                    {e.esParcial && (
                      <span className="ml-1 text-xs text-ink/70">
                        (parcial)
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="mt-4 border-t border-verde-bosque/10 pt-3 text-sm text-ink/70">
            <p className="font-medium text-ink">Cómo se calcula</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                Se usa la misma calificación final de la columna
                &ldquo;Final&rdquo; (tareas {pesos.porcentaje_tareas}&nbsp;%,
                exámenes {pesos.porcentaje_examenes}&nbsp;%, asistencia{" "}
                {pesos.porcentaje_asistencia}&nbsp;%). El promedio es simple:
                cada estudiante cuenta igual.
              </li>
              <li>
                {sinCalificacion > 0
                  ? `${plural(sinCalificacion, "estudiante inscrito no tiene", "estudiantes inscritos no tienen")} calificación final (“Sin datos” en la tabla: aún no tiene nada calificado ni asistencias o faltas registradas). No entra${sinCalificacion === 1 ? "" : "n"} en el promedio ni en el conteo, y no cuenta${sinCalificacion === 1 ? "" : "n"} como 0.`
                  : "Todos los estudiantes inscritos tienen calificación final. Quien no tenga ninguna (“Sin datos” en la tabla) no entra en el promedio ni en el conteo, y no cuenta como 0."}
              </li>
              {parciales > 0 && (
                <li>
                  {plural(
                    parciales,
                    "calificación es parcial",
                    "calificaciones son parciales"
                  )}{" "}
                  (le falta alguna categoría) y sí se incluye
                  {parciales === 1 ? "" : "n"}, tal como aparece
                  {parciales === 1 ? "" : "n"} en la tabla.
                </li>
              )}
              <li>
                &ldquo;Menor a {CALIFICACION_MINIMA}&rdquo; no incluye el{" "}
                {CALIFICACION_MINIMA}.0 exacto y se compara con dos decimales:
                un 5.96 aparece como 6.0 en la tabla, pero sí cuenta.
              </li>
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
