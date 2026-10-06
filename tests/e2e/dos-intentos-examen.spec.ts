import { test, expect } from "@playwright/test";
import {
  crearCuenta,
  borrarCuenta,
  crearCurso,
  borrarCurso,
  inscribir,
  iniciarSesion,
  type CuentaPrueba,
} from "./helpers/cuentas-prueba";

// Cubre la función de "2 intentos" en un examen: cuenta la calificación del
// intento más reciente (no la más alta ni un promedio, ver CLAUDE.md), deja
// de ofrecer el formulario después de agotar los intentos, y las stats del
// docente no deben duplicar al estudiante por tener dos entregas.
test.describe("Examen con 2 intentos permitidos", () => {
  let docente: CuentaPrueba;
  let estudiante: CuentaPrueba;
  let cursoId: string;

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "intentos-doc");
    estudiante = await crearCuenta("ESTUDIANTE", "intentos-est");
    cursoId = await crearCurso(docente.id);
    await inscribir(cursoId, estudiante.id);
  });

  test.afterAll(async () => {
    await borrarCurso(cursoId);
    await borrarCuenta(docente.id);
    await borrarCuenta(estudiante.id);
  });

  test("el estudiante falla el primer intento, acierta el segundo, y la nota que cuenta es la del segundo", async ({
    page,
  }) => {
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/examenes`);
    await page.click("text=+ Nuevo examen");
    await page.fill('input[name="titulo"]', "Examen E2E dos intentos");
    await page.fill('input[name="fecha_cierre"]', "2099-12-31T23:59");
    await page.fill('input[placeholder="Enunciado"]', "2+2?");
    const opciones = page.locator('input[placeholder^="Opción"]');
    await opciones.nth(0).fill("3");
    await opciones.nth(1).fill("4");
    await opciones.nth(2).fill("5");
    await opciones.nth(3).fill("6");
    await page.locator('input[type=radio][name="correcta-0"]').nth(1).check();
    await page.check('input[name="dos_intentos"]');
    await page.getByRole("button", { name: "Crear examen" }).click();

    await expect(page.getByText("Examen E2E dos intentos")).toBeVisible();
    await expect(page.getByText("2 intentos")).toBeVisible();

    await iniciarSesion(page, estudiante.email, estudiante.password);
    await page.goto(`/estudiante/cursos/${cursoId}`);

    // Intento 1: responde mal a propósito.
    await expect(page.getByText("2+2?")).toBeVisible();
    await page.locator('input[type=radio][value="3"]').check();
    await page.getByRole("button", { name: "Enviar examen" }).click();
    await expect(page.getByText("Calificación: 0/10")).toBeVisible();
    await expect(page.getByText("Intento 1 de 2")).toBeVisible();

    // Debe seguir ofreciendo un segundo intento: la pregunta vuelve a
    // aparecer con la etiqueta de intento correspondiente.
    await expect(page.getByText("Intento 2 de 2", { exact: true })).toBeVisible();
    await page.locator('input[type=radio][value="4"]').check();
    await page.getByRole("button", { name: "Enviar examen" }).click();

    // La nota que se queda es la del intento más reciente (10/10), no la
    // del primero (0/10) ni un promedio de ambas.
    await expect(page.getByText("Calificación: 10/10")).toBeVisible();
    await expect(
      page.getByText("Intento 2 de 2 · ya usaste todos tus intentos")
    ).toBeVisible();

    // Sin más intentos disponibles: no debe quedar ningún formulario para
    // volver a presentar.
    await expect(
      page.getByRole("button", { name: "Enviar examen" })
    ).toHaveCount(0);

    await expect(
      page.getByText("Exámenes (50%)").locator("xpath=..")
    ).toContainText("10.0/10");

    // Las stats del docente deben reflejar 1 estudiante presentado (no 2,
    // aunque haya 2 entregas) y el promedio del intento que cuenta.
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/examenes`);
    await expect(
      page.getByText("1 presentados", { exact: false })
    ).toBeVisible();
    await expect(page.getByText("promedio 10.0/10")).toBeVisible();
  });
});
