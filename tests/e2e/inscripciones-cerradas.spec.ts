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

async function clienteDe(cuenta: CuentaPrueba) {
  const cliente = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  await cliente.auth.signInWithPassword({ email: cuenta.email, password: cuenta.password });
  return cliente;
}

// Cerrar inscripciones: con la clave vigente nadie nuevo entra, quien ya
// estaba inscrito sigue inscrito, y al reabrir (sin confirm) se puede volver
// a inscribir con la misma clave.
test.describe("Cerrar y abrir inscripciones del curso", () => {
  let docente: CuentaPrueba;
  let inscrito: CuentaPrueba;
  let nuevo: CuentaPrueba;
  let cursoId: string;
  let clave: string;

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "cerradas-doc");
    inscrito = await crearCuenta("ESTUDIANTE", "cerradas-est");
    nuevo = await crearCuenta("ESTUDIANTE", "cerradas-nuevo");
    cursoId = await crearCurso(docente.id);
    await inscribir(cursoId, inscrito.id);
    const { data } = await admin().from("cursos").select("clave_acceso").eq("id", cursoId).single();
    clave = data!.clave_acceso;
  });

  test.afterAll(async () => {
    await borrarCurso(cursoId);
    await borrarCuenta(docente.id);
    await borrarCuenta(inscrito.id);
    await borrarCuenta(nuevo.id);
  });

  async function cerradasEnBase() {
    const { data } = await admin()
      .from("cursos")
      .select("inscripciones_cerradas")
      .eq("id", cursoId)
      .single();
    return data!.inscripciones_cerradas as boolean;
  }

  test("cierra la puerta aunque se tenga la clave y se puede reabrir", async ({ browser }) => {
    const paginaDocente = await browser.newPage();
    await iniciarSesion(paginaDocente, docente.email, docente.password);
    await paginaDocente.goto(`/docente/cursos/${cursoId}`);
    await paginaDocente.waitForLoadState("networkidle");

    // Cancelar el confirm() no cambia nada.
    paginaDocente.once("dialog", (d) => d.dismiss());
    await paginaDocente.getByRole("button", { name: "Cerrar inscripciones" }).click();
    await expect(paginaDocente.getByRole("button", { name: "Cerrar inscripciones" })).toBeVisible();
    expect(await cerradasEnBase()).toBe(false);

    let mensaje = "";
    paginaDocente.once("dialog", (d) => {
      mensaje = d.message();
      d.accept();
    });
    await paginaDocente.getByRole("button", { name: "Cerrar inscripciones" }).click();
    await expect(paginaDocente.getByRole("button", { name: "Abrir inscripciones" })).toBeVisible();
    expect(mensaje).toContain("aunque conozca la clave");
    expect(mensaje).toContain("ya inscritos no se ven afectados");
    expect(await cerradasEnBase()).toBe(true);

    // Indicador junto a la clave, en la franja del curso y en /docente.
    const franja = paginaDocente.locator("header").filter({ hasText: "Libro de calificaciones" });
    await expect(franja.getByText("Inscripciones cerradas")).toBeVisible();
    await paginaDocente.goto("/docente");
    await expect(
      paginaDocente.getByRole("listitem").filter({ hasText: clave }).getByText("Inscripciones cerradas")
    ).toBeVisible();

    // El estudiante nuevo ve el mensaje en el formulario de inscripción.
    const paginaEstudiante = await browser.newPage();
    await iniciarSesion(paginaEstudiante, nuevo.email, nuevo.password);
    await paginaEstudiante.goto("/estudiante");
    await paginaEstudiante.getByLabel("Clave de acceso").fill(clave);
    await paginaEstudiante.getByRole("button", { name: "Inscribirme" }).click();
    await expect(
      paginaEstudiante.getByText("Las inscripciones de este curso están cerradas")
    ).toBeVisible();

    // Quien ya estaba inscrito sigue inscrito (y recibe su mensaje de siempre).
    const clienteInscrito = await clienteDe(inscrito);
    const otraVez = await clienteInscrito.rpc("inscribirse_a_curso", { p_clave_acceso: clave });
    expect(otraVez.error?.message).toBe("Ya estás inscrito en este curso");
    const { count: siguenInscritos } = await admin()
      .from("inscripciones")
      .select("id", { count: "exact", head: true })
      .eq("curso_id", cursoId);
    expect(siguenInscritos).toBe(1);

    // Reabrir no pide confirmación.
    let huboDialogo = false;
    paginaDocente.on("dialog", (d) => {
      huboDialogo = true;
      d.dismiss();
    });
    await paginaDocente.goto(`/docente/cursos/${cursoId}`);
    await paginaDocente.waitForLoadState("networkidle");
    await paginaDocente.getByRole("button", { name: "Abrir inscripciones" }).click();
    await expect(paginaDocente.getByRole("button", { name: "Cerrar inscripciones" })).toBeVisible();
    expect(huboDialogo).toBe(false);
    expect(await cerradasEnBase()).toBe(false);
    await expect(franja.getByText("Inscripciones cerradas")).toHaveCount(0);

    // Con la misma clave ya se puede inscribir.
    const clienteNuevo = await clienteDe(nuevo);
    const conClave = await clienteNuevo.rpc("inscribirse_a_curso", { p_clave_acceso: clave });
    expect(conClave.error).toBeNull();

    await paginaDocente.close();
    await paginaEstudiante.close();
  });
});
