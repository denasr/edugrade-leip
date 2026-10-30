import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { extractText } from "unpdf";
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

const DIA = 24 * 60 * 60 * 1000;
const futuro = new Date(Date.now() + 30 * DIA).toISOString();
const pasado = new Date(Date.now() - 2 * DIA).toISOString();
const fechaMas = (dias: number) =>
  new Date(Date.now() + dias * DIA).toISOString().slice(0, 10);

// Reporte de desempeño en PDF (app/estudiante/cursos/[id]/reporte). Arma con
// la secret key un curso con cada situación posible y verifica el texto del
// PDF descargado desde el botón real de la página.
test.describe("Reporte de desempeño del estudiante (PDF)", () => {
  let docente: CuentaPrueba;
  let estudiante: CuentaPrueba;
  let cursoId: string;

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "reporte-doc");
    estudiante = await crearCuenta("ESTUDIANTE", "reporte-est");
    cursoId = await crearCurso(docente.id); // 40% tareas, 50% exámenes, 10% asistencia
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
    async function entrega(actividadId: string, conArchivo: boolean, nota?: number, origen = "MANUAL") {
      const { data } = await a
        .from("entregas")
        .insert({ actividad_id: actividadId, estudiante_id: estudiante.id })
        .select("id")
        .single();
      if (conArchivo) {
        await a.from("archivos_entrega").insert({
          entrega_id: data!.id,
          nombre_archivo: "tarea.pdf",
          storage_path: `${data!.id}/0-tarea.pdf`,
        });
      }
      if (nota !== undefined) {
        await a
          .from("evaluaciones")
          .insert({ entrega_id: data!.id, calificacion_final: nota, origen });
      }
    }

    await entrega(await actividad("Tarea calificada", "TAREA", futuro), true, 8);
    await entrega(await actividad("Tarea sin calificar", "TAREA", futuro), true);
    await actividad("Tarea por entregar", "TAREA", futuro);
    await actividad("Tarea vencida", "TAREA", pasado);
    // Entrega a medias (sin archivo): cuenta como pendiente, no como entregada.
    await entrega(await actividad("Tarea a medias", "TAREA", futuro), false);

    await entrega(await actividad("Examen calificado", "EXAMEN", futuro), false, 6, "AUTO_EXAMEN");
    await actividad("Examen vencido", "EXAMEN", pasado);
    await actividad("Examen abierto", "EXAMEN", futuro);

    // Asistencia: 2 presentes, 1 falta, 1 justificada → 2/3 = 67%.
    const estados = ["presente", "presente", "ausente", "justificado"];
    for (let i = 0; i < estados.length; i++) {
      const { data: sesion } = await a
        .from("sesiones_asistencia")
        .insert({ curso_id: cursoId, fecha: fechaMas(i), creado_por: docente.id })
        .select("id")
        .single();
      await a
        .from("asistencias")
        .insert({ sesion_id: sesion!.id, estudiante_id: estudiante.id, estado: estados[i] });
    }
  });

  test.afterAll(async () => {
    await borrarCurso(cursoId);
    await borrarCuenta(docente.id);
    await borrarCuenta(estudiante.id);
  });

  test("el estudiante descarga su reporte y trae calificaciones, asistencia, pendientes y promedio", async ({
    page,
  }) => {
    await iniciarSesion(page, estudiante.email, estudiante.password);
    await page.goto(`/estudiante/cursos/${cursoId}`);
    await page.waitForLoadState("networkidle");

    // Promedio en pantalla: (8×40 + 6×50 + 6.67×10) / 100 = 6.87 → 6.9.
    await expect(page.getByText("6.9/10")).toBeVisible();

    const [descarga] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Descargar mi reporte (PDF)" }).click(),
    ]);
    expect(descarga.suggestedFilename()).toMatch(/^reporte-curso-de-prueba-e2e-\d{4}-\d{2}-\d{2}\.pdf$/);

    const bytes = readFileSync((await descarga.path())!);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const { text } = await extractText(new Uint8Array(bytes), { mergePages: true });
    const t = text.replace(/\s+/g, " ");

    expect(t).toContain("Reporte de desempeño");
    expect(t).toContain("E2E reporte-est");

    // Promedio general: el mismo número que en pantalla.
    expect(t).toMatch(/Calificación final 6\.9\/10/);
    expect(t).toMatch(/Promedio de tareas \(40%\) 8\.0\/10/);
    expect(t).toMatch(/Promedio de exámenes \(50%\) 6\.0\/10/);
    expect(t).toMatch(/Asistencia \(10%\) 67%/);

    // Asistencia
    expect(t).toMatch(/Sesiones registradas desde tu inscripción 4/);
    expect(t).toMatch(/Asistencias 2/);
    expect(t).toMatch(/Faltas 1/);
    expect(t).toMatch(/Faltas justificadas \(no cuentan en el porcentaje\) 1/);

    // Pendientes: "Tarea por entregar" y la entrega a medias siguen abiertas.
    expect(t).toMatch(/Tareas por entregar \(todavía abiertas\) 2/);
    expect(t).toMatch(/Tareas no entregadas \(ya cerraron\) 1/);
    expect(t).toMatch(/Exámenes por presentar \(todavía abiertos\) 1/);
    expect(t).toMatch(/Exámenes no presentados \(ya cerraron\) 1/);

    // Detalle por actividad
    expect(t).toMatch(/Tarea calificada .*8\.0\/10/);
    expect(t).toMatch(/Tarea sin calificar .*Entregada, sin calificar/);
    expect(t).toMatch(/Tarea vencida .*No entregada/);
    expect(t).toMatch(/Tarea a medias .*Por entregar/);
    expect(t).toMatch(/Examen calificado .*6\.0\/10/);
    expect(t).toMatch(/Examen vencido .*No presentado/);
    expect(t).toMatch(/Examen abierto .*Por presentar/);
  });

  test("el reporte solo lo puede descargar el propio estudiante", async ({ page }) => {
    const url = `/estudiante/cursos/${cursoId}/reporte`;

    const sinSesion = await page.request.get(url);
    expect(sinSesion.status()).toBe(401);

    // Un docente (aunque sea el dueño del curso) no descarga reportes de estudiante.
    await iniciarSesion(page, docente.email, docente.password);
    expect((await page.request.get(url)).status()).toBe(403);

    // Otro estudiante, no inscrito en el curso.
    const otro = await crearCuenta("ESTUDIANTE", "reporte-otro");
    try {
      await page.context().clearCookies();
      await iniciarSesion(page, otro.email, otro.password);
      expect((await page.request.get(url)).status()).toBe(404);
    } finally {
      await borrarCuenta(otro.id);
    }
  });
});
