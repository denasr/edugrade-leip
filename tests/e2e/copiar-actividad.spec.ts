import { test, expect } from "@playwright/test";
import path from "node:path";
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

// Cubre copiar una tarea (con material adjunto, que vive en Storage, no
// solo en la base de datos) y un examen (con sus preguntas) de un curso a
// otro del mismo docente. La copia debe nacer oculta con fechas nuevas, sin
// arrastrar entregas/evaluaciones, y las preguntas copiadas deben calificar
// igual que las originales (única forma real de confirmar que `correcta`
// también se copió, no solo el enunciado).
test.describe("Copiar tarea/examen a otro curso", () => {
  let docente: CuentaPrueba;
  let estudiante: CuentaPrueba;
  let cursoA: string;
  let cursoB: string;

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "copiar-doc");
    estudiante = await crearCuenta("ESTUDIANTE", "copiar-est");
    cursoA = await crearCurso(docente.id);
    cursoB = await crearCurso(docente.id);
    await inscribir(cursoB, estudiante.id);
  });

  test.afterAll(async () => {
    // El material original y su copia viven en Storage, no solo en la fila
    // de materiales_actividad — igual que archivos-entrega en
    // entrega-tarea.spec.ts, hay que borrarlos aparte antes de que el
    // cascade de borrarCurso se lleve las filas que apuntaban a ellos.
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: actividades } = await admin
      .from("actividades")
      .select("id")
      .in("curso_id", [cursoA, cursoB]);
    const actividadIds = (actividades ?? []).map((a) => a.id);
    if (actividadIds.length > 0) {
      const { data: materiales } = await admin
        .from("materiales_actividad")
        .select("storage_path")
        .in("actividad_id", actividadIds);
      const rutas = (materiales ?? []).map((m) => m.storage_path);
      if (rutas.length > 0) {
        await admin.storage.from("materiales-actividades").remove(rutas);
      }
    }

    await borrarCurso(cursoA);
    await borrarCurso(cursoB);
    await borrarCuenta(docente.id);
    await borrarCuenta(estudiante.id);
  });

  test("copia una tarea con material a otro curso, oculta y con material propio", async ({
    page,
  }) => {
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoA}/tareas`);
    await page.click("text=+ Nueva tarea");
    await page.fill('input[name="titulo"]', "Tarea para copiar");
    await page.fill('input[name="fecha_cierre"]', "2099-12-31T23:59");
    await page.setInputFiles(
      'input[name="archivo"]',
      path.join(__dirname, "fixtures", "prueba.pdf")
    );
    await page.getByRole("button", { name: "Crear tarea" }).click();
    await expect(page.getByText("Tarea para copiar")).toBeVisible();

    const tarjeta = page.locator("li", { hasText: "Tarea para copiar" });
    await tarjeta.getByRole("button", { name: "Copiar" }).click();
    await page.selectOption('select[name="curso_destino_id"]', cursoB);
    await page.fill('input[name="fecha_cierre"]', "2099-12-31T23:59");
    await page.getByRole("button", { name: "Copiar" }).click();
    await expect(page.getByText("Tarea copiada a otro curso.")).toBeVisible();

    await page.goto(`/docente/cursos/${cursoB}/tareas`);
    const copia = page.locator("li", { hasText: "Tarea para copiar" });
    await expect(copia).toBeVisible();
    // exact:true: "Oculta" sin eso también matchea el botón "Ocultar" como
    // substring (mismo aviso que ya deja ocultar-actividad.spec.ts).
    await expect(copia.getByText("Oculta", { exact: true })).toBeVisible();
    await expect(copia.getByText("prueba.pdf")).toBeVisible();
  });

  test("copia un examen con preguntas a otro curso, y la copia autocalifica igual que el original", async ({
    page,
  }) => {
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoA}/examenes`);
    await page.click("text=+ Nuevo examen");
    await page.fill('input[name="titulo"]', "Examen para copiar");
    await page.fill('input[name="fecha_cierre"]', "2099-12-31T23:59");
    await page.fill('input[placeholder="Enunciado"]', "2+2?");
    const opciones = page.locator('input[placeholder^="Opción"]');
    await opciones.nth(0).fill("3");
    await opciones.nth(1).fill("4");
    await opciones.nth(2).fill("5");
    await opciones.nth(3).fill("6");
    await page.locator('input[type=radio][name="correcta-0"]').nth(1).check();
    await page.getByRole("button", { name: "Crear examen" }).click();
    await expect(page.getByText("Examen para copiar")).toBeVisible();

    const tarjeta = page.locator("li", { hasText: "Examen para copiar" });
    await tarjeta.getByRole("button", { name: "Copiar" }).click();
    await page.selectOption('select[name="curso_destino_id"]', cursoB);
    await page.fill('input[name="fecha_cierre"]', "2099-12-31T23:59");
    await page.getByRole("button", { name: "Copiar" }).click();
    await expect(page.getByText("Examen copiado a otro curso.")).toBeVisible();

    await page.goto(`/docente/cursos/${cursoB}/examenes`);
    const copia = page.locator("li", { hasText: "Examen para copiar" });
    await expect(copia).toBeVisible();
    await expect(copia.getByText("Oculta", { exact: true })).toBeVisible();

    // Publicarla para que el estudiante de cursoB pueda presentarla.
    await copia.getByRole("button", { name: "Publicar" }).click();
    await expect(copia.getByText("Oculta", { exact: true })).toHaveCount(0);

    await iniciarSesion(page, estudiante.email, estudiante.password);
    await page.goto(`/estudiante/cursos/${cursoB}`);
    await expect(page.getByText("2+2?")).toBeVisible();
    await page.locator('input[type=radio][value="4"]').check();
    await page.getByRole("button", { name: "Enviar examen" }).click();
    await expect(page.getByText("Calificación: 10/10")).toBeVisible();
  });
});
