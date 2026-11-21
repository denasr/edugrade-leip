import type { ResultadoCalificacionFinal } from "@/lib/calificacion-final";

// Resumen de aprovechamiento del grupo para el libro de calificaciones del
// docente. No calcula ninguna nota: toma la calificación final que el libro
// ya calculó para cada estudiante (lib/libro-calificaciones.ts →
// calcularCalificacionFinal) y solo la agrega. Así el resumen nunca puede
// contradecir la columna "Final" de la tabla.
//
// Reglas (se explican también en pantalla, ver resumen-grupo.tsx):
// - Base: los estudiantes inscritos que tienen calificación final. Un
//   estudiante sin ninguna categoría con datos (calificacionFinal null, la
//   tabla dice "Sin datos") se excluye del promedio y del conteo; no cuenta
//   como 0, misma regla que dentro de calcularCalificacionFinal.
// - Una calificación parcial sí entra: es la que muestra la tabla. Se cuenta
//   aparte para que el docente sepa cuántas son.
// - El promedio es simple (cada estudiante pesa igual) sobre el valor que
//   devuelve calcularCalificacionFinal (ya redondeado a 2 decimales), y se
//   redondea a 2 decimales igual que esa función.
// - "Menor a 6" es estricto y se compara con ese mismo valor de 2 decimales,
//   no con el texto de la tabla (que usa 1 decimal): un 5.96 aparece como
//   "6.0/10" en la tabla y sí cuenta como menor a 6.
// - Grupo vacío o sin ninguna calificación final: promedio null ("Sin
//   datos"), nunca 0.

export const CALIFICACION_MINIMA = 6;

export type EstudianteParaResumen = {
  id: string;
  nombre_completo: string;
  resultado: Pick<ResultadoCalificacionFinal, "calificacionFinal" | "esParcial">;
};

export type EstudianteDebajoDelMinimo = {
  id: string;
  nombre_completo: string;
  calificacionFinal: number;
  esParcial: boolean;
};

export type ResumenGrupo = {
  totalInscritos: number;
  conCalificacion: number;
  sinCalificacion: number;
  parciales: number;
  promedioGrupo: number | null;
  debajoDelMinimo: EstudianteDebajoDelMinimo[];
};

export function resumirGrupo(estudiantes: EstudianteParaResumen[]): ResumenGrupo {
  const conNota = estudiantes.filter(
    (e): e is EstudianteParaResumen & {
      resultado: { calificacionFinal: number; esParcial: boolean };
    } =>
      typeof e.resultado.calificacionFinal === "number" &&
      Number.isFinite(e.resultado.calificacionFinal)
  );

  const suma = conNota.reduce((s, e) => s + e.resultado.calificacionFinal, 0);
  const promedioGrupo =
    conNota.length > 0 ? Math.round((suma / conNota.length) * 100) / 100 : null;

  const debajoDelMinimo = conNota
    .filter((e) => e.resultado.calificacionFinal < CALIFICACION_MINIMA)
    .map((e) => ({
      id: e.id,
      nombre_completo: e.nombre_completo,
      calificacionFinal: e.resultado.calificacionFinal,
      esParcial: e.resultado.esParcial,
    }))
    .sort(
      (a, b) =>
        a.calificacionFinal - b.calificacionFinal ||
        a.nombre_completo.localeCompare(b.nombre_completo, "es")
    );

  return {
    totalInscritos: estudiantes.length,
    conCalificacion: conNota.length,
    sinCalificacion: estudiantes.length - conNota.length,
    parciales: conNota.filter((e) => e.resultado.esParcial).length,
    promedioGrupo,
    debajoDelMinimo,
  };
}

// Texto del promedio del grupo con 1 decimal, mismo formato que la columna
// "Final" (textoCalificacionFinalBase).
export function textoPromedioGrupo(promedio: number | null): string {
  return promedio !== null ? `${promedio.toFixed(1)}/10` : "Sin datos";
}
