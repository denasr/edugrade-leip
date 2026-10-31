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

const HORA = 60 * 60 * 1000;
const enHoras = (horas: number) => new Date(Date.now() + horas * HORA).toISOString();

// Etiqueta "Por vencer" (AvisoPorVencer): solo para lo que el estudiante
// todavía no entrega y cierra en menos de 2 días (cierraPronto).
test.describe("Aviso de actividades por vencer", () => {
  let docente: CuentaPrueba;
  let estudiante: CuentaPrueba;
  let cursoId: string;

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "vencer-doc");
    estudiante = await crearCuenta("ESTUDIANTE", "vencer-est");
    cursoId = await crearCurso(docente.id);
    await inscribir(cursoId, estudiante.id);
    const a = admin();

    async function actividad(titulo: string, tipo: "TAREA" | "EXAMEN", cierre: string) {
      const { data } = await a
        .from("actividades")
        .insert({ curso_id: cursoId, titulo, tipo, fecha_cierre: cierre })
        .select("id")
        .single();
      return data!.id as string;
    }

    await actividad("Tarea urgente", "TAREA", enHoras(20));
    await actividad("Examen urgente", "EXAMEN", enHoras(40));
    await actividad("Tarea con tiempo", "TAREA", enHoras(24 * 5));

    // Ya entregada: aunque cierre pronto, no lleva aviso.
    const entregadaId = await actividad("Tarea ya entregada", "TAREA", enHoras(10));
    const { data: entrega } = await a
      .from("entregas")
      .insert({ actividad_id: entregadaId, estudiante_id: estudiante.id })
      .select("id")
      .single();
    await a.from("archivos_entrega").insert({
      entrega_id: entrega!.id,
      nombre_archivo: "tarea.pdf",
      storage_path: `${entrega!.id}/0-tarea.pdf`,
    });
  });

  test.afterAll(async () => {
    await borrarCurso(cursoId);
    await borrarCuenta(docente.id);
    await borrarCuenta(estudiante.id);
  });

  test("marca como 'Por vencer' solo lo pendiente que cierra en menos de 2 días", async ({
    page,
  }) => {
    await iniciarSesion(page, estudiante.email, estudiante.password);

    // Panel: lista de Pendientes.
    await page.goto("/estudiante");
    const pendiente = (titulo: string) =>
      page.getByRole("listitem").filter({ hasText: titulo });
    await expect(pendiente("Tarea urgente").getByText("Por vencer")).toBeVisible();
    await expect(pendiente("Examen urgente").getByText("Por vencer")).toBeVisible();
    await expect(pendiente("Tarea con tiempo")).toBeVisible();
    await expect(pendiente("Tarea con tiempo").getByText("Por vencer")).toHaveCount(0);

    // Tarjetas dentro del curso.
    await page.goto(`/estudiante/cursos/${cursoId}`);
    await page.waitForLoadState("networkidle");
    const tarjeta = (titulo: string) =>
      page.locator("li.card").filter({ hasText: titulo });
    await expect(tarjeta("Tarea urgente").getByText("Por vencer")).toBeVisible();
    await expect(tarjeta("Examen urgente").getByText("Por vencer")).toBeVisible();
    await expect(tarjeta("Tarea con tiempo")).toBeVisible();
    await expect(tarjeta("Tarea con tiempo").getByText("Por vencer")).toHaveCount(0);
    await expect(tarjeta("Tarea ya entregada")).toBeVisible();
    await expect(tarjeta("Tarea ya entregada").getByText("Por vencer")).toHaveCount(0);
  });
});
