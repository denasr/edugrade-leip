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

// /docente/actividades/[id]/faltantes: inscritos que no han entregado una
// tarea. Ana entregó con archivo, Beto tiene una entrega a medias (sin
// archivos ni calificación, cuenta como no entregada) y Carla no tiene
// ninguna fila en entregas.
test.describe("Faltantes de una tarea", () => {
  let docente: CuentaPrueba;
  const estudiantes: CuentaPrueba[] = [];
  let cursoId: string;
  let actividadId: string;

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "faltantes-doc");
    cursoId = await crearCurso(docente.id);
    const a = admin();

    const { data: actividad } = await a
      .from("actividades")
      .insert({
        curso_id: cursoId,
        titulo: "Reporte de lectura",
        tipo: "TAREA",
        fecha_cierre: new Date(Date.now() + 7 * 864e5).toISOString(),
      })
      .select("id")
      .single();
    actividadId = actividad!.id;

    for (const nombre of ["Ana", "Beto", "Carla"]) {
      const est = await crearCuenta("ESTUDIANTE", `faltantes-${nombre.toLowerCase()}`);
      await a.from("perfiles").update({ nombre_completo: `E2E ${nombre}` }).eq("id", est.id);
      estudiantes.push(est);
      await inscribir(cursoId, est.id);

      if (nombre === "Carla") continue;
      const { data: entrega } = await a
        .from("entregas")
        .insert({ actividad_id: actividadId, estudiante_id: est.id })
        .select("id")
        .single();
      if (nombre === "Ana") {
        // Solo la fila: la vista no abre el archivo, así que no hace falta
        // subir nada a Storage.
        await a.from("archivos_entrega").insert({
          entrega_id: entrega!.id,
          nombre_archivo: "reporte.pdf",
          storage_path: `${entrega!.id}/0-reporte.pdf`,
        });
      }
    }
  });

  test.afterAll(async () => {
    await borrarCurso(cursoId);
    await borrarCuenta(docente.id);
    for (const est of estudiantes) await borrarCuenta(est.id);
  });

  test("lista a quienes no han entregado, desde la pestaña Tareas", async ({ page }) => {
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/tareas`);

    await page.getByRole("link", { name: "2 sin entregar · ver quiénes" }).click();
    await page.waitForURL(/\/faltantes$/);

    await expect(page.getByTestId("conteo-faltantes")).toContainText("2 de 3 estudiantes sin entregar");
    await expect(page.getByText("E2E Beto")).toBeVisible();
    await expect(page.getByText("E2E Carla")).toBeVisible();
    await expect(page.getByText("E2E Ana")).toHaveCount(0);
    await expect(page.getByText("Entrega incompleta")).toHaveCount(1);
  });
});
