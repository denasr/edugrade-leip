import { defineConfig, devices } from "@playwright/test";

// Estas pruebas corren contra el proyecto real de Supabase (no hay uno de
// staging, ver CLAUDE.md) — cada spec crea sus propias cuentas y curso
// desechables (edugrade.e2e.*@gmail.com) y los borra al terminar. Necesitan
// NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY, que next dev ya carga de
// .env.local; aquí se cargan aparte porque los specs y helpers corren fuera
// del proceso de Next.js.
import { config as cargarEnv } from "dotenv";
cargarEnv({ path: ".env.local" });

const PUERTO = 3210;

export default defineConfig({
  testDir: "./tests/e2e",
  // Generoso a propósito: cada spec hace varias cargas de página, y cada
  // una dispara varias consultas secuenciales contra el proyecto real de
  // Supabase (no hay uno local) además de la compilación en frío de
  // Turbopack en este filesystem lento (ver el aviso "Slow filesystem
  // detected" de next dev) — 30s se quedó corto en la práctica, cada spec
  // de esta suite tardó entre 30 y 45s solo para llegar al punto de falla.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // Un solo worker a propósito: los specs comparten el mismo proyecto de
  // Supabase (creación de cuentas vía Admin API) y correr varios a la vez
  // no ahorra tiempo real (limitado por la app, no por la máquina) a cambio
  // de más flakiness al depurar.
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    viewport: { width: 400, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --port ${PUERTO}`,
    url: `http://localhost:${PUERTO}`,
    reuseExistingServer: !process.env.CI,
    // Igual de generoso que el timeout de arriba y por la misma razón: en
    // este entorno el arranque en frío de next dev (Turbopack + filesystem
    // lento) puede tardar más de los 120s por defecto.
    timeout: 300_000,
  },
});
