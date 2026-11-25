// Pruebas del promedio "sobre el total de actividades del curso" que ve el
// estudiante en su curso y en su reporte PDF (lib/promedio-total-curso.ts).
// Solo datos sintéticos: no se conectan a Supabase. Correr con `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularPorcentajeAsistencia } from "../../lib/calificacion-final.ts";
import {
  TOTAL_EXAMENES_PREVISTOS,
  TOTAL_TAREAS_PREVISTAS,
  actividadesQueCuentan,
  calcularPromedioSobreTotal,
  porcentajeAsistenciaSinJustificados,
  promedioSobreTotal,
  textoAvance,
  textoCategoriasExcluidas,
  totalActividadesCurso,
  type ActividadParaPromedio,
  type PesosParaPromedio,
} from "../../lib/promedio-total-curso.ts";

const PESOS: PesosParaPromedio = {
  porcentaje_tareas: 40,
  porcentaje_examenes: 40,
  porcentaje_asistencia: 20,
};

// n actividades visibles; las primeras llevan las calificaciones dadas, el
// resto quedan sin calificar (null) o sin entregar (undefined).
function visibles(n: number, calificaciones: (number | null | undefined)[] = []): ActividadParaPromedio[] {
  return Array.from({ length: n }, (_, i) => ({
    visible_estudiantes: true,
    calificacion: calificaciones[i],
  }));
}

test("N es max(5, actividades visibles)", () => {
  assert.equal(TOTAL_TAREAS_PREVISTAS, 5);
  assert.equal(TOTAL_EXAMENES_PREVISTOS, 5);
  assert.equal(totalActividadesCurso("tareas", 0), 5);
  assert.equal(totalActividadesCurso("tareas", 3), 5);
  assert.equal(totalActividadesCurso("exámenes", 5), 5);
  assert.equal(totalActividadesCurso("exámenes", 7), 7);
});

test("los pendientes (sin entregar o sin calificar) cuentan 0", () => {
  // 5 tareas: 8 y 9 calificadas, una entregada sin calificar, dos sin entregar.
  const r = promedioSobreTotal(visibles(5, [8, 9, null]), "tareas");
  assert.equal(r.total, 5);
  assert.equal(r.calificadas, 2);
  assert.equal(r.suma, 17);
  assert.equal(r.promedio, 17 / 5); // 3.4, no 8.5
  assert.equal(textoAvance(r, "tareas"), "2 de 5 tareas calificadas");
});

test("ejemplo completo con 5 + 5 actividades y pesos 40/40/20", () => {
  // Tareas: (8+9+10)/5 = 5.4. Exámenes: (7+6)/5 = 2.6.
  // Asistencia: 9 presentes, 1 ausente (los justificados no llegan aquí) → 90% → 9.
  // Final = (5.4·40 + 2.6·40 + 9·20) / 100 = (216 + 104 + 180) / 100 = 5.00
  const r = calcularPromedioSobreTotal(
    visibles(5, [8, 9, 10]),
    visibles(5, [7, 6]),
    { presentes: 9, ausentes: 1 },
    PESOS
  );
  assert.equal(r.tareas.promedio, 5.4);
  assert.equal(r.examenes.promedio, 2.6);
  assert.equal(r.porcentajeAsistencia, 90);
  assert.equal(r.calificacionFinal, 5);
  assert.deepEqual(r.categoriasExcluidas, []);
  assert.equal(textoCategoriasExcluidas(r.categoriasExcluidas), null);
});

test("curso con 3 tareas y 2 exámenes creados: se divide entre 5 y 5", () => {
  // Caso de Introducción a la Psicología: las que faltan por crear cuentan 0.
  // Tareas: (10+9+8)/5 = 5.4 (no 9.0). Exámenes: (10+8)/5 = 3.6 (no 9.0).
  // Asistencia 100% → 10. Final = (5.4·40 + 3.6·40 + 10·20) / 100 = 5.6
  const r = calcularPromedioSobreTotal(
    visibles(3, [10, 9, 8]),
    visibles(2, [10, 8]),
    { presentes: 6, ausentes: 0 },
    PESOS
  );
  assert.equal(r.tareas.total, 5);
  assert.equal(r.examenes.total, 5);
  assert.equal(r.tareas.promedio, 5.4);
  assert.equal(r.examenes.promedio, 3.6);
  assert.equal(r.calificacionFinal, 5.6);
  assert.equal(textoAvance(r.tareas, "tareas"), "3 de 5 tareas calificadas");
  assert.equal(textoAvance(r.examenes, "exámenes"), "2 de 5 exámenes calificados");
});

test("si el docente crea más de 5, N crece con ellas", () => {
  const r = promedioSobreTotal(visibles(6, [10, 10, 10, 10, 10, 10]), "tareas");
  assert.equal(r.total, 6);
  assert.equal(r.promedio, 10);
});

test("sin ninguna entrega, tareas y exámenes cuentan 0 pero no se excluyen", () => {
  const r = calcularPromedioSobreTotal(
    visibles(5),
    visibles(5),
    { presentes: 4, ausentes: 1 }, // 80% → 8
    PESOS
  );
  assert.equal(r.tareas.promedio, 0);
  assert.equal(r.examenes.promedio, 0);
  // (0·40 + 0·40 + 8·20) / 100 = 1.6
  assert.equal(r.calificacionFinal, 1.6);
  assert.deepEqual(r.categoriasExcluidas, []);
});

test("curso sin tareas creadas: cuentan 0 sobre 5, no se excluyen", () => {
  const r = calcularPromedioSobreTotal(
    [],
    visibles(5, [10, 10, 10, 10, 10]), // 10
    { presentes: 1, ausentes: 0 }, // 100% → 10
    PESOS
  );
  assert.equal(r.tareas.total, 5);
  assert.equal(r.tareas.promedio, 0);
  assert.equal(textoAvance(r.tareas, "tareas"), "0 de 5 tareas calificadas");
  // (0·40 + 10·40 + 10·20) / 100 = 6
  assert.equal(r.calificacionFinal, 6);
  assert.deepEqual(r.categoriasExcluidas, []);
});

test("asistencia sin registros: se excluye y el divisor es tareas + exámenes", () => {
  const r = calcularPromedioSobreTotal(
    visibles(5, [10, 10, 10]), // 6
    visibles(5, [9]), // 1.8
    { presentes: 0, ausentes: 0 },
    PESOS
  );
  assert.equal(r.porcentajeAsistencia, null);
  // (6·40 + 1.8·40) / 80 = 3.9
  assert.equal(r.calificacionFinal, 3.9);
  assert.deepEqual(r.categoriasExcluidas, ["asistencia"]);
  assert.match(textoCategoriasExcluidas(r.categoriasExcluidas)!, /asistencia no cuenta/);
});

test("los justificados no cuentan ni como presente ni como ausente", () => {
  // Un estudiante con 3 presentes, 1 ausente y 4 justificados tiene 75%,
  // no 3/8: obtenerResumenCursoEstudiante solo pasa presentes y ausentes.
  assert.equal(porcentajeAsistenciaSinJustificados(3, 1), 75);
  const r = calcularPromedioSobreTotal(
    visibles(5, [10, 10, 10, 10, 10]),
    visibles(5, [10, 10, 10, 10, 10]),
    { presentes: 3, ausentes: 1 },
    PESOS
  );
  // (10·40 + 10·40 + 7.5·20) / 100 = 9.5
  assert.equal(r.calificacionFinal, 9.5);
});

test("solo justificados equivale a no tener registros: la asistencia se excluye", () => {
  const r = calcularPromedioSobreTotal(
    visibles(5, [10, 10, 10, 10]), // 8
    visibles(5, [10, 10, 10]), // 6
    { presentes: 0, ausentes: 0 },
    PESOS
  );
  assert.equal(r.porcentajeAsistencia, null);
  assert.equal(r.calificacionFinal, 7); // (8·40 + 6·40) / 80
});

test("el porcentaje de asistencia coincide con el de lib/calificacion-final.ts", () => {
  for (const [p, a] of [[0, 0], [1, 0], [0, 3], [2, 1], [7, 5], [30, 2]]) {
    assert.equal(porcentajeAsistenciaSinJustificados(p, a), calcularPorcentajeAsistencia(p, a));
  }
});

test("las actividades ocultas no entran en N ni suman, aunque tengan calificación", () => {
  const actividades: ActividadParaPromedio[] = [
    ...visibles(5, [6]),
    { visible_estudiantes: false, calificacion: 10 },
  ];
  assert.equal(actividadesQueCuentan(actividades).length, 5);
  const r = promedioSobreTotal(actividades, "tareas");
  assert.equal(r.total, 5);
  assert.equal(r.promedio, 1.2);
});

test("la nota final se redondea a 2 decimales", () => {
  // Tareas 7/5 = 1.4, exámenes 0, asistencia 2/3 → 6.666…
  // (1.4·40 + 0 + 6.666…·20) / 100 = 1.8933… → 1.89
  const r = calcularPromedioSobreTotal(visibles(5, [7]), visibles(5), { presentes: 2, ausentes: 1 }, PESOS);
  assert.equal(r.calificacionFinal, 1.89);
});

test("textos de avance en singular y plural", () => {
  assert.equal(textoAvance({ suma: 0, total: 1, calificadas: 0, promedio: 0 }, "exámenes"), "0 de 1 examen calificado");
  assert.equal(textoAvance(promedioSobreTotal(visibles(2, [9]), "exámenes"), "exámenes"), "1 de 5 exámenes calificados");
});
