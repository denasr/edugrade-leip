// Calificación del estudiante "sobre el total de actividades del curso".
//
// Solo para la vista del estudiante (/estudiante/cursos/[id]) y su reporte
// en PDF, que la reciben ya calculada de obtenerResumenCursoEstudiante. El
// libro de calificaciones del docente, su Excel y el resumen del grupo
// siguen usando lib/calificacion-final.ts (promedio solo de lo calificado):
// a propósito no se toca esa fórmula desde aquí.
//
// Regla (todo en escala 0 a 10):
// - Tareas (incluye cuestionarios) = suma de calificaciones / N_tareas.
// - Exámenes (intento que cuenta hoy) = suma de calificaciones / N_exámenes.
//   En ambos, lo no entregado, no presentado, sin calificar o todavía no
//   creado cuenta 0.
// - N = max(total previsto (5), actividades visibles del curso): ver
//   totalActividadesCurso.
// - Asistencia = presentes / (presentes + ausentes) desde la inscripción,
//   sin justificados; en la fórmula final entra como porcentaje / 10.
// - Final = Σ(valor × peso) / Σ(pesos usados), redondeada a 2 decimales.
// - Tareas y exámenes siempre entran (con 0 si no hay entregas). Solo se
//   excluye la asistencia, si el estudiante no tiene ningún presente ni
//   ausente registrado; entonces el divisor es peso_tareas + peso_exámenes.
//
// Sin imports de ejecución, para que las pruebas de tests/unit lo carguen
// con el test runner de Node sin pasar por Next.

export type ActividadParaPromedio = {
  visible_estudiantes: boolean;
  // Calificación que cuenta hoy (0 a 10); null/undefined si no hay entrega
  // o no está calificada.
  calificacion: number | null | undefined;
};

export type PromedioCategoria = {
  // Suma de las calificaciones de las actividades que cuentan.
  suma: number;
  // N: total previsto de la categoría (ver totalActividadesCurso).
  total: number;
  // Cuántas de las actividades que cuentan ya tienen calificación.
  calificadas: number;
  // suma / total. Nunca null: total es al menos el previsto (5).
  promedio: number;
};

export type PesosParaPromedio = {
  porcentaje_tareas: number;
  porcentaje_examenes: number;
  porcentaje_asistencia: number;
};

export type ResultadoPromedioTotal = {
  tareas: PromedioCategoria;
  examenes: PromedioCategoria;
  porcentajeAsistencia: number | null;
  calificacionFinal: number | null;
  // Categorías con peso que no entraron en la fórmula por no tener con qué
  // calcularse. Hoy solo puede ser la asistencia (sin registros).
  categoriasExcluidas: "asistencia"[];
};

// Total previsto por curso (decisión del docente): todos los cursos tienen
// 5 tareas y 5 exámenes, aunque todavía no estén creados; los que falten
// cuentan 0.
export const TOTAL_TAREAS_PREVISTAS = 5;
export const TOTAL_EXAMENES_PREVISTOS = 5;

// Qué actividades del curso cuentan: las visibles para los estudiantes. Una
// actividad oculta no suma ni divide aunque el estudiante tenga entrega en
// ella (se sigue mostrando en su lista).
export function actividadesQueCuentan<T extends { visible_estudiantes: boolean }>(
  actividades: T[]
): T[] {
  return actividades.filter((a) => a.visible_estudiantes);
}

// ÚNICO lugar donde se decide N (el divisor de cada categoría):
// max(total previsto, actividades visibles). Si el docente crea más de 5,
// N crece con ellas. Para cambiar la regla, cambiarla solo aquí.
export function totalActividadesCurso(
  tipo: "tareas" | "exámenes",
  actividadesVisibles: number
): number {
  const previsto = tipo === "tareas" ? TOTAL_TAREAS_PREVISTAS : TOTAL_EXAMENES_PREVISTOS;
  return Math.max(previsto, actividadesVisibles);
}

export function promedioSobreTotal(
  actividades: ActividadParaPromedio[],
  tipo: "tareas" | "exámenes"
): PromedioCategoria {
  const cuentan = actividadesQueCuentan(actividades);
  let suma = 0;
  let calificadas = 0;
  for (const a of cuentan) {
    if (typeof a.calificacion === "number") {
      suma += a.calificacion;
      calificadas += 1;
    }
  }
  const total = totalActividadesCurso(tipo, cuentan.length);
  return { suma, total, calificadas, promedio: suma / total };
}

// Mismo criterio que calcularPorcentajeAsistencia (lib/calificacion-final.ts);
// se repite aquí para no tener imports de ejecución, y una prueba unitaria
// verifica que den lo mismo.
export function porcentajeAsistenciaSinJustificados(
  presentes: number,
  ausentes: number
): number | null {
  const total = presentes + ausentes;
  return total > 0 ? (presentes / total) * 100 : null;
}

export function calcularPromedioSobreTotal(
  tareas: ActividadParaPromedio[],
  examenes: ActividadParaPromedio[],
  asistencia: { presentes: number; ausentes: number },
  pesos: PesosParaPromedio
): ResultadoPromedioTotal {
  const promTareas = promedioSobreTotal(tareas, "tareas");
  const promExamenes = promedioSobreTotal(examenes, "exámenes");
  const porcentajeAsistencia = porcentajeAsistenciaSinJustificados(
    asistencia.presentes,
    asistencia.ausentes
  );

  const categorias = [
    { valor: promTareas.promedio, peso: pesos.porcentaje_tareas },
    { valor: promExamenes.promedio, peso: pesos.porcentaje_examenes },
  ];
  if (porcentajeAsistencia !== null) {
    categorias.push({ valor: porcentajeAsistencia / 10, peso: pesos.porcentaje_asistencia });
  }
  const sumaPesos = categorias.reduce((s, c) => s + c.peso, 0);
  const cruda =
    sumaPesos > 0 ? categorias.reduce((s, c) => s + c.valor * c.peso, 0) / sumaPesos : null;

  return {
    tareas: promTareas,
    examenes: promExamenes,
    porcentajeAsistencia,
    calificacionFinal: cruda === null ? null : Math.round(cruda * 100) / 100,
    categoriasExcluidas:
      porcentajeAsistencia === null && pesos.porcentaje_asistencia > 0 ? ["asistencia"] : [],
  };
}

// ---- Textos compartidos por la pantalla y el PDF ----

export const ETIQUETA_PROMEDIO_TOTAL = "Promedio sobre el total de actividades del curso";
export const NOTA_PENDIENTES_CERO = "Los pendientes cuentan 0 hasta que se califiquen.";

export function textoNota(valor: number | null, sinValor = "Sin datos"): string {
  return valor === null ? sinValor : `${valor.toFixed(2)}/10`;
}

// "3 de 5 tareas calificadas", "0 de 1 examen calificado".
export function textoAvance(
  categoria: PromedioCategoria,
  tipo: "tareas" | "exámenes"
): string {
  const uno = categoria.total === 1;
  const sustantivo =
    tipo === "tareas"
      ? uno ? "tarea calificada" : "tareas calificadas"
      : uno ? "examen calificado" : "exámenes calificados";
  return `${categoria.calificadas} de ${categoria.total} ${sustantivo}`;
}

// null si todas las categorías con peso entraron en la fórmula.
export function textoCategoriasExcluidas(
  categorias: ResultadoPromedioTotal["categoriasExcluidas"]
): string | null {
  if (!categorias.includes("asistencia")) return null;
  return "Por ahora la asistencia no cuenta: aún no tienes asistencias ni faltas registradas desde tu inscripción. Su peso se reparte entre tareas y exámenes.";
}
