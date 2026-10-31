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

// Límite de tiempo (migración 20261101150000, lib/intentos-examen.ts).
test.describe("Exámenes con límite de tiempo", () => {
  let docente: CuentaPrueba;
  let estudiante: CuentaPrueba;
  let otro: CuentaPrueba;
  let cursoId: string;

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "tiempo-doc");
    estudiante = await crearCuenta("ESTUDIANTE", "tiempo-est");
    otro = await crearCuenta("ESTUDIANTE", "tiempo-otro");
    cursoId = await crearCurso(docente.id);
    await inscribir(cursoId, estudiante.id);
    await inscribir(cursoId, otro.id);
  });

  test.afterAll(async () => {
    await borrarCurso(cursoId);
    await borrarCuenta(docente.id);
    await borrarCuenta(estudiante.id);
    await borrarCuenta(otro.id);
  });

  // Examen de 2 preguntas (5 puntos c/u) armado directo en la base de datos.
  async function crearExamen(titulo: string, limiteMinutos: number) {
    const a = admin();
    const { data: examen } = await a
      .from("actividades")
      .insert({
        curso_id: cursoId,
        titulo,
        tipo: "EXAMEN",
        fecha_cierre: "2099-12-31T23:59:00Z",
        limite_minutos: limiteMinutos,
      })
      .select("id")
      .single();
    const { data: preguntas } = await a
      .from("preguntas_examen")
      .insert([
        { actividad_id: examen!.id, enunciado: `${titulo}: ¿2+2?`, opciones: ["3", "4"], correcta: "4", puntos: 5, orden: 0 },
        { actividad_id: examen!.id, enunciado: `${titulo}: ¿3+3?`, opciones: ["6", "7"], correcta: "6", puntos: 5, orden: 1 },
      ])
      .select("id, correcta, orden")
      .order("orden");
    return { id: examen!.id as string, preguntas: preguntas! };
  }

  test("el docente pone el límite; las preguntas aparecen al comenzar y el avance se conserva", async ({
    page,
  }) => {
    // Docente: crea el examen desde el formulario con 5 minutos.
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/examenes`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "+ Nuevo examen" }).click();
    await page.fill('input[name="titulo"]', "Examen cronometrado");
    await page.fill('input[name="fecha_cierre"]', "2099-12-31T23:59");
    await page.getByLabel(/Límite de tiempo en minutos/).fill("5");
    await page.getByPlaceholder("Enunciado").fill("¿Capital de México?");
    await page.getByPlaceholder("Opción 1").fill("CDMX");
    await page.getByPlaceholder("Opción 2").fill("Monterrey");
    await page.getByLabel("Quitar la opción 4").click();
    await page.getByLabel("Quitar la opción 3").click();
    await page.getByLabel("Marcar la opción 1 como correcta").check();
    await page.getByRole("button", { name: "Crear examen" }).click();
    const tarjetaDocente = page.locator("li.card").filter({ hasText: "Examen cronometrado" });
    await expect(tarjetaDocente.getByText("5 min")).toBeVisible();

    // Estudiante: antes de comenzar no hay preguntas en la página.
    await page.context().clearCookies();
    await iniciarSesion(page, estudiante.email, estudiante.password);
    await page.goto(`/estudiante/cursos/${cursoId}`);
    await page.waitForLoadState("networkidle");
    const tarjeta = page.locator("li.card").filter({ hasText: "Examen cronometrado" });
    await expect(tarjeta.getByText("5 minutos")).toBeVisible();
    await expect(page.getByText("¿Capital de México?")).toHaveCount(0);

    await tarjeta.getByRole("button", { name: "Comenzar examen" }).click();
    await expect(tarjeta.getByRole("timer")).toContainText(/Tiempo restante: [45]:\d\d/);
    await tarjeta.locator('input[type=radio][value="CDMX"]').check();
    await expect(tarjeta.getByText("Avance guardado")).toBeVisible();

    // Recargar no reinicia el reloj ni pierde lo marcado.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(tarjeta.getByRole("timer")).toContainText(/Tiempo restante: [45]:\d\d/);
    await expect(tarjeta.locator('input[type=radio][value="CDMX"]')).toBeChecked();

    await tarjeta.getByRole("button", { name: "Enviar examen" }).click();
    await expect(tarjeta.getByText("Calificación: 10/10")).toBeVisible();
  });

  test("al llegar a cero se entrega solo con lo contestado", async ({ page }) => {
    const examen = await crearExamen("Examen relámpago", 30);
    // Intento que vence en 12 segundos, ya con una respuesta guardada.
    await admin().from("intentos_examen").insert({
      actividad_id: examen.id,
      estudiante_id: estudiante.id,
      intento: 1,
      vence_at: new Date(Date.now() + 12_000).toISOString(),
      borrador: { [examen.preguntas[0].id]: "4" },
    });

    await iniciarSesion(page, estudiante.email, estudiante.password);
    await page.goto(`/estudiante/cursos/${cursoId}`);
    const tarjeta = page.locator("li.card").filter({ hasText: "Examen relámpago" });
    await expect(tarjeta.getByRole("timer")).toBeVisible();
    // Solo contestó la primera (la que venía guardada): 5 de 10 puntos.
    await expect(tarjeta.getByText("Calificación: 5/10")).toBeVisible({ timeout: 45_000 });
  });

  test("un intento abandonado se entrega con su avance al abrir las pantallas", async ({ page }) => {
    const examen = await crearExamen("Examen abandonado", 30);
    // Venció hace 10 minutos sin que nadie lo enviara.
    await admin().from("intentos_examen").insert({
      actividad_id: examen.id,
      estudiante_id: otro.id,
      intento: 1,
      iniciado_at: new Date(Date.now() - 40 * 60_000).toISOString(),
      vence_at: new Date(Date.now() - 10 * 60_000).toISOString(),
      borrador: { [examen.preguntas[0].id]: "4", [examen.preguntas[1].id]: "6" },
    });

    // Basta con que el docente abra su pestaña Exámenes.
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/examenes`);
    await page.waitForLoadState("networkidle");

    const a = admin();
    const { data: entrega } = await a
      .from("entregas")
      .select("id, evaluaciones(calificacion_final)")
      .eq("actividad_id", examen.id)
      .eq("estudiante_id", otro.id)
      .single();
    expect(entrega!.evaluaciones).toMatchObject({ calificacion_final: 10 });
    const { data: intento } = await a
      .from("intentos_examen")
      .select("finalizado_at, entrega_id")
      .eq("actividad_id", examen.id)
      .eq("estudiante_id", otro.id)
      .single();
    expect(intento!.finalizado_at).not.toBeNull();
    expect(intento!.entrega_id).toBe(entrega!.id);
  });
});
