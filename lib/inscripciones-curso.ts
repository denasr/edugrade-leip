import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Cerrar / abrir inscripciones de un curso (cursos.inscripciones_cerradas,
// migración 20261127120000). La regla que de verdad impide inscribirse vive
// en el RPC inscribirse_a_curso; esto es solo lo que comparte la app.

export const CONFIRMAR_CERRAR_INSCRIPCIONES =
  "Nadie nuevo podrá inscribirse a este curso, aunque conozca la clave de acceso. Los estudiantes ya inscritos no se ven afectados, y puedes volver a abrir las inscripciones cuando quieras. ¿Continuar?";

export const MENSAJE_FALTA_MIGRACION =
  "Esta función todavía no está activada en la base de datos (falta aplicar la migración de inscripciones cerradas).";

type ErrorPostgrest = { code?: string | null; message?: string | null } | null | undefined;

// Error de PostgREST cuando la columna inscripciones_cerradas no existe
// todavía (la migración no se ha aplicado): 42703 al leerla en un select,
// PGRST204 al escribirla en un update.
export function esColumnaInscripcionesFaltante(error: ErrorPostgrest): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") {
    return (error.message ?? "").includes("inscripciones_cerradas");
  }
  return false;
}

// Lee inscripciones_cerradas aparte del select principal de cada página a
// propósito: si la página la pidiera junto con el resto y la migración aún
// no estuviera aplicada, la consulta entera fallaría y el docente no podría
// abrir su curso. Así, sin la columna, todo se ve como "abiertas" y solo el
// botón avisa que falta la migración. Devuelve los ids con inscripciones
// cerradas.
export async function leerCursosConInscripcionesCerradas(
  supabase: SupabaseServerClient,
  cursoIds: string[]
): Promise<Set<string>> {
  if (cursoIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("cursos")
    .select("id, inscripciones_cerradas")
    .in("id", cursoIds);
  if (error) {
    if (!esColumnaInscripcionesFaltante(error)) {
      console.error("No se pudo leer inscripciones_cerradas:", error);
    }
    return new Set();
  }
  return new Set((data ?? []).filter((c) => c.inscripciones_cerradas === true).map((c) => c.id as string));
}
