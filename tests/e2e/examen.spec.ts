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

test.describe("Examen autocalificado con revisión de respuestas", () => {
  let docente: CuentaPrueba;
  let estudiante: CuentaPrueba;
  let cursoId: string;

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "examen-doc");
    estudiante = await crearCuenta("ESTUDIANTE", "examen-est");
    cursoId = await crearCurso(docente.id);
    await inscribir(cursoId, estudiante.id);
  });

  test.afterAll(async () => {
    await borrarCurso(cursoId);
    await borrarCuenta(docente.id);
    await borrarCuenta(estudiante.id);
  });

  test("el docente crea un examen de 2 preguntas, el estudiante lo presenta y revisa sus respuestas", async ({
    page,
  }) => {
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/examenes`);
    await page.click("text=+ Nuevo examen");
    await page.fill('input[name="titulo"]', "Examen E2E");
    await page.fill('input[name="fecha_cierre"]', "2099-12-31T23:59");

    await page.fill('input[placeholder="Enunciado"]', "2+2?");
    const opcionesQ1 = page.locator('input[placeholder^="Opción"]');
    await opcionesQ1.nth(0).fill("3");
    await opcionesQ1.nth(1).fill("4");
    await opcionesQ1.nth(2).fill("5");
    await opcionesQ1.nth(3).fill("6");
    await page.locator('input[type=radio][name="correcta-0"]').nth(1).check();

    await page.click("text=+ Agregar pregunta");
    await page
      .locator('input[placeholder="Enunciado"]')
      .nth(1)
      .fill("Capital de Francia?");
    const opcionesQ2 = page.locator('input[placeholder^="Opción"]');
    await opcionesQ2.nth(4).fill("Madrid");
    await opcionesQ2.nth(5).fill("Paris");
    await opcionesQ2.nth(6).fill("Roma");
    await opcionesQ2.nth(7).fill("Berlin");
    await page.locator('input[type=radio][name="correcta-1"]').nth(1).check();

    await page.getByRole("button", { name: "Crear examen" }).click();
    await expect(page.getByText("Examen E2E")).toBeVisible();

    await iniciarSesion(page, estudiante.email, estudiante.password);
    await page.goto(`/estudiante/cursos/${cursoId}`);
    await expect(page.getByText("2+2?")).toBeVisible();

    // Responde la 1 correcta, avanza, responde la 2 incorrecta a propósito
    // (Madrid en vez de Paris) para verificar que "Ver mis respuestas"
    // distinga acierto de error, no solo que reproduzca lo contestado.
    await page.locator('input[type=radio][value="4"]').check();
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.locator('input[type=radio][value="Madrid"]').check();
    await page.getByRole("button", { name: "Enviar examen" }).click();

    await expect(page.getByText("Calificación: 5/10")).toBeVisible();

    await page.click("text=Ver mis respuestas");
    const tarjeta = page.locator("li", { hasText: "Examen E2E" });
    // La pregunta 1 la contestó bien: la opción correcta y la elegida
    // coinciden, así que solo lleva el sufijo "✓". La pregunta 2 la
    // contestó mal a propósito: "Paris" (correcta, no elegida) lleva "✓" y
    // "Madrid" (elegida, incorrecta) lleva "(tu respuesta)" — así se
    // verifica que la revisión distingue ambos casos, no solo que repite
    // lo contestado.
    await expect(tarjeta.getByText("4 ✓")).toBeVisible();
    await expect(tarjeta.getByText("Paris ✓")).toBeVisible();
    await expect(tarjeta.getByText("Madrid (tu respuesta)")).toBeVisible();
  });
});
