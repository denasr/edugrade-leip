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
