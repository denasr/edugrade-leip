import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  crearCuenta,
  borrarCuenta,
  crearCurso,
  borrarCurso,
  inscribir,
  iniciarSesion,
  borrarArchivosEntrega,
  type CuentaPrueba,
} from "./helpers/cuentas-prueba";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// PNG de 1×1 px.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

// Modo revisión (/docente/actividades/[id]/revisar/[entregaId]): archivo a
// la vista (PDF, imagen, Word convertido) y "Guardar y siguiente" que
// recorre solo las entregas sin calificar.
test.describe("Modo revisión de entregas", () => {
  let docente: CuentaPrueba;
  const estudiantes: CuentaPrueba[] = [];
  let cursoId: string;
  let actividadId: string;
  const rutas: string[] = [];

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "revisar-doc");
    cursoId = await crearCurso(docente.id);
    const a = admin();

    const { data: actividad } = await a
      .from("actividades")
      .insert({
        curso_id: cursoId,
        titulo: "Ensayo final",
        tipo: "TAREA",
        fecha_cierre: new Date(Date.now() + 7 * 864e5).toISOString(),
      })
      .select("id")
      .single();
    actividadId = actividad!.id;

    // En orden de entrega: Ana (PDF), Beto (Word, ya calificado), Carla
    // (imagen). "Guardar y siguiente" desde Ana debe saltarse a Beto.
    const archivos: [string, string, Buffer, string][] = [
      ["Ana", "ensayo.pdf", readFileSync(path.join(__dirname, "fixtures", "prueba.pdf")), "application/pdf"],
      ["Beto", "ensayo.docx", readFileSync(path.join(__dirname, "fixtures", "prueba.docx")), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["Carla", "foto.png", PNG, "image/png"],
    ];
    for (const [i, [nombre, archivo, contenido, tipo]] of archivos.entries()) {
      const est = await crearCuenta("ESTUDIANTE", `revisar-${nombre.toLowerCase()}`);
      await a.from("perfiles").update({ nombre_completo: `E2E ${nombre}` }).eq("id", est.id);
      estudiantes.push(est);
      await inscribir(cursoId, est.id);

      const { data: entrega } = await a
        .from("entregas")
        .insert({
          actividad_id: actividadId,
          estudiante_id: est.id,
          created_at: new Date(Date.now() - (3 - i) * 60_000).toISOString(),
        })
        .select("id")
        .single();
      const ruta = `${entrega!.id}/0-${archivo}`;
      rutas.push(ruta);
      const { error } = await a.storage
        .from("archivos-entrega")
        .upload(ruta, contenido, { contentType: tipo });
      if (error) throw error;
      await a.from("archivos_entrega").insert({
        entrega_id: entrega!.id,
        nombre_archivo: archivo,
        storage_path: ruta,
      });
      if (nombre === "Beto") {
        await a.from("evaluaciones").insert({
          entrega_id: entrega!.id,
          calificacion_final: 9,
          origen: "MANUAL",
        });
      }
    }
  });

  test.afterAll(async () => {
    await borrarArchivosEntrega(rutas);
    await borrarCurso(cursoId);
    await borrarCuenta(docente.id);
    for (const est of estudiantes) await borrarCuenta(est.id);
  });

  test("muestra cada archivo y 'Guardar y siguiente' recorre las pendientes", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/actividades/${actividadId}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: "Calificar una por una (2 sin calificar)" }).click();
    await page.waitForURL(/\/revisar\//);

    // Ana: PDF dentro de la página.
    await expect(page.getByText("E2E Ana")).toBeVisible();
    await expect(page.getByText("Entrega 1 de 3 · 2 sin calificar")).toBeVisible();
    await expect(page.locator('iframe[title="ensayo.pdf"]')).toHaveAttribute("src", /archivos-entrega/);

    await page.getByLabel("Nota").fill("8.5");
    await page.getByLabel("Retroalimentación").fill("Buen análisis.");
    await page.getByRole("button", { name: "Guardar y siguiente →" }).click();

    // Se salta a Beto (ya calificado) y llega a Carla: imagen.
    await expect(page.getByText("E2E Carla")).toBeVisible();
    await expect(page.getByText("Entrega 3 de 3 · 1 sin calificar")).toBeVisible();
    await expect(page.getByRole("img", { name: "foto.png" })).toBeVisible();
    await expect(page.getByLabel("Nota")).toHaveValue("");

    // Beto, con "Anterior": su Word convertido, y su nota ya puesta.
    await page.getByRole("link", { name: "← Anterior" }).click();
    await expect(page.getByText("E2E Beto")).toBeVisible();
    await expect(page.getByLabel("Nota")).toHaveValue("9");
    await expect(
      page.frameLocator('iframe[title="ensayo.docx"]').getByText("La investigación-acción según John Elliott.")
    ).toBeVisible();

    // Carla: la última pendiente; al guardar regresa a la lista.
    await page.getByRole("link", { name: "Siguiente →" }).click();
    await expect(page.getByText("E2E Carla")).toBeVisible();
    await page.getByLabel("Nota").fill("10");
    await page.getByRole("button", { name: "Guardar y siguiente →" }).click();
    await page.waitForURL(new RegExp(`/docente/actividades/${actividadId}$`));
    await expect(page.getByRole("link", { name: "Revisar una por una" })).toBeVisible();

    // Las calificaciones quedaron guardadas.
    const { data: notas } = await admin()
      .from("evaluaciones")
      .select("calificacion_final, comentarios, entregas!inner(actividad_id)")
      .eq("entregas.actividad_id", actividadId);
    expect((notas ?? []).map((n) => Number(n.calificacion_final)).sort((x, y) => x - y)).toEqual([
      8.5, 9, 10,
    ]);
    expect((notas ?? []).some((n) => n.comentarios === "Buen análisis.")).toBe(true);
  });
});
