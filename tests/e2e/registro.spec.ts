import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function correoPrueba(etiqueta: string) {
  return `edugrade.e2e.${etiqueta}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@gmail.com`;
}

async function rolDe(email: string) {
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 });
  const usuario = data.users.find((u) => u.email === email);
  if (!usuario) return { id: null, rol: null };
  const { data: perfil } = await admin()
    .from("perfiles")
    .select("rol")
    .eq("id", usuario.id)
    .single();
  return { id: usuario.id, rol: perfil?.rol ?? null };
}

// El rol lo decide handle_new_user según docentes_autorizados (migración
// 20261017120000), no el formulario ni lo que mande el cliente.
test.describe("Registro: el rol depende de la lista de docentes autorizados", () => {
  const creados: string[] = [];

  test.afterAll(async () => {
    for (const id of creados) await admin().auth.admin.deleteUser(id);
  });

  async function registrar(page: import("@playwright/test").Page, email: string) {
    await page.goto("/registro");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Rol")).toHaveCount(0);
    await page.getByLabel("Nombre completo").fill("E2E registro");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña").fill("RegistroE2E123!");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
  }

  test("un correo cualquiera queda como estudiante", async ({ page }) => {
    const email = correoPrueba("reg-est");
    await registrar(page, email);
    await page.waitForURL(/\/estudiante$/);
    const { id, rol } = await rolDe(email);
    if (id) creados.push(id);
    expect(rol).toBe("ESTUDIANTE");
  });

  test("un correo de la lista queda como docente", async ({ page }) => {
    const email = correoPrueba("reg-doc");
    await admin().from("docentes_autorizados").insert({ correo: email });
    try {
      await registrar(page, email);
      await page.waitForURL(/\/docente$/);
    } finally {
      await admin().from("docentes_autorizados").delete().eq("correo", email);
    }
    const { id, rol } = await rolDe(email);
    if (id) creados.push(id);
    expect(rol).toBe("DOCENTE");
  });

  test("mandar rol DOCENTE directo a Supabase, sin el formulario, ya no sirve", async () => {
    const email = correoPrueba("reg-bypass");
    const cliente = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data, error } = await cliente.auth.signUp({
      email,
      password: "RegistroE2E123!",
      options: { data: { rol: "DOCENTE", nombre_completo: "E2E bypass" } },
    });
    expect(error).toBeNull();
    if (data.user) creados.push(data.user.id);
    const { rol } = await rolDe(email);
    expect(rol).toBe("ESTUDIANTE");
  });
});
