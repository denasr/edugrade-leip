import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ordenarParaEstudiante } from "../../lib/preguntas-examen";
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

// Verdadero/Falso, opción múltiple de 2 a 6 opciones y orden aleatorio
// (lib/preguntas-examen.ts).
test.describe("Tipos de pregunta y orden aleatorio", () => {
  let docente: CuentaPrueba;
  let estudiante: CuentaPrueba;
  let cursoId: string;

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "tipos-doc");
    estudiante = await crearCuenta("ESTUDIANTE", "tipos-est");
    cursoId = await crearCurso(docente.id);
    await inscribir(cursoId, estudiante.id);
  });

  test.afterAll(async () => {
    await borrarCurso(cursoId);
    await borrarCuenta(docente.id);
    await borrarCuenta(estudiante.id);
  });

  test("el docente crea Verdadero/Falso y opción múltiple de 2 y 6 opciones; se califica bien", async ({
    page,
  }) => {
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/examenes`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "+ Nuevo examen" }).click();
    await page.fill('input[name="titulo"]', "Examen de tipos");
    await page.fill('input[name="fecha_cierre"]', "2099-12-31T23:59");
    await page.getByLabel(/Orden aleatorio/).check();

    // Pregunta 1: Verdadero/Falso, correcta "Falso".
    const pregunta = (n: number) =>
      page.locator("div.rounded-lg").filter({ hasText: `Pregunta ${n}` });
    await pregunta(1).getByPlaceholder("Enunciado").fill("El agua hierve a 50 °C.");
    await pregunta(1).getByRole("button", { name: "Verdadero/Falso" }).click();
    await expect(pregunta(1).getByPlaceholder(/^Opción/)).toHaveCount(0);
    await pregunta(1).getByLabel("Falso").check();

    // Pregunta 2: 6 opciones (agrega 2), correcta la sexta.
    await page.getByRole("button", { name: "+ Agregar pregunta" }).click();
    await pregunta(2).getByPlaceholder("Enunciado").fill("¿Cuál es el número primo?");
    await pregunta(2).getByRole("button", { name: "+ Agregar opción" }).click();
    await pregunta(2).getByRole("button", { name: "+ Agregar opción" }).click();
    await expect(pregunta(2).getByRole("button", { name: "+ Agregar opción" })).toHaveCount(0);
    const seis = ["4", "6", "8", "9", "10", "7"];
    for (const [i, texto] of seis.entries()) {
      await pregunta(2).getByPlaceholder(`Opción ${i + 1}`).fill(texto);
    }
    await pregunta(2).getByLabel("Marcar la opción 6 como correcta").check();

    // Pregunta 3: 2 opciones (quita 2). Primero con un duplicado, que se rechaza.
    await page.getByRole("button", { name: "+ Agregar pregunta" }).click();
    await pregunta(3).getByPlaceholder("Enunciado").fill("¿Capital de Zacatecas?");
    await pregunta(3).getByLabel("Quitar la opción 4").click();
    await pregunta(3).getByLabel("Quitar la opción 3").click();
    await expect(pregunta(3).getByLabel(/^Quitar la opción/)).toHaveCount(0);
    await pregunta(3).getByPlaceholder("Opción 1").fill("Zacatecas");
    await pregunta(3).getByPlaceholder("Opción 2").fill("zacatecas");
    await pregunta(3).getByLabel("Marcar la opción 1 como correcta").check();

    await page.getByRole("button", { name: "Crear examen" }).click();
    await expect(page.getByText("La pregunta 3 tiene dos opciones iguales.")).toBeVisible();
    // Un error de validación no debe borrar lo demás del formulario.
    await expect(page.locator('input[name="titulo"]')).toHaveValue("Examen de tipos");
    await expect(page.locator('input[name="fecha_cierre"]')).toHaveValue("2099-12-31T23:59");
    await expect(page.getByLabel(/Orden aleatorio/)).toBeChecked();

    await pregunta(3).getByPlaceholder("Opción 2").fill("Fresnillo");
    await page.getByRole("button", { name: "Crear examen" }).click();
    const tarjeta = page.locator("li.card").filter({ hasText: "Examen de tipos" });
    await expect(tarjeta.getByText("Aleatorio")).toBeVisible();

    const a = admin();
    const { data: examen } = await a
      .from("actividades")
      .select("id, orden_aleatorio")
      .eq("curso_id", cursoId)
      .eq("titulo", "Examen de tipos")
      .single();
    expect(examen!.orden_aleatorio).toBe(true);
    const { data: preguntas } = await a
      .from("preguntas_examen")
      .select("id, enunciado, opciones, correcta")
      .eq("actividad_id", examen!.id)
      .order("orden");
    expect(preguntas!.map((p) => [p.opciones, p.correcta])).toEqual([
      [["Verdadero", "Falso"], "Falso"],
      [seis, "7"],
      [["Zacatecas", "Fresnillo"], "Zacatecas"],
    ]);

    // Estudiante: ve el orden que le toca (fijo para él) y contesta todo bien.
    const esperado = ordenarParaEstudiante(
      preguntas!.map((p) => ({ id: p.id, enunciado: p.enunciado, opciones: p.opciones as string[] })),
      estudiante.id,
      examen!.id
    );
    const correctaPorEnunciado = new Map(preguntas!.map((p) => [p.enunciado, p.correcta]));

    await page.context().clearCookies();
    await iniciarSesion(page, estudiante.email, estudiante.password);
    await page.goto(`/estudiante/cursos/${cursoId}`);
    await page.waitForLoadState("networkidle");
    const examenEst = page.locator("li.card").filter({ hasText: "Examen de tipos" });

    for (const [i, p] of esperado.entries()) {
      const fieldset = examenEst.locator("fieldset").nth(i);
      await expect(fieldset.locator("legend")).toHaveText(`${i + 1}. ${p.enunciado}`);
      // Las opciones, en el orden barajado que le corresponde.
      await expect(fieldset.locator("label")).toHaveText(p.opciones);
      await fieldset
        .locator(`input[type=radio][value="${correctaPorEnunciado.get(p.enunciado)}"]`)
        .check();
      if (i < esperado.length - 1) {
        await examenEst.getByRole("button", { name: "Siguiente →" }).click();
      }
    }
    await examenEst.getByRole("button", { name: "Enviar examen" }).click();
    await expect(examenEst.getByText("Calificación: 10/10")).toBeVisible();
  });

  test("el orden aleatorio es fijo para cada estudiante y distinto entre estudiantes", () => {
    const preguntas = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`,
      opciones: ["A", "B", "C", "D"],
    }));
    const unaVez = ordenarParaEstudiante(preguntas, "alumno-1", "examen-1");
    const otraVez = ordenarParaEstudiante(preguntas, "alumno-1", "examen-1");
    const otroAlumno = ordenarParaEstudiante(preguntas, "alumno-2", "examen-1");

    expect(otraVez).toEqual(unaVez);
    expect(otroAlumno.map((p) => p.id)).not.toEqual(unaVez.map((p) => p.id));
    // No se pierde ni se repite nada.
    expect(unaVez.map((p) => p.id).sort()).toEqual(preguntas.map((p) => p.id));
    // Verdadero/Falso conserva su orden natural.
    const vf = ordenarParaEstudiante([{ id: "x", opciones: ["Verdadero", "Falso"] }], "a", "b");
    expect(vf[0].opciones).toEqual(["Verdadero", "Falso"]);
  });
});
