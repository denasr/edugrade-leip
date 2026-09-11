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

test.describe("Entrega de tarea con archivo", () => {
  let docente: CuentaPrueba;
  let estudiante: CuentaPrueba;
  let cursoId: string;

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "tarea-doc");
    estudiante = await crearCuenta("ESTUDIANTE", "tarea-est");
    cursoId = await crearCurso(docente.id);
    await inscribir(cursoId, estudiante.id);
  });

  test.afterAll(async () => {
    // Borrar el curso solo limpia las filas (cascade); el objeto real en el
    // bucket "archivos-entrega" no depende de ninguna FK y hay que quitarlo
    // aparte, antes de que la cascada borre la fila que guarda su ruta.
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

  test("el estudiante entrega un archivo, el docente la califica, y la nota aparece en su vista", async ({
    page,
  }) => {
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/tareas`);
    await page.click("text=+ Nueva tarea");
    await page.fill('input[name="titulo"]', "Tarea E2E");
    await page.fill('input[name="fecha_cierre"]', "2099-12-31T23:59");
    await page.getByRole("button", { name: "Crear tarea" }).click();
    await expect(page.getByRole("link", { name: "Tarea E2E" })).toBeVisible();

    await iniciarSesion(page, estudiante.email, estudiante.password);
    await page.goto(`/estudiante/cursos/${cursoId}`);
    await expect(page.getByText("Tarea E2E")).toBeVisible();
    await page.setInputFiles(
      'input[name="archivos"]',
      path.join(__dirname, "fixtures", "prueba.pdf")
    );
    await page.getByRole("button", { name: "Entregar tarea" }).click();
    await expect(page.getByText("Entregaste: prueba.pdf")).toBeVisible();
    await expect(page.getByText("Pendiente de calificar")).toBeVisible();

    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/tareas`);
    await expect(page.getByText("1 entregas", { exact: false })).toBeVisible();
    await page.getByRole("link", { name: "Tarea E2E" }).click();
    await page.fill('input[name="nota"]', "8.5");
    await page.fill('textarea[name="retroalimentacion"]', "Buen trabajo.");
    await page.getByRole("button", { name: "Calificar" }).click();
    await expect(page.getByText("Calificación guardada.")).toBeVisible();

    await iniciarSesion(page, estudiante.email, estudiante.password);
    await page.goto(`/estudiante/cursos/${cursoId}`);
    await expect(page.getByText("Calificación: 8.5/10")).toBeVisible();
    await expect(page.getByText("Buen trabajo.")).toBeVisible();
  });
});
