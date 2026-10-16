import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  crearCuenta,
  borrarCuenta,
  iniciarSesion,
  type CuentaPrueba,
} from "./helpers/cuentas-prueba";

// El enlace se genera con la Admin API en vez de mandar un correo real (no
// hay buzón que leer en una prueba, y cada envío gasta el límite por hora
// de Supabase). generateLink produce el mismo formato que manda
// formulario-recuperar.tsx desde que pide el enlace con flujo "implicit":
// la sesión en el fragmento (#access_token=...). Se abre en un contexto de
// navegador nuevo a propósito — el bug original (PKCE) era justo que el
// enlace solo servía en el navegador donde se había pedido.
test.describe("Recuperar contraseña", () => {
  let estudiante: CuentaPrueba;

  test.beforeAll(async () => {
    estudiante = await crearCuenta("ESTUDIANTE", "recup-est");
  });

  test.afterAll(async () => {
    await borrarCuenta(estudiante.id);
  });

  test("el enlace del correo abre el formulario y la contraseña nueva sirve para entrar", async ({
    browser,
    baseURL,
  }) => {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: estudiante.email,
      options: {
        redirectTo: `${baseURL}/auth/confirm?next=/restablecer-contrasena`,
      },
    });
    expect(error).toBeNull();

    const contexto = await browser.newContext();
    const page = await contexto.newPage();
    await page.goto(data.properties!.action_link);

    await expect(page.getByRole("heading", { name: "Nueva contraseña" })).toBeVisible();
    // El token no debe quedarse en la barra de direcciones.
    expect(page.url()).not.toContain("access_token");

    const nueva = "NuevaE2E456!";
    await page.getByLabel("Contraseña nueva").fill(nueva);
    await page.getByLabel("Confirmar contraseña").fill(nueva);
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await page.waitForURL(/\/estudiante$/);

    const otroContexto = await browser.newContext();
    const otraPagina = await otroContexto.newPage();
    await iniciarSesion(otraPagina, estudiante.email, nueva);

    await contexto.close();
    await otroContexto.close();
  });

  test("pedir el enlace muestra la confirmación aunque el correo no tenga cuenta", async ({
    page,
  }) => {
    await page.goto("/recuperar");
    await page.getByLabel("Correo electrónico").fill(
      `edugrade.e2e.sin-cuenta.${Date.now()}@gmail.com`
    );
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(page.getByRole("heading", { name: "Revisa tu correo" })).toBeVisible();
  });
});
