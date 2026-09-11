import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

// Bypassa RLS, igual que lib/supabase/admin.ts en la app — aquí se usa para
// crear/borrar las cuentas y el curso desechables de cada prueba
// directamente, sin pasar por /registro (que además requeriría confirmar
// correo si "Confirm email" se reactivara alguna vez).
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY (revisa .env.local). Estas pruebas corren contra el proyecto real de Supabase — no hay uno de staging."
    );
  }
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const PASSWORD_PRUEBA = "PruebaE2E123!";

function correoPrueba(etiqueta: string) {
  return `edugrade.e2e.${etiqueta}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@gmail.com`;
}

export type CuentaPrueba = { id: string; email: string; password: string };

// handle_new_user (migración inicial) crea la fila en `perfiles` a partir de
// raw_user_meta_data en cuanto se crea el usuario en auth.users — no hace
// falta insertarla aparte.
export async function crearCuenta(
  rol: "DOCENTE" | "ESTUDIANTE",
  etiqueta: string
): Promise<CuentaPrueba> {
  const email = correoPrueba(etiqueta);
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD_PRUEBA,
    email_confirm: true,
    user_metadata: { rol, nombre_completo: `E2E ${etiqueta}` },
  });
  if (error || !data.user) {
    throw new Error(`No se pudo crear la cuenta de prueba (${etiqueta}): ${error?.message}`);
  }
  return { id: data.user.id, email, password: PASSWORD_PRUEBA };
}

export async function borrarCuenta(id: string) {
  const { error } = await admin().auth.admin.deleteUser(id);
  if (error) console.error(`No se pudo borrar la cuenta de prueba ${id}:`, error.message);
}

export async function crearCurso(
  docenteId: string,
  opciones: {
    porcentajeTareas?: number;
    porcentajeExamenes?: number;
    porcentajeAsistencia?: number;
  } = {}
): Promise<string> {
  const {
    porcentajeTareas = 40,
    porcentajeExamenes = 50,
    porcentajeAsistencia = 10,
  } = opciones;
  const clave = `E2E${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const { data, error } = await admin()
    .from("cursos")
    .insert({
      docente_id: docenteId,
      nombre: "Curso de prueba E2E",
      grupo: "G1",
      periodo: "T-E2E",
      clave_acceso: clave,
      porcentaje_tareas: porcentajeTareas,
      porcentaje_examenes: porcentajeExamenes,
      porcentaje_asistencia: porcentajeAsistencia,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`No se pudo crear el curso de prueba: ${error?.message}`);
  }
  return data.id as string;
}

// Se inserta directo en vez de pasar por el RPC inscribirse_a_curso: esa
// pantalla (clave de acceso) no es parte del alcance v1 de esta suite, que
// se enfoca en entrega/examen/cuestionario/calificación final.
export async function inscribir(cursoId: string, estudianteId: string) {
  const { error } = await admin()
    .from("inscripciones")
    .insert({ curso_id: cursoId, estudiante_id: estudianteId });
  if (error) {
    throw new Error(`No se pudo inscribir al estudiante de prueba: ${error.message}`);
  }
}

// El curso ya tiene on delete cascade hacia actividades → materiales,
// preguntas_examen, entregas → archivos_entrega, respuestas_examen,
// evaluaciones, y hacia sesiones_asistencia → asistencias — un solo delete
// aquí basta. Ningún spec de esta suite v1 sube archivos a Storage salvo el
// de entrega de tarea, que limpia su propio bucket aparte.
export async function borrarCurso(cursoId: string) {
  const { error } = await admin().from("cursos").delete().eq("id", cursoId);
  if (error) console.error(`No se pudo borrar el curso de prueba ${cursoId}:`, error.message);
}

export async function borrarArchivosEntrega(rutas: string[]) {
  if (rutas.length === 0) return;
  const { error } = await admin().storage.from("archivos-entrega").remove(rutas);
  if (error) console.error("No se pudieron borrar archivos de entrega de prueba:", error.message);
}

export async function iniciarSesion(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(docente|estudiante)$/);
}
