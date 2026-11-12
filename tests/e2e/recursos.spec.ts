import { test, expect, type Page } from "@playwright/test";
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

// Recursos del curso (migración 20261111120000): unidades con archivos y
// enlaces, ocultables; el estudiante solo ve (y solo puede abrir) lo visible.
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function idRecurso(cursoId: string, titulo: string) {
  const { data } = await admin()
    .from("recursos_curso")
    .select("id, storage_path, orden")
    .eq("curso_id", cursoId)
    .eq("titulo", titulo)
    .single();
  return data!;
}

test.describe("Recursos del curso", () => {
  let docente: CuentaPrueba;
  let estudiante: CuentaPrueba;
  let ajeno: CuentaPrueba;
  let cursoId: string;
  const cursosCreados: string[] = [];

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "recursos-doc");
    estudiante = await crearCuenta("ESTUDIANTE", "recursos-est");
    ajeno = await crearCuenta("ESTUDIANTE", "recursos-ajeno");
    cursoId = await crearCurso(docente.id);
    cursosCreados.push(cursoId);
    await inscribir(cursoId, estudiante.id);
  });

  test.afterAll(async () => {
    // Los archivos del bucket no dependen de ninguna FK: se quitan antes de
    // que la cascada borre las filas que guardan su ruta.
    const a = admin();
    const { data: archivos } = await a
      .from("recursos_curso")
      .select("storage_path")
      .in("curso_id", cursosCreados)
      .not("storage_path", "is", null);
    const rutas = (archivos ?? []).map((r) => r.storage_path as string);
    if (rutas.length > 0) await a.storage.from("recursos-curso").remove(rutas);

    for (const id of cursosCreados) await borrarCurso(id);
    await borrarCuenta(docente.id);
    await borrarCuenta(estudiante.id);
    await borrarCuenta(ajeno.id);
  });

  async function crearUnidad(page: Page, titulo: string, ocultar = false) {
    const form = page.locator("form", { hasText: "Nueva unidad" });
    await form.getByLabel("Nombre de la unidad").fill(titulo);
    if (ocultar) await form.getByLabel("Ocultar a los estudiantes por ahora").check();
    await form.getByRole("button", { name: "Crear unidad" }).click();
    await expect(page.locator("li.card", { hasText: titulo })).toBeVisible();
  }

  function tarjeta(page: Page, unidad: string) {
    return page.locator("li.card", { hasText: unidad });
  }

  test("el docente organiza recursos y el estudiante solo ve y abre lo visible", async ({
    browser,
  }) => {
    const page = await (await browser.newContext()).newPage();
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/recursos`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Empieza creando la primera unidad")).toBeVisible();

    await crearUnidad(page, "Unidad 1. Fundamentos");
    const u1 = tarjeta(page, "Unidad 1. Fundamentos");

    // PDF: el título se propone solo a partir del nombre del archivo.
    await u1.getByRole("button", { name: "+ Agregar recurso" }).click();
    await u1.locator('input[name="archivo"]').setInputFiles(path.join(__dirname, "fixtures", "prueba.pdf"));
    await expect(u1.getByLabel("Título")).toHaveValue("prueba");
    await u1.getByLabel("Título").fill("Lectura 1");
    await u1.getByLabel("Descripción (opcional)").fill("Leer antes de la clase.");
    await u1.getByRole("button", { name: "Agregar recurso", exact: true }).click();
    await expect(u1.getByText("Lectura 1")).toBeVisible();

    // PPTX oculto.
    await u1.getByRole("button", { name: "+ Agregar recurso" }).click();
    await u1.locator('input[name="archivo"]').setInputFiles({
      name: "Presentación (final).pptx",
      mimeType: "",
      buffer: Buffer.from("PK contenido de prueba"),
    });
    await u1.getByLabel("Título").fill("Presentación 1");
    await u1.getByLabel("Ocultar a los estudiantes por ahora").check();
    await u1.getByRole("button", { name: "Agregar recurso", exact: true }).click();
    await expect(u1.locator("li", { hasText: "Presentación 1" }).getByText("Oculto")).toBeVisible();

    // Enlace sin "https://": se completa solo.
    await u1.getByRole("button", { name: "+ Agregar recurso" }).click();
    await u1.getByLabel("Enlace").check();
    await u1.getByLabel("Dirección del enlace").fill("youtube.com/watch?v=abc");
    await u1.getByLabel("Título").fill("Video introductorio");
    await u1.getByRole("button", { name: "Agregar recurso", exact: true }).click();
    await expect(u1.getByRole("link", { name: "Video introductorio" })).toHaveAttribute(
      "href",
      "https://youtube.com/watch?v=abc"
    );

    // Reordenar: el video sube un lugar.
    await u1.getByRole("button", { name: 'Subir "Video introductorio"' }).click();
    await expect
      .poll(async () => (await idRecurso(cursoId, "Video introductorio")).orden)
      .toBe(1);

    // Unidad oculta con un recurso visible adentro: igual no se ve.
    await crearUnidad(page, "Unidad 2. Avanzado", true);
    const u2 = tarjeta(page, "Unidad 2. Avanzado");
    await u2.getByRole("button", { name: "+ Agregar recurso" }).click();
    await u2.getByLabel("Enlace").check();
    await u2.getByLabel("Dirección del enlace").fill("https://example.com/secreto");
    await u2.getByLabel("Título").fill("Material adelantado");
    await u2.getByRole("button", { name: "Agregar recurso", exact: true }).click();
    await expect(u2.getByText("Material adelantado")).toBeVisible();

    const lectura = await idRecurso(cursoId, "Lectura 1");
    const presentacion = await idRecurso(cursoId, "Presentación 1");
    expect(lectura.storage_path!.startsWith(`${cursoId}/`)).toBe(true);

    // El docente abre su archivo oculto sin problema.
    const respDocente = await page.request.get(`/recursos/${presentacion.id}`, { maxRedirects: 0 });
    expect(respDocente.status()).toBe(307);

    // --- Estudiante inscrito ---
    const pEst = await (await browser.newContext()).newPage();
    await iniciarSesion(pEst, estudiante.email, estudiante.password);
    await pEst.goto(`/estudiante/cursos/${cursoId}`);
    const seccion = pEst.locator("section", { has: pEst.getByRole("heading", { name: "Recursos" }) });
    await expect(seccion.getByText("Unidad 1. Fundamentos")).toBeVisible();
    await expect(seccion.getByRole("link", { name: "Lectura 1" })).toBeVisible();
    await expect(seccion.getByText("Leer antes de la clase.")).toBeVisible();
    await expect(seccion.getByRole("link", { name: "Video introductorio" })).toBeVisible();
    await expect(seccion.getByText("Presentación 1")).toHaveCount(0);
    await expect(seccion.getByText("Unidad 2. Avanzado")).toHaveCount(0);
    await expect(seccion.getByText("Material adelantado")).toHaveCount(0);

    // Abrir el PDF visible: redirige a un enlace firmado de Storage, que sirve el archivo.
    const resp = await pEst.request.get(`/recursos/${lectura.id}`, { maxRedirects: 0 });
    expect(resp.status()).toBe(307);
    expect(resp.headers()["location"]).toContain("/storage/v1/object/sign/recursos-curso/");
    const archivo = await pEst.request.get(resp.headers()["location"]);
    expect(archivo.status()).toBe(200);

    // El oculto no: ni por la app...
    expect((await pEst.request.get(`/recursos/${presentacion.id}`, { maxRedirects: 0 })).status()).toBe(404);
    // ...ni yendo directo a Storage con su propia sesión.
    const clienteEst = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    await clienteEst.auth.signInWithPassword({ email: estudiante.email, password: estudiante.password });
    const { error: errorFirma } = await clienteEst.storage
      .from("recursos-curso")
      .createSignedUrl(presentacion.storage_path!, 60);
    expect(errorFirma).not.toBeNull();
    const { data: filasVisibles } = await clienteEst.from("recursos_curso").select("titulo").eq("curso_id", cursoId);
    expect((filasVisibles ?? []).map((r) => r.titulo).sort()).toEqual(["Lectura 1", "Video introductorio"]);

    // --- Estudiante de otro curso: nada ---
    const pAjeno = await (await browser.newContext()).newPage();
    await iniciarSesion(pAjeno, ajeno.email, ajeno.password);
    expect((await pAjeno.request.get(`/recursos/${lectura.id}`, { maxRedirects: 0 })).status()).toBe(404);

    // El docente muestra la presentación y el estudiante ya la ve.
    await u1
      .locator("li", { hasText: "Presentación 1" })
      .getByRole("button", { name: "Mostrar", exact: true })
      .click();
    await expect(u1.locator("li", { hasText: "Presentación 1" }).getByText("Oculto")).toHaveCount(0);
    await pEst.reload();
    await expect(seccion.getByRole("link", { name: "Presentación 1" })).toBeVisible();
    const respPptx = await pEst.request.get(`/recursos/${presentacion.id}`, { maxRedirects: 0 });
    expect(respPptx.status()).toBe(307);
    // DOCX/PPTX se descargan con su nombre original (sin acentos ni
    // símbolos: el SDK de Storage los codifica dos veces). Se comprueba el
    // nombre que de verdad recibe el navegador.
    const descarga = await pEst.request.get(respPptx.headers()["location"]);
    expect(descarga.headers()["content-disposition"]).toContain('filename="Presentacion final.pptx"');
  });

  test("duplicar el curso copia unidades y recursos con sus archivos y visibilidad", async ({ page }) => {
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /Duplicar curso para otro grupo/ }).click();
    await page.getByLabel("Grupo").fill("G-copia");
    await page.getByLabel("Periodo").fill("2027-A");
    await page.getByRole("button", { name: "Duplicar curso" }).click();
    await page.waitForURL(/\/docente\/cursos\/[0-9a-f-]+\/tareas$/);
    const nuevoId = page.url().split("/cursos/")[1].split("/")[0];
    expect(nuevoId).not.toBe(cursoId);
    cursosCreados.push(nuevoId);

    const a = admin();
    const { data: unidades } = await a
      .from("unidades_recursos")
      .select("titulo, visible, recursos_curso(titulo, tipo, url, storage_path, visible)")
      .eq("curso_id", nuevoId)
      .order("orden");
    expect(unidades!.map((u) => [u.titulo, u.visible])).toEqual([
      ["Unidad 1. Fundamentos", true],
      ["Unidad 2. Avanzado", false],
    ]);
    const recursos = unidades!.flatMap((u) => u.recursos_curso);
    expect(recursos).toHaveLength(4);
    for (const r of recursos.filter((r) => r.tipo === "ARCHIVO")) {
      expect(r.storage_path!.startsWith(`${nuevoId}/`)).toBe(true);
      const { data: archivo } = await a.storage.from("recursos-curso").download(r.storage_path!);
      expect(archivo).not.toBeNull();
    }

    // La página del curso nuevo los muestra.
    await page.goto(`/docente/cursos/${nuevoId}/recursos`);
    await expect(page.getByText("Lectura 1")).toBeVisible();
    await expect(page.getByText("Material adelantado")).toBeVisible();
  });
});
