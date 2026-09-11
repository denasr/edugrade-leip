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

// La protección a nivel de base de datos (RLS: preguntas_examen_estudiante y
// el insert en entregas ya bloquean una actividad oculta, ver migración
// 20260911120000) se verificó aparte con un script directo contra la API.
// Esta prueba cubre la otra mitad: que la interfaz del docente (botón
// Ocultar/Publicar, badge) y el filtro de la página del estudiante
// funcionen juntos correctamente.
test.describe("Ocultar/publicar una tarea y un examen", () => {
  let docente: CuentaPrueba;
  let estudiante: CuentaPrueba;
  let cursoId: string;

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "oculta-doc");
    estudiante = await crearCuenta("ESTUDIANTE", "oculta-est");
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

  test("una tarea oculta no aparece para el estudiante hasta publicarla, y sigue viendo la suya ya entregada si se oculta después", async ({
    page,
  }) => {
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/tareas`);
    await page.click("text=+ Nueva tarea");
    await page.fill('input[name="titulo"]', "Tarea oculta E2E");
    await page.fill('input[name="fecha_cierre"]', "2099-12-31T23:59");
    await page.getByRole("button", { name: "Crear tarea" }).click();
    await expect(page.getByRole("link", { name: "Tarea oculta E2E" })).toBeVisible();

    // Ocultarla: badge "Oculta" visible y el botón pasa a decir "Publicar".
    // exact:true a propósito — "Oculta" sin exact también matchea el botón
    // "Ocultar" (lo contiene como substring), dando un falso positivo/negativo.
    const tarjeta = page.locator("li", { hasText: "Tarea oculta E2E" });
    await tarjeta.getByRole("button", { name: "Ocultar" }).click();
    await expect(tarjeta.getByText("Oculta", { exact: true })).toBeVisible();
    await expect(tarjeta.getByRole("button", { name: "Publicar" })).toBeVisible();

    // El estudiante no debe verla en absoluto.
    await iniciarSesion(page, estudiante.email, estudiante.password);
    await page.goto(`/estudiante/cursos/${cursoId}`);
    await expect(page.getByText("Tarea oculta E2E")).toHaveCount(0);

    // El docente la publica.
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/tareas`);
    await page
      .locator("li", { hasText: "Tarea oculta E2E" })
      .getByRole("button", { name: "Publicar" })
      .click();
    await expect(page.getByText("Oculta", { exact: true })).toHaveCount(0);

    // Ahora sí aparece y el estudiante la entrega.
    await iniciarSesion(page, estudiante.email, estudiante.password);
    await page.goto(`/estudiante/cursos/${cursoId}`);
    await expect(page.getByText("Tarea oculta E2E")).toBeVisible();
    await page.setInputFiles(
      'input[name="archivos"]',
      path.join(__dirname, "fixtures", "prueba.pdf")
    );
    await page.getByRole("button", { name: "Entregar tarea" }).click();
    await expect(page.getByText("Entregaste: prueba.pdf")).toBeVisible();

    // El docente la vuelve a ocultar (p. ej. para revisarla) — la entrega ya
    // hecha no debe desaparecer para el estudiante que ya la presentó.
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/tareas`);
    const tarjetaTrasEntrega = page.locator("li", { hasText: "Tarea oculta E2E" });
    await tarjetaTrasEntrega.getByRole("button", { name: "Ocultar" }).click();
    // Espera a que el toggle de verdad haya aplicado (form action + revalidación)
    // antes de cambiar de sesión — sin esto, la siguiente navegación puede
    // adelantarse a la escritura y dar un falso negativo, como ya pasó aquí.
    await expect(tarjetaTrasEntrega.getByText("Oculta", { exact: true })).toBeVisible();

    await iniciarSesion(page, estudiante.email, estudiante.password);
    await page.goto(`/estudiante/cursos/${cursoId}`);
    await expect(page.getByText("Tarea oculta E2E")).toBeVisible();
    await expect(page.getByText("Entregaste: prueba.pdf")).toBeVisible();
  });

  test("un examen oculto no muestra su pregunta al estudiante hasta publicarlo", async ({
    page,
  }) => {
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/examenes`);
    await page.click("text=+ Nuevo examen");
    await page.fill('input[name="titulo"]', "Examen oculto E2E");
    await page.fill('input[name="fecha_cierre"]', "2099-12-31T23:59");
    await page.fill('input[placeholder="Enunciado"]', "2+2?");
    const opciones = page.locator('input[placeholder^="Opción"]');
    await opciones.nth(0).fill("3");
    await opciones.nth(1).fill("4");
    await opciones.nth(2).fill("5");
    await opciones.nth(3).fill("6");
    await page.locator('input[type=radio][name="correcta-0"]').nth(1).check();
    await page.getByRole("button", { name: "Crear examen" }).click();
    await expect(page.getByText("Examen oculto E2E")).toBeVisible();

    const tarjetaExamen = page.locator("li", { hasText: "Examen oculto E2E" });
    await tarjetaExamen.getByRole("button", { name: "Ocultar" }).click();
    await expect(tarjetaExamen.getByText("Oculta", { exact: true })).toBeVisible();

    await iniciarSesion(page, estudiante.email, estudiante.password);
    await page.goto(`/estudiante/cursos/${cursoId}`);
    await expect(page.getByText("Examen oculto E2E")).toHaveCount(0);
    await expect(page.getByText("2+2?")).toHaveCount(0);

    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/examenes`);
    const tarjetaExamenOculto = page.locator("li", { hasText: "Examen oculto E2E" });
    await tarjetaExamenOculto.getByRole("button", { name: "Publicar" }).click();
    await expect(tarjetaExamenOculto.getByText("Oculta", { exact: true })).toHaveCount(0);

    await iniciarSesion(page, estudiante.email, estudiante.password);
    await page.goto(`/estudiante/cursos/${cursoId}`);
    await expect(page.getByText("Examen oculto E2E")).toBeVisible();
    await expect(page.getByText("2+2?")).toBeVisible();
  });
});
