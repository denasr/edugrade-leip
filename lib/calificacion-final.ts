// Porcentaje de asistencia de un estudiante: presentes sobre presentes +
// ausentes. Los registros 'justificado' se excluyen de ambos — ni suman al
// numerador ni al denominador. Si no hay presentes ni ausentes (p. ej. un
// estudiante con solo justificados, o sin registros todavía), no hay datos
// para esta categoría: null, no una división entre cero.
export function calcularPorcentajeAsistencia(
  presentes: number,
  ausentes: number
): number | null {
  const total = presentes + ausentes;
  return total > 0 ? (presentes / total) * 100 : null;
}

// Promedio de las calificaciones ya obtenidas (tareas o exámenes), ignorando
// las actividades sin entregar/sin calificar en vez de contarlas como 0 —
// misma regla que categoriasFaltantes: falta de datos no es una nota mala.
export function promedioCalificaciones(
  calificaciones: (number | null | undefined)[]
): number | null {
  const validas = calificaciones.filter(
    (v): v is number => v !== null && v !== undefined
  );
  return validas.length > 0
    ? validas.reduce((a, b) => a + b, 0) / validas.length
    : null;
}

export type PesosCurso = {
  porcentaje_tareas: number;
  porcentaje_examenes: number;
  porcentaje_asistencia: number;
};

export type ResultadoCalificacionFinal = {
  promedioTareas: number | null;
  promedioExamenes: number | null;
  porcentajeAsistencia: number | null;
  calificacionFinal: number | null;
  categoriasFaltantes: string[];
  esParcial: boolean;
};

// Combina los tres subtotales usando los pesos del curso. Una categoría sin
// datos (null) se excluye del cálculo y su peso se reparte proporcionalmente
// entre las categorías que sí tienen datos — sumar solo valor×peso de las
// disponibles y dividir entre la suma de esos pesos logra exactamente eso,
// sin necesidad de recalcular porcentajes redistribuidos explícitamente.
// Una categoría con peso 0% no cuenta como "faltante" aunque no tenga datos:
// el docente ya decidió que no importa, no es que falte información.
export function calcularCalificacionFinal(
  promedioTareas: number | null,
  promedioExamenes: number | null,
  porcentajeAsistencia: number | null,
  pesos: PesosCurso
): ResultadoCalificacionFinal {
  const categorias = [
    {
      nombre: "tareas",
      valorSobreDiez: promedioTareas,
      peso: pesos.porcentaje_tareas,
    },
    {
      nombre: "exámenes",
      valorSobreDiez: promedioExamenes,
      peso: pesos.porcentaje_examenes,
    },
    {
      nombre: "asistencia",
      valorSobreDiez:
        porcentajeAsistencia === null ? null : porcentajeAsistencia / 10,
      peso: pesos.porcentaje_asistencia,
    },
  ];

  const disponibles = categorias.filter(
    (c) => c.valorSobreDiez !== null && c.peso > 0
  );
  const pesoTotal = disponibles.reduce((suma, c) => suma + c.peso, 0);

  const calificacionCruda =
    pesoTotal > 0
      ? disponibles.reduce(
          (suma, c) => suma + c.valorSobreDiez! * c.peso,
          0
        ) / pesoTotal
      : null;

  const categoriasFaltantes = categorias
    .filter((c) => c.valorSobreDiez === null && c.peso > 0)
    .map((c) => c.nombre);

  return {
    promedioTareas,
    promedioExamenes,
    porcentajeAsistencia,
    calificacionFinal:
      calificacionCruda !== null
        ? Math.round(calificacionCruda * 100) / 100
        : null,
    categoriasFaltantes,
    esParcial: categoriasFaltantes.length > 0,
  };
}

const DETALLE_CATEGORIA_FALTANTE: Record<string, string> = {
  tareas: "aún no tienes tareas calificadas en este curso",
  "exámenes": "aún no tienes exámenes calificados en este curso",
  asistencia: "aún no se ha tomado asistencia en este curso",
};

export function textoNotaParcial(categoriasFaltantes: string[]): string | null {
  if (categoriasFaltantes.length === 0) return null;
  const partes = categoriasFaltantes.map(
    (c) => DETALLE_CATEGORIA_FALTANTE[c] ?? c
  );
  return `Calificación parcial: ${partes.join("; ")}.`;
}
