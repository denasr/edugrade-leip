// Pruebas locales del resumen de aprovechamiento del grupo (libro de
// calificaciones). Solo datos sintéticos: no se conectan a Supabase.
// Correr con `npm test`.
//
// Las calificaciones finales de cada estudiante se construyen con las
// mismas funciones que usa el libro (lib/calificacion-final.ts), para
// probar el resumen sobre exactamente los valores que muestra la tabla.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularCalificacionFinal,
  calcularPorcentajeAsistencia,
  promedioCalificaciones,
  type PesosCurso,
  type ResultadoCalificacionFinal,
} from "../../lib/calificacion-final.ts";
import {
  CALIFICACION_MINIMA,
  resumirGrupo,
  textoPromedioGrupo,
  type EstudianteParaResumen,
} from "../../lib/resumen-grupo.ts";

const PESOS: PesosCurso = {
  porcentaje_tareas: 40,
  porcentaje_examenes: 50,
  porcentaje_asistencia: 10,
};

let siguienteId = 0;

// Arma un estudiante igual que obtenerLibroCalificaciones: promedio simple
// de tareas y exámenes calificados (null = sin entregar / sin calificar),
// % de asistencia con presentes/ausentes (justificados ya excluidos) y
// calificación final combinada con los pesos del curso.
function estudiante(
  nombre: string,
  datos: {
    tareas?: (number | null)[];
    examenes?: (number | null)[];
    presentes?: number;
    ausentes?: number;
  },
  pesos: PesosCurso = PESOS
): EstudianteParaResumen & { resultado: ResultadoCalificacionFinal } {
  siguienteId += 1;
  return {
    id: `est-${siguienteId}`,
    nombre_completo: nombre,
    resultado: calcularCalificacionFinal(
      promedioCalificaciones(datos.tareas ?? []),
      promedioCalificaciones(datos.examenes ?? []),
      calcularPorcentajeAsistencia(datos.presentes ?? 0, datos.ausentes ?? 0),
      pesos
    ),
  };
}

// Estudiante con una calificación final exacta, para probar umbrales sin
// depender de cómo se combinan las categorías.
function conFinal(
  nombre: string,
  calificacionFinal: number | null,
  esParcial = false
): EstudianteParaResumen {
  siguienteId += 1;
  return {
    id: `est-${siguienteId}`,
    nombre_completo: nombre,
    resultado: { calificacionFinal, esParcial },
  };
}

test("grupo vacío: sin promedio (no 0) y nadie debajo del mínimo", () => {
  const r = resumirGrupo([]);
  assert.deepEqual(r, {
    totalInscritos: 0,
    conCalificacion: 0,
    sinCalificacion: 0,
    parciales: 0,
    promedioGrupo: null,
    debajoDelMinimo: [],
  });
  assert.equal(textoPromedioGrupo(r.promedioGrupo), "Sin datos");
});

test("inscritos sin ninguna calificación final: sin promedio y conteo 0, todos como 'sin calificación'", () => {
  const r = resumirGrupo([
    estudiante("Ana", {}),
    estudiante("Beto", { tareas: [null], examenes: [null] }),
  ]);
  assert.equal(r.totalInscritos, 2);
  assert.equal(r.conCalificacion, 0);
  assert.equal(r.sinCalificacion, 2);
  assert.equal(r.promedioGrupo, null);
  assert.deepEqual(r.debajoDelMinimo, []);
});

test("un estudiante sin calificación final no cuenta como 0 en el promedio", () => {
  const r = resumirGrupo([
    estudiante("Ana", { tareas: [8], examenes: [8], presentes: 1 }), // 8.2
    estudiante("Beto", {}), // Sin datos
  ]);
  // (8*40 + 8*50 + 10*10) / 100 = 8.2. Si Beto contara como 0 daría 4.1.
  assert.equal(r.promedioGrupo, 8.2);
  assert.equal(r.conCalificacion, 1);
  assert.equal(r.sinCalificacion, 1);
  assert.deepEqual(r.debajoDelMinimo, []);
});

test("el umbral es estricto: 6.00 no cuenta, 5.99 sí", () => {
  const r = resumirGrupo([
    conFinal("Seis exacto", 6),
    conFinal("Casi seis", 5.99),
    conFinal("Aprobado", 9.5),
  ]);
  assert.equal(CALIFICACION_MINIMA, 6);
  assert.deepEqual(
    r.debajoDelMinimo.map((e) => e.nombre_completo),
    ["Casi seis"]
  );
});

test("un 5.96 se muestra como 6.0 en la tabla pero sí cuenta como menor a 6", () => {
  // tarea 5.96 y examen 5.96, sin asistencia → final 5.96 tras redistribuir.
  const e = estudiante("Redondeo", { tareas: [5.96], examenes: [5.96] });
  assert.equal(e.resultado.calificacionFinal, 5.96);
  // Mismo formato que textoCalificacionFinalBase en el libro.
  assert.equal(e.resultado.calificacionFinal!.toFixed(1), "6.0");
  const r = resumirGrupo([e]);
  assert.equal(r.debajoDelMinimo.length, 1);
  assert.equal(r.debajoDelMinimo[0].calificacionFinal, 5.96);
});

test("las calificaciones parciales se incluyen y se cuentan aparte", () => {
  const r = resumirGrupo([
    // Sin asistencia: el peso se reparte entre tareas y exámenes.
    // (6*40 + 5*50) / 90 = 5.444… → 5.44 (mismo caso que la prueba e2e).
    estudiante("Parcial", { tareas: [6], examenes: [5] }),
    estudiante("Completa", { tareas: [10], examenes: [10], presentes: 4 }),
  ]);
  assert.equal(r.parciales, 1);
  assert.equal(r.conCalificacion, 2);
  assert.equal(r.promedioGrupo, Math.round(((5.44 + 10) / 2) * 100) / 100);
  assert.deepEqual(r.debajoDelMinimo, [
    {
      id: r.debajoDelMinimo[0].id,
      nombre_completo: "Parcial",
      calificacionFinal: 5.44,
      esParcial: true,
    },
  ]);
});

test("el promedio del grupo es simple, sobre la calificación final de cada estudiante, y se redondea a 2 decimales", () => {
  const estudiantes = [
    estudiante("A", { tareas: [7, 9], examenes: [6], presentes: 3, ausentes: 1 }),
    estudiante("B", { tareas: [10, null], examenes: [4.5], presentes: 2, ausentes: 2 }),
    estudiante("C", { tareas: [5], examenes: [null], presentes: 1, ausentes: 3 }),
  ];
  const finales = estudiantes.map((e) => e.resultado.calificacionFinal!);
  // A: (8*40 + 6*50 + 7.5*10)/100 = 6.95
  // B: (10*40 + 4.5*50 + 5*10)/100 = 6.75
  // C: sin exámenes → (5*40 + 2.5*10)/50 = 4.5
  assert.deepEqual(finales, [6.95, 6.75, 4.5]);
  const r = resumirGrupo(estudiantes);
  // (6.95 + 6.75 + 4.5) / 3 = 6.0666… → 6.07, se muestra "6.1/10".
  assert.equal(r.promedioGrupo, 6.07);
  assert.equal(textoPromedioGrupo(r.promedioGrupo), "6.1/10");
  assert.deepEqual(
    r.debajoDelMinimo.map((e) => e.nombre_completo),
    ["C"]
  );
});

test("la lista de menores a 6 va de la nota más baja a la más alta, y por nombre si empatan", () => {
  const r = resumirGrupo([
    conFinal("Zoe", 5),
    conFinal("Ángel", 5),
    conFinal("Bruno", 2.3),
    conFinal("Carla", 7),
  ]);
  assert.deepEqual(
    r.debajoDelMinimo.map((e) => e.nombre_completo),
    ["Bruno", "Ángel", "Zoe"]
  );
});

test("solo justificados: la asistencia no tiene datos y no baja la nota", () => {
  const e = estudiante("Justificado", { tareas: [9], presentes: 0, ausentes: 0 });
  assert.equal(e.resultado.porcentajeAsistencia, null);
  assert.equal(e.resultado.calificacionFinal, 9);
  assert.equal(resumirGrupo([e]).debajoDelMinimo.length, 0);
});

test("categoría con peso 0: si es lo único con datos, no hay calificación final", () => {
  const pesos = {
    porcentaje_tareas: 50,
    porcentaje_examenes: 50,
    porcentaje_asistencia: 0,
  };
  const r = resumirGrupo([
    estudiante("Solo asistencia", { presentes: 5 }, pesos),
    estudiante("Con tarea", { tareas: [4], presentes: 5 }, pesos),
  ]);
  assert.equal(r.sinCalificacion, 1);
  assert.equal(r.promedioGrupo, 4);
  assert.equal(r.debajoDelMinimo.length, 1);
});

test("dos cuentas inscritas con el mismo nombre cuentan como dos estudiantes (no se deduplica)", () => {
  const r = resumirGrupo([conFinal("María López", 5), conFinal("María López", 5)]);
  assert.equal(r.totalInscritos, 2);
  assert.equal(r.debajoDelMinimo.length, 2);
});

test("no modifica ni reordena el arreglo de estudiantes del libro", () => {
  const estudiantes = [conFinal("B", 3), conFinal("A", 9), conFinal("C", 1)];
  const copia = structuredClone(estudiantes);
  resumirGrupo(estudiantes);
  assert.deepEqual(estudiantes, copia);
});
