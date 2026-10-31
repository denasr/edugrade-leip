import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
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

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const cierreViejo = "2026-06-15T23:59:00.000Z";

// Duplicar (copia actividades ocultas con sus fechas, preguntas y material;
// nada de estudiantes, entregas, asistencia ni anuncios) y archivar (sale
// de la lista principal y ya no admite inscripciones).
test.describe("Archivar y duplicar cursos", () => {
  let docente: CuentaPrueba;
  let estudiante: CuentaPrueba;
  let cursoId: string;
  let claveAcceso: string;
  const cursosCreados: string[] = [];

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "duplicar-doc");
    estudiante = await crearCuenta("ESTUDIANTE", "duplicar-est");
    cursoId = await crearCurso(docente.id);
    cursosCreados.push(cursoId);
    await inscribir(cursoId, estudiante.id);
    const a = admin();

    await a.from("cursos").update({ porcentaje_tareas: 30, porcentaje_examenes: 60, porcentaje_asistencia: 10 }).eq("id", cursoId);
    const { data: curso } = await a.from("cursos").select("clave_acceso").eq("id", cursoId).single();
    claveAcceso = curso!.clave_acceso;

    const { data: tarea } = await a
      .from("actividades")
      .insert({ curso_id: cursoId, titulo: "Tarea con material", tipo: "TAREA", instrucciones: "Lee el PDF.", fecha_cierre: cierreViejo })
      .select("id")
      .single();
    const rutaMaterial = `${cursoId}/${tarea!.id}/lectura.pdf`;
    await a.storage
      .from("materiales-actividades")
      .upload(rutaMaterial, readFileSync(path.join(__dirname, "fixtures", "prueba.pdf")), { contentType: "application/pdf" });
    await a.from("materiales_actividad").insert({ actividad_id: tarea!.id, nombre_archivo: "lectura.pdf", storage_path: rutaMaterial });
    await a.from("entregas").insert({ actividad_id: tarea!.id, estudiante_id: estudiante.id });

    const { data: examen } = await a
      .from("actividades")
      .insert({ curso_id: cursoId, titulo: "Examen parcial", tipo: "EXAMEN", fecha_cierre: cierreViejo, intentos_permitidos: 2 })
      .select("id")
      .single();
    await a.from("preguntas_examen").insert([
      { actividad_id: examen!.id, enunciado: "¿2+2?", opciones: ["3", "4"], correcta: "4", puntos: 5, orden: 0 },
      { actividad_id: examen!.id, enunciado: "¿3+3?", opciones: ["6", "7"], correcta: "6", puntos: 5, orden: 1 },
    ]);

    await a.from("anuncios").insert({ curso_id: cursoId, autor_id: docente.id, contenido: "Aviso del semestre viejo" });
    await a.from("sesiones_asistencia").insert({ curso_id: cursoId, fecha: "2026-06-01", creado_por: docente.id });
  });

  test.afterAll(async () => {
    const a = admin();
    for (const id of cursosCreados) {
      const { data: materiales } = await a
        .from("materiales_actividad")
        .select("storage_path, actividades!inner(curso_id)")
        .eq("actividades.curso_id", id);
      const rutas = (materiales ?? []).map((m) => m.storage_path);
      if (rutas.length > 0) await a.storage.from("materiales-actividades").remove(rutas);
      await borrarCurso(id);
    }
    await borrarCuenta(docente.id);
    await borrarCuenta(estudiante.id);
  });

  test("duplicar copia actividades, preguntas y material, pero nada del semestre", async ({ page }) => {
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /Duplicar curso para otro grupo/ }).click();
    await expect(page.getByText("sus 2 tareas y exámenes")).toBeVisible();
    await page.getByLabel("Grupo").fill("G2");
    await page.getByLabel("Periodo").fill("2027-A");
    await page.getByRole("button", { name: "Duplicar curso" }).click();

    await page.waitForURL(/\/docente\/cursos\/[0-9a-f-]+\/tareas$/);
    const nuevoId = page.url().split("/cursos/")[1].split("/")[0];
    expect(nuevoId).not.toBe(cursoId);
    cursosCreados.push(nuevoId);

    const a = admin();
    const { data: nuevo } = await a.from("cursos").select("*").eq("id", nuevoId).single();
    expect(nuevo).toMatchObject({ grupo: "G2", periodo: "2027-A", porcentaje_tareas: 30, porcentaje_examenes: 60, porcentaje_asistencia: 10, archivado_at: null });
    expect(nuevo!.clave_acceso).not.toBe(claveAcceso);

    const { data: actividades } = await a
      .from("actividades")
      .select("id, titulo, tipo, instrucciones, fecha_cierre, visible_estudiantes, intentos_permitidos, materiales_actividad(storage_path), entregas(id)")
      .eq("curso_id", nuevoId)
      .order("titulo");
    expect(actividades).toHaveLength(2);
    for (const act of actividades!) {
      expect(act.visible_estudiantes).toBe(false);
      expect(new Date(act.fecha_cierre).toISOString()).toBe(cierreViejo);
      expect(act.entregas).toHaveLength(0);
    }
    const [examen, tarea] = actividades!;
    expect(examen.intentos_permitidos).toBe(2);
    const { count: preguntas } = await a.from("preguntas_examen").select("id", { count: "exact", head: true }).eq("actividad_id", examen.id);
    expect(preguntas).toBe(2);

    expect(tarea.instrucciones).toBe("Lee el PDF.");
    expect(tarea.materiales_actividad).toHaveLength(1);
    const ruta = tarea.materiales_actividad[0].storage_path;
    expect(ruta.startsWith(`${nuevoId}/`)).toBe(true);
    const { data: archivo } = await a.storage.from("materiales-actividades").download(ruta);
    expect(archivo).not.toBeNull();

    for (const tabla of ["inscripciones", "anuncios", "sesiones_asistencia"]) {
      const { count } = await a.from(tabla).select("id", { count: "exact", head: true }).eq("curso_id", nuevoId);
      expect(count, tabla).toBe(0);
    }
  });

  test("archivar lo saca de la lista principal y bloquea inscripciones nuevas", async ({ page }) => {
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}`);
    await page.waitForLoadState("networkidle");

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Archivar curso/ }).click();
    await expect(page.getByText(/Curso archivado el/)).toBeVisible();

    await page.goto("/docente");
    const archivados = page.locator("details").filter({ hasText: "Cursos archivados" });
    await expect(archivados.locator("summary")).toBeVisible();
    // Plegado: el curso no se ve hasta abrir la sección.
    await expect(page.getByRole("link", { name: new RegExp(claveAcceso) })).toBeHidden();
    await archivados.locator("summary").click();
    await expect(archivados.getByRole("link", { name: new RegExp(claveAcceso) })).toBeVisible();

    // Un estudiante nuevo ya no puede inscribirse con la clave.
    const nuevo = await crearCuenta("ESTUDIANTE", "duplicar-tarde");
    try {
      const cliente = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      await cliente.auth.signInWithPassword({ email: nuevo.email, password: nuevo.password });
      const { error } = await cliente.rpc("inscribirse_a_curso", { p_clave_acceso: claveAcceso });
      expect(error?.message).toBe("Este curso ya terminó y no admite inscripciones");
    } finally {
      await borrarCuenta(nuevo.id);
    }

    // Desarchivar lo regresa a la lista principal.
    await archivados.getByRole("link", { name: new RegExp(claveAcceso) }).click();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /Desarchivar curso/ }).click();
    await expect(page.getByText(/Curso archivado el/)).toBeHidden();
    await page.goto("/docente");
    await expect(page.getByRole("link", { name: new RegExp(claveAcceso) })).toBeVisible();
  });
});
