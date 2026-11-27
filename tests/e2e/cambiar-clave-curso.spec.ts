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

// Cambiar la clave: la anterior deja de servir para inscribirse, la nueva sí,
// y quien ya estaba inscrito sigue inscrito.
test.describe("Cambiar clave de acceso del curso", () => {
  let docente: CuentaPrueba;
  let inscrito: CuentaPrueba;
  let nuevo: CuentaPrueba;
  let cursoId: string;
  let claveAnterior: string;

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "clave-doc");
    inscrito = await crearCuenta("ESTUDIANTE", "clave-est");
    nuevo = await crearCuenta("ESTUDIANTE", "clave-nuevo");
    cursoId = await crearCurso(docente.id);
    await inscribir(cursoId, inscrito.id);
    const { data } = await admin().from("cursos").select("clave_acceso").eq("id", cursoId).single();
    claveAnterior = data!.clave_acceso;
  });

  test.afterAll(async () => {
    await borrarCurso(cursoId);
    await borrarCuenta(docente.id);
    await borrarCuenta(inscrito.id);
    await borrarCuenta(nuevo.id);
  });

  test("genera una clave nueva y la anterior deja de funcionar", async ({ page }) => {
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}`);
    await page.waitForLoadState("networkidle");

    // Cancelar el confirm() no cambia nada.
    page.once("dialog", (d) => d.dismiss());
    await page.getByRole("button", { name: "Cambiar clave de acceso" }).click();
    await expect(page.getByText(claveAnterior)).toBeVisible();

    let mensaje = "";
    page.once("dialog", (d) => {
      mensaje = d.message();
      d.accept();
    });
    await page.getByRole("button", { name: "Cambiar clave de acceso" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Clave nueva" })).toBeVisible();
    expect(mensaje).toContain("dejará de funcionar");

    const { data } = await admin().from("cursos").select("clave_acceso").eq("id", cursoId).single();
    const claveNueva = data!.clave_acceso;
    expect(claveNueva).not.toBe(claveAnterior);
    expect(claveNueva).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);

    // La franja verde ya muestra la clave nueva y no la anterior.
    const franja = page.locator("header").filter({ hasText: "Libro de calificaciones" });
    await expect(franja.getByText(claveNueva)).toBeVisible();
    await expect(franja.getByText(claveAnterior)).toHaveCount(0);

    const cliente = await clienteDe(nuevo);
    const conAnterior = await cliente.rpc("inscribirse_a_curso", { p_clave_acceso: claveAnterior });
    expect(conAnterior.error?.message).toBe("Clave de acceso inválida");
    const conNueva = await cliente.rpc("inscribirse_a_curso", { p_clave_acceso: claveNueva });
    expect(conNueva.error).toBeNull();

    const { count } = await admin()
      .from("inscripciones")
      .select("id", { count: "exact", head: true })
      .eq("curso_id", cursoId)
      .eq("estudiante_id", inscrito.id);
    expect(count).toBe(1);
  });
});
