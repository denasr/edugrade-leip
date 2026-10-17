import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  crearCuenta,
  borrarCuenta,
  crearCurso,
  borrarCurso,
  inscribir,
  iniciarSesion,
  type CuentaPrueba,
} from "./helpers/cuentas-prueba";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

test.describe("Eliminar a un estudiante de un curso", () => {
  let docente: CuentaPrueba;
  let estudiante: CuentaPrueba;
  let cursoId: string;

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "elim-est-doc");
    estudiante = await crearCuenta("ESTUDIANTE", "elim-est-est");
    cursoId = await crearCurso(docente.id);
    await inscribir(cursoId, estudiante.id);
  });

  test.afterAll(async () => {
    await borrarCurso(cursoId);
    await borrarCuenta(docente.id);
    await borrarCuenta(estudiante.id);
  });

  test("también borra sus registros de asistencia del curso", async ({ page }) => {
    // Antes ninguna de las dos fases de eliminarEstudianteDeCurso tocaba
    // `asistencias`, y quedaban registros de alguien ya no inscrito.
    const { data: sesion } = await admin()
      .from("sesiones_asistencia")
      .insert({ curso_id: cursoId, fecha: "2026-01-15", creado_por: docente.id })
      .select("id")
      .single();
    await admin()
      .from("asistencias")
      .insert({ sesion_id: sesion!.id, estudiante_id: estudiante.id, estado: "presente" });

    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/estudiantes`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    // El modal pide escribir el nombre completo para habilitar el botón.
    await page.getByRole("dialog").locator("input").fill("E2E elim-est-est");
    await page.getByRole("button", { name: "Eliminar definitivamente" }).click();
    await expect(page.getByText(estudiante.email)).toHaveCount(0);

    const { data: inscripcion } = await admin()
      .from("inscripciones")
      .select("id")
      .eq("curso_id", cursoId)
      .eq("estudiante_id", estudiante.id);
    expect(inscripcion ?? []).toHaveLength(0);

    const { data: asistencias } = await admin()
      .from("asistencias")
      .select("id")
      .eq("estudiante_id", estudiante.id);
    expect(asistencias ?? []).toHaveLength(0);
  });
});
