// Pruebas locales de lo que comparte la app para cerrar / abrir
// inscripciones (lib/inscripciones-curso.ts). Sin Supabase: la regla que de
// verdad rechaza la inscripción vive en el RPC inscribirse_a_curso y se
// prueba en tests/e2e/inscripciones-cerradas.spec.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esColumnaInscripcionesFaltante,
  leerCursosConInscripcionesCerradas,
} from "../../lib/inscripciones-curso.ts";

test("reconoce la columna faltante al leer (42703) y al escribir (PGRST204)", () => {
  assert.equal(
    esColumnaInscripcionesFaltante({
      code: "42703",
      message: "column cursos.inscripciones_cerradas does not exist",
    }),
    true
  );
  assert.equal(
    esColumnaInscripcionesFaltante({
      code: "PGRST204",
      message: "Could not find the 'inscripciones_cerradas' column of 'cursos' in the schema cache",
    }),
    true
  );
});

test("no confunde otros errores con la columna faltante", () => {
  assert.equal(esColumnaInscripcionesFaltante(null), false);
  assert.equal(esColumnaInscripcionesFaltante(undefined), false);
  assert.equal(esColumnaInscripcionesFaltante({ code: "42703", message: "column cursos.otra does not exist" }), false);
  assert.equal(
    esColumnaInscripcionesFaltante({ code: "42501", message: "permission denied inscripciones_cerradas" }),
    false
  );
});

// Cliente falso con la forma mínima que usa la función.
function clienteFalso(respuesta: { data: unknown; error: unknown }) {
  const llamadas: string[][] = [];
  const cliente = {
    from: () => ({
      select: () => ({
        in: (_col: string, ids: string[]) => {
          llamadas.push(ids);
          return Promise.resolve(respuesta);
        },
      }),
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { cliente: cliente as any, llamadas };
}

test("devuelve solo los cursos con inscripciones cerradas", async () => {
  const { cliente } = clienteFalso({
    data: [
      { id: "a", inscripciones_cerradas: true },
      { id: "b", inscripciones_cerradas: false },
    ],
    error: null,
  });
  const cerrados = await leerCursosConInscripcionesCerradas(cliente, ["a", "b"]);
  assert.deepEqual([...cerrados], ["a"]);
});

test("sin la migración aplicada, todos se ven abiertos en vez de fallar", async () => {
  const { cliente } = clienteFalso({
    data: null,
    error: { code: "42703", message: "column cursos.inscripciones_cerradas does not exist" },
  });
  const cerrados = await leerCursosConInscripcionesCerradas(cliente, ["a"]);
  assert.equal(cerrados.size, 0);
});

test("sin cursos no consulta nada", async () => {
  const { cliente, llamadas } = clienteFalso({ data: [], error: null });
  const cerrados = await leerCursosConInscripcionesCerradas(cliente, []);
  assert.equal(cerrados.size, 0);
  assert.equal(llamadas.length, 0);
});
