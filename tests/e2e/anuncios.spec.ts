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

// Tablón de anuncios (migración 20261031120000): el docente publica, fija,
// edita y elimina; el estudiante inscrito lo ve en su curso y en su panel;
// nadie fuera del curso puede leerlo.
test.describe("Tablón de anuncios", () => {
  let docente: CuentaPrueba;
  let estudiante: CuentaPrueba;
  let ajeno: CuentaPrueba;
  let cursoId: string;

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "anuncios-doc");
    estudiante = await crearCuenta("ESTUDIANTE", "anuncios-est");
    ajeno = await crearCuenta("ESTUDIANTE", "anuncios-ajeno");
    cursoId = await crearCurso(docente.id);
    await inscribir(cursoId, estudiante.id);
  });

  test.afterAll(async () => {
    await borrarCurso(cursoId);
    await borrarCuenta(docente.id);
    await borrarCuenta(estudiante.id);
    await borrarCuenta(ajeno.id);
  });

  test("el docente publica, fija, edita y elimina; el estudiante lo ve", async ({
    browser,
  }) => {
    const paginaDocente = await (await browser.newContext()).newPage();
    await iniciarSesion(paginaDocente, docente.email, docente.password);
    await paginaDocente.goto(`/docente/cursos/${cursoId}/anuncios`);
    await paginaDocente.waitForLoadState("networkidle");

    const publicar = async (texto: string, fijar = false) => {
      await paginaDocente.getByLabel("Mensaje para el grupo").fill(texto);
      if (fijar) await paginaDocente.getByLabel("Fijar arriba del tablón").check();
      await paginaDocente.getByRole("button", { name: "Publicar" }).click();
      await expect(paginaDocente.locator("li.card").filter({ hasText: texto })).toBeVisible();
      await expect(paginaDocente.getByLabel("Mensaje para el grupo")).toHaveValue("");
    };

    await publicar("Primer aviso del semestre");
    await publicar("Clase por Meet: https://meet.google.com/abc-defg-hij.");

    const tarjetaDocente = (texto: string) =>
      paginaDocente.locator("li.card").filter({ hasText: texto });

    // Fijar el primero: pasa arriba aunque sea el más viejo.
    await tarjetaDocente("Primer aviso").getByRole("button", { name: "Fijar arriba" }).click();
    await expect(tarjetaDocente("Primer aviso").getByText("📌 Fijado")).toBeVisible();
    await expect(paginaDocente.locator("li.card").first()).toContainText("Primer aviso");

    // Editar
    await tarjetaDocente("Primer aviso").getByRole("button", { name: "Editar" }).click();
    await paginaDocente.getByLabel("Texto del anuncio").fill("Primer aviso corregido");
    await paginaDocente.getByRole("button", { name: "Guardar" }).click();
    await expect(tarjetaDocente("Primer aviso corregido").getByText("· editado")).toBeVisible();

    // Estudiante: tablón del curso, con el fijado arriba y el enlace clicable
    // (sin el punto final de la oración).
    const paginaEstudiante = await (await browser.newContext()).newPage();
    await iniciarSesion(paginaEstudiante, estudiante.email, estudiante.password);
    await expect(paginaEstudiante.getByText("Anuncios recientes")).toBeVisible();
    await expect(paginaEstudiante.getByText("Primer aviso corregido")).toBeVisible();

    await paginaEstudiante.goto(`/estudiante/cursos/${cursoId}`);
    const tablon = paginaEstudiante.locator("section").filter({
      has: paginaEstudiante.getByRole("heading", { name: "Anuncios" }),
    });
    await expect(tablon.locator("li").first()).toContainText("Primer aviso corregido");
    await expect(tablon.getByText("Nuevo").first()).toBeVisible();
    await expect(
      tablon.getByRole("link", { name: "https://meet.google.com/abc-defg-hij" })
    ).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");

    // Eliminar: desaparece también para el estudiante.
    paginaDocente.once("dialog", (d) => d.accept());
    await tarjetaDocente("Clase por Meet").getByRole("button", { name: "Eliminar" }).click();
    await expect(tarjetaDocente("Clase por Meet")).toHaveCount(0);

    await paginaEstudiante.reload();
    await expect(paginaEstudiante.getByText("Clase por Meet")).toHaveCount(0);
    await expect(paginaEstudiante.getByText("Primer aviso corregido")).toBeVisible();
  });

  test("un estudiante de otro curso no puede leer ni publicar anuncios", async () => {
    const cliente = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // El estudiante inscrito tampoco puede publicar, solo leer.
    await cliente.auth.signInWithPassword({ email: estudiante.email, password: estudiante.password });
    const { error: errorInscrito } = await cliente
      .from("anuncios")
      .insert({ curso_id: cursoId, autor_id: estudiante.id, contenido: "hola" });
    expect(errorInscrito).not.toBeNull();
    await cliente.auth.signOut();

    await cliente.auth.signInWithPassword({ email: ajeno.email, password: ajeno.password });
    const { data, error } = await cliente.from("anuncios").select("id").eq("curso_id", cursoId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
    await cliente.auth.signOut();
  });
});
