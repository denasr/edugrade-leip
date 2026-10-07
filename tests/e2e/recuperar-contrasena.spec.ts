import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  crearCuenta,
  borrarCuenta,
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

// No hay forma de recibir un correo real en esta suite, así que se genera
// el mismo enlace de recuperación que Supabase mandaría por correo vía la
// Admin API (generateLink) — el navegador lo visita exactamente igual que
// si viniera de un clic en el correo, cubriendo /auth/confirm de punta a
// punta (sea cual sea el formato que termine usando, code o
// token_hash+type — ver el comentario en esa ruta).
test.describe("Recuperar contraseña", () => {
  let estudiante: CuentaPrueba;

  test.beforeAll(async () => {
    estudiante = await crearCuenta("ESTUDIANTE", "recuperar-est");
  });

  test.afterAll(async () => {
    await borrarCuenta(estudiante.id);
  });

  test("el formulario de /recuperar siempre muestra el mismo aviso, exista o no la cuenta", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
    // Timeout más generoso: primera visita a /recuperar en este proceso de
    // next dev, con compilación en frío de Turbopack de por medio (mismo
    // motivo que el resto de esta suite usa timeouts holgados).
    await page.waitForURL(/\/recuperar$/, { timeout: 30_000 });

    await page.fill('input[type="email"]', "este-correo-no-existe@example.com");
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(page.getByText("Revisa tu correo")).toBeVisible();
  });

  test("el enlace de recuperación deja cambiar la contraseña, y la nueva sirve para iniciar sesión", async ({
    page,
  }) => {
    const nuevaPassword = "NuevaPasswordE2E456!";

    const { data, error } = await admin().auth.admin.generateLink({
      type: "recovery",
      email: estudiante.email,
      options: {
        redirectTo: "http://localhost:3210/auth/confirm?next=/restablecer-contrasena",
      },
    });
    if (error || !data) {
      throw new Error(`No se pudo generar el enlace de recuperación: ${error?.message}`);
    }

    // action_link apunta al endpoint de verificación del propio proyecto de
    // Supabase (igual que el enlace que llegaría por correo real) — hay que
    // visitarlo tal cual, no reescribirlo a localhost, porque es Supabase
    // quien valida el token y recién después redirige de vuelta al
    // redirectTo (localhost:3210) que se le pasó arriba.
    await page.goto(data.properties.action_link);
    // Sin anclar el final ($): este proyecto entrega la sesión como
    // fragmento de URL (#access_token=...), así que la URL real queda como
    // /restablecer-contrasena#access_token=... — ver el comentario en
    // formulario-nueva-contrasena.tsx.
    await expect(page).toHaveURL(/\/restablecer-contrasena/);
    await expect(
      page.getByRole("heading", { name: "Nueva contraseña" })
    ).toBeVisible();

    const inputs = page.locator('input[type="password"]');
    await inputs.nth(0).fill(nuevaPassword);
    await inputs.nth(1).fill(nuevaPassword);
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await page.waitForURL(/\/estudiante$/);

    await page.goto("/");
    await page.context().clearCookies();
    await iniciarSesion(page, estudiante.email, nuevaPassword);
    await expect(page).toHaveURL(/\/estudiante$/);
  });

  test("un enlace inválido/vencido redirige a /recuperar con el aviso correspondiente", async ({
    page,
  }) => {
    await page.goto("/auth/confirm?token_hash=lo-que-sea&type=recovery");
    await expect(page).toHaveURL(/\/recuperar\?error=enlace-invalido$/);
    await expect(
      page.getByText("El enlace venció o ya se usó. Pide uno nuevo.")
    ).toBeVisible();
  });
});
