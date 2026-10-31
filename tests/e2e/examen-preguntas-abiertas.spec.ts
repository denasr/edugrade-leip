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

// Preguntas abiertas (migración 20261101140000): el examen queda pendiente
// al entregarse y el docente califica las respuestas escritas en
// /docente/actividades/[id]/respuestas; la nota suma lo automático de
// opción múltiple con los puntos que dio el docente.
test.describe("Preguntas abiertas en exámenes", () => {
  let docente: CuentaPrueba;
  let estudiante: CuentaPrueba;
  let cursoId: string;

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "abiertas-doc");
    estudiante = await crearCuenta("ESTUDIANTE", "abiertas-est");
    cursoId = await crearCurso(docente.id);
    await inscribir(cursoId, estudiante.id);
  });

  test.afterAll(async () => {
    await borrarCurso(cursoId);
    await borrarCuenta(docente.id);
    await borrarCuenta(estudiante.id);
  });

  test("el estudiante escribe su respuesta, queda pendiente y el docente la califica", async ({
    browser,
  }) => {
    const paginaDocente = await (await browser.newContext()).newPage();
    await iniciarSesion(paginaDocente, docente.email, docente.password);
    await paginaDocente.goto(`/docente/cursos/${cursoId}/examenes`);
    await paginaDocente.waitForLoadState("networkidle");

    await paginaDocente.getByRole("button", { name: "+ Nuevo examen" }).click();
    await paginaDocente.fill('input[name="titulo"]', "Examen con abiertas");
    await paginaDocente.fill('input[name="fecha_cierre"]', "2099-12-31T23:59");
    const pregunta = (n: number) =>
      paginaDocente.locator("div.rounded-lg").filter({ hasText: `Pregunta ${n}` });

    // 1: opción múltiple de 2 opciones, 5 puntos (los de default).
    await pregunta(1).getByPlaceholder("Enunciado").fill("¿2+2?");
    await pregunta(1).getByLabel("Quitar la opción 4").click();
    await pregunta(1).getByLabel("Quitar la opción 3").click();
    await pregunta(1).getByPlaceholder("Opción 1").fill("4");
    await pregunta(1).getByPlaceholder("Opción 2").fill("5");
    await pregunta(1).getByLabel("Marcar la opción 1 como correcta").check();

    // 2: abierta, 10 puntos.
    await paginaDocente.getByRole("button", { name: "+ Agregar pregunta" }).click();
    await pregunta(2).getByPlaceholder("Enunciado").fill("Explica la investigación-acción.");
    await pregunta(2).getByRole("button", { name: "Abierta" }).click();
    await expect(pregunta(2).getByPlaceholder(/^Opción/)).toHaveCount(0);
    await pregunta(2).getByLabel("Puntos").fill("10");

    await paginaDocente.getByRole("button", { name: "Crear examen" }).click();
    const tarjetaDocente = paginaDocente.locator("li.card").filter({ hasText: "Examen con abiertas" });
    await expect(tarjetaDocente.getByRole("link", { name: /Calificar respuestas escritas/ })).toBeVisible();

    // Estudiante: la abierta es un cuadro de texto.
    const paginaEst = await (await browser.newContext()).newPage();
    await iniciarSesion(paginaEst, estudiante.email, estudiante.password);
    await paginaEst.goto(`/estudiante/cursos/${cursoId}`);
    await paginaEst.waitForLoadState("networkidle");
    const examenEst = paginaEst.locator("li.card").filter({ hasText: "Examen con abiertas" });
    await examenEst.locator('input[type=radio][value="4"]').check();
    await examenEst.getByRole("button", { name: "Siguiente →" }).click();
    const respuesta = "Es un ciclo de planear, actuar, observar y reflexionar.";
    await examenEst.getByLabel("Tu respuesta a la pregunta 2").fill(respuesta);
    await examenEst.getByRole("button", { name: "Enviar examen" }).click();
    await expect(examenEst.getByText("Enviado, pendiente de calificar")).toBeVisible();

    const a = admin();
    const { data: actividad } = await a
      .from("actividades")
      .select("id")
      .eq("curso_id", cursoId)
      .eq("titulo", "Examen con abiertas")
      .single();
    const { data: entrega } = await a
      .from("entregas")
      .select("id, estado, evaluaciones(id)")
      .eq("actividad_id", actividad!.id)
      .single();
    expect(entrega!.estado).toBe("PENDIENTE");
    expect(entrega!.evaluaciones).toBeNull();

    // Docente: el pendiente se ve en la tarjeta y en la pestaña.
    await paginaDocente.reload();
    await expect(paginaDocente.getByRole("link", { name: /Exámenes\s*1/ })).toBeVisible();
    await tarjetaDocente.getByRole("link", { name: /Calificar respuestas escritas/ }).click();
    await paginaDocente.waitForURL(/\/respuestas$/);
    await expect(paginaDocente.getByText(respuesta)).toBeVisible();
    await expect(paginaDocente.getByText(/✓ Correcta/)).toBeVisible();

    // Fuera de rango: se rechaza sin perder lo escrito.
    await paginaDocente.getByLabel("Puntos de la pregunta 2").fill("11");
    await paginaDocente.getByRole("button", { name: "Guardar calificación" }).click();
    await expect(paginaDocente.getByLabel("Puntos de la pregunta 2")).toHaveValue("11");

    await paginaDocente.getByLabel("Puntos de la pregunta 2").fill("6");
    await paginaDocente.getByLabel("Retroalimentación (opcional)").fill("Te faltó un ejemplo.");
    await paginaDocente.getByRole("button", { name: "Guardar calificación" }).click();
    // (5 automáticos + 6 de 10) / 15 × 10 = 7.33
    await expect(paginaDocente.getByText("7.3/10")).toBeVisible();
    await expect(paginaDocente.getByText("todas calificadas")).toBeVisible();

    const { data: evaluacion } = await a
      .from("evaluaciones")
      .select("calificacion_final, comentarios, origen, entregas(estado)")
      .eq("entrega_id", entrega!.id)
      .single();
    expect(evaluacion).toMatchObject({
      calificacion_final: 7.33,
      comentarios: "Te faltó un ejemplo.",
      origen: "MANUAL",
      entregas: { estado: "CALIFICADO" },
    });

    // Estudiante: ve su nota y, en la revisión, los puntos de su respuesta.
    await paginaEst.reload();
    await expect(examenEst.getByText("Calificación: 7.33/10")).toBeVisible();
    await examenEst.getByRole("button", { name: "Ver mis respuestas" }).click();
    await expect(examenEst.getByText(respuesta)).toBeVisible();
    await expect(examenEst.getByText("6 de 10 puntos")).toBeVisible();
  });
});
