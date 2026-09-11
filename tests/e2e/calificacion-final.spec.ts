import { test, expect } from "@playwright/test";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  crearCuenta,
  borrarCuenta,
  crearCurso,
  borrarCurso,
  borrarArchivosEntrega,
  inscribir,
  iniciarSesion,
  type CuentaPrueba,
} from "./helpers/cuentas-prueba";

// Curso con pesos por defecto: tareas 40%, exámenes 50%, asistencia 10%.
// Se deja la asistencia sin ningún registro a propósito: calcularCalificacionFinal
// debe excluir esa categoría del cálculo y repartir su peso proporcionalmente
// entre tareas y exámenes en vez de contarla como 0 — es la parte más fácil
// de romper sin darse cuenta en un refactor, y la más difícil de notar a
// simple vista (el resultado sigue pareciendo un número razonable).
//
// Con tarea=6.0 y examen=5.0 (1 de 2 preguntas correctas, mismos puntos):
//   final = (6*40 + 5*50) / (40+50) = 490/90 = 5.444... → se muestra "5.4/10"
test.describe("Calificación final: redistribución cuando falta una categoría", () => {
  let docente: CuentaPrueba;
  let estudiante: CuentaPrueba;
  let cursoId: string;

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "califinal-doc");
    estudiante = await crearCuenta("ESTUDIANTE", "califinal-est");
    cursoId = await crearCurso(docente.id);
    await inscribir(cursoId, estudiante.id);
  });

  test.afterAll(async () => {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: actividades } = await admin
      .from("actividades")
      .select("id")
      .eq("curso_id", cursoId);
    const actividadIds = (actividades ?? []).map((a) => a.id);
    if (actividadIds.length > 0) {
      const { data: entregas } = await admin
        .from("entregas")
        .select("id")
        .in("actividad_id", actividadIds);
      const entregaIds = (entregas ?? []).map((e) => e.id);
      if (entregaIds.length > 0) {
        const { data: archivos } = await admin
          .from("archivos_entrega")
          .select("storage_path")
          .in("entrega_id", entregaIds);
        await borrarArchivosEntrega((archivos ?? []).map((a) => a.storage_path));
      }
    }
    await borrarCurso(cursoId);
    await borrarCuenta(docente.id);
    await borrarCuenta(estudiante.id);
  });

  test("con tarea calificada, examen parcialmente correcto y sin asistencia, la nota final redistribuye el peso faltante", async ({
    page,
  }) => {
    // --- Tarea, calificada 6.0 ---
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/tareas`);
    await page.click("text=+ Nueva tarea");
    await page.fill('input[name="titulo"]', "Tarea CF");
    await page.fill('input[name="fecha_cierre"]', "2099-12-31T23:59");
    await page.getByRole("button", { name: "Crear tarea" }).click();
    await expect(page.getByRole("link", { name: "Tarea CF" })).toBeVisible();

    await iniciarSesion(page, estudiante.email, estudiante.password);
    await page.goto(`/estudiante/cursos/${cursoId}`);
    await page.setInputFiles(
      'input[name="archivos"]',
      path.join(__dirname, "fixtures", "prueba.pdf")
    );
    await page.getByRole("button", { name: "Entregar tarea" }).click();
    await expect(page.getByText("Pendiente de calificar")).toBeVisible();

    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/tareas`);
    await page.getByRole("link", { name: "Tarea CF" }).click();
    await page.fill('input[name="nota"]', "6");
    await page.getByRole("button", { name: "Calificar" }).click();
    await expect(page.getByText("Calificación guardada.")).toBeVisible();

    // --- Examen de 2 preguntas, incluidos ambos puntos por defecto (5 c/u) ---
    await page.goto(`/docente/cursos/${cursoId}/examenes`);
    await page.click("text=+ Nuevo examen");
    await page.fill('input[name="titulo"]', "Examen CF");
    await page.fill('input[name="fecha_cierre"]', "2099-12-31T23:59");

    await page.fill('input[placeholder="Enunciado"]', "1+1?");
    const opcionesQ1 = page.locator('input[placeholder^="Opción"]');
    await opcionesQ1.nth(0).fill("2");
    await opcionesQ1.nth(1).fill("3");
    await opcionesQ1.nth(2).fill("4");
    await opcionesQ1.nth(3).fill("5");
    await page.locator('input[type=radio][name="correcta-0"]').nth(0).check();

    await page.click("text=+ Agregar pregunta");
    await page.locator('input[placeholder="Enunciado"]').nth(1).fill("3+3?");
    const opcionesQ2 = page.locator('input[placeholder^="Opción"]');
    await opcionesQ2.nth(4).fill("5");
    await opcionesQ2.nth(5).fill("6");
    await opcionesQ2.nth(6).fill("7");
    await opcionesQ2.nth(7).fill("8");
    await page.locator('input[type=radio][name="correcta-1"]').nth(1).check();

    await page.getByRole("button", { name: "Crear examen" }).click();
    await expect(page.getByText("Examen CF")).toBeVisible();

    // --- El estudiante presenta el examen: 1 de 2 correctas (50% -> 5.0) ---
    await iniciarSesion(page, estudiante.email, estudiante.password);
    await page.goto(`/estudiante/cursos/${cursoId}`);
    await expect(page.getByText("1+1?")).toBeVisible();
    await page.locator('input[type=radio][value="2"]').check(); // correcta
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.locator('input[type=radio][value="7"]').check(); // incorrecta (correcta era "6")
    await page.getByRole("button", { name: "Enviar examen" }).click();
    await expect(page.getByText("Calificación: 5/10")).toBeVisible();

    // --- Verifica la combinación final ---
    await page.reload();
    await expect(
      page.getByText("Tareas (40%)").locator("xpath=..")
    ).toContainText("6.0/10");
    await expect(
      page.getByText("Exámenes (50%)").locator("xpath=..")
    ).toContainText("5.0/10");
    await expect(
      page.getByText("Asistencia (10%)").locator("xpath=..")
    ).toContainText("Sin datos");

    await expect(page.getByText("5.4/10")).toBeVisible();
    await expect(
      page.getByText(
        "Calificación parcial: aún no se ha tomado asistencia en este curso."
      )
    ).toBeVisible();
  });
});
