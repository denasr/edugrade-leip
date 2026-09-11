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

// Cubre el bug real que encontramos al construir esta funcionalidad: la
// detección de "esCuestionario" leía preguntas_examen con el cliente RLS
// (esa tabla no tiene ninguna policy) y siempre regresaba vacío, así que el
// cuestionario se mostraba como tarea de archivo en vez del carrusel de
// examen. Esta prueba falla si eso vuelve a pasar.
test.describe("Cuestionario (autocalificado, cuenta como tarea)", () => {
  let docente: CuentaPrueba;
  let estudiante: CuentaPrueba;
  let cursoId: string;

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "cuest-doc");
    estudiante = await crearCuenta("ESTUDIANTE", "cuest-est");
    cursoId = await crearCurso(docente.id);
    await inscribir(cursoId, estudiante.id);
  });

  test.afterAll(async () => {
    await borrarCurso(cursoId);
    await borrarCuenta(docente.id);
    await borrarCuenta(estudiante.id);
  });

  test("el docente crea un cuestionario desde Tareas, el estudiante lo responde vía el carrusel de examen, y cuenta como tarea", async ({
    page,
  }) => {
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/tareas`);
    await page.click("text=+ Nuevo cuestionario");
    await page.fill('input[name="titulo"]', "Cuestionario E2E");
    await page.fill('input[name="fecha_cierre"]', "2099-12-31T23:59");
    await page.fill('input[placeholder="Enunciado"]', "2+2?");
    const opciones = page.locator('input[placeholder^="Opción"]');
    await opciones.nth(0).fill("3");
    await opciones.nth(1).fill("4");
    await opciones.nth(2).fill("5");
    await opciones.nth(3).fill("6");
    await page.locator('input[type=radio][name="correcta-0"]').nth(1).check();
    await page.getByRole("button", { name: "Crear cuestionario" }).click();

    // Reusa TarjetaExamen: debe aparecer con stats de "presentados", no con
    // el conteo de entregas/pendientes que usa una tarea de archivo normal.
    await expect(page.getByText("Cuestionario E2E")).toBeVisible();
    await expect(page.getByText("0 presentados", { exact: false })).toBeVisible();

    await iniciarSesion(page, estudiante.email, estudiante.password);
    await page.goto(`/estudiante/cursos/${cursoId}`);

    // El corazón de la prueba: debe verse el carrusel de examen (la
    // pregunta), no el formulario de subir archivo de una tarea normal.
    await expect(page.getByText("2+2?")).toBeVisible();
    await expect(page.locator('input[type="file"][name="archivos"]')).toHaveCount(0);

    await page.locator('input[type=radio][value="4"]').check();
    await page.getByRole("button", { name: "Enviar examen" }).click();
    await expect(page.getByText("Calificación: 10/10")).toBeVisible();

    // Cuenta para "Tareas", no para "Exámenes" — cada fila es un par de
    // <span> hermanos (etiqueta + valor); se ubica la fila por su etiqueta
    // y se revisa el valor dentro de ese mismo contenedor, para no chocar
    // con el "10.0/10" que también aparece más abajo como nota final.
    await expect(
      page.getByText("Tareas (40%)").locator("xpath=..")
    ).toContainText("10.0/10");
    await expect(
      page.getByText("Exámenes (50%)").locator("xpath=..")
    ).toContainText("Sin datos");

    await page.click("text=Ver mis respuestas");
    const tarjeta = page.locator("li", { hasText: "Cuestionario E2E" });
    await expect(tarjeta.getByText("4 ✓")).toBeVisible();

    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/calificaciones`);
    const filaEstudiante = page.locator("tr", { hasText: "E2E cuest-est" });
    // Columnas: Estudiante, Cuestionario E2E (única tarea/examen del curso),
    // Asistencia, Final — la celda del cuestionario debe traer la nota,
    // tratada igual que cualquier columna de tarea.
    await expect(filaEstudiante.locator("td").nth(1)).toHaveText("10.0/10");
  });
});
