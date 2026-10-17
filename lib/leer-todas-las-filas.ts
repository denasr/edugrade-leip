// Supabase (PostgREST) devuelve como máximo 1000 filas por consulta, sin
// error ni aviso: el resto simplemente no llega. Las consultas que leen
// algo de un curso completo crecen con el semestre — p. ej. `asistencias`
// es ~1 fila por estudiante por sesión, así que un grupo de 32 pasa de 1000
// filas hacia la sesión 31 — y a partir de ahí el libro de calificaciones
// calcularía el % de asistencia (y la nota final) con datos incompletos.
//
// `pagina` recibe el rango a pedir y debe devolver la consulta con
// `.range(desde, hasta)` aplicado y un orden estable y único (p. ej.
// `.order("id")` como desempate); sin orden único, PostgREST no garantiza
// que las páginas no se traslapen o se salten filas.
//
// Un error lanza en vez de devolver lo leído hasta ese punto: una
// calificación calculada con datos a medias, en silencio, es peor que la
// página de error (que además queda registrada en Sentry vía error.tsx).
const TAMANO_PAGINA = 1000;

export async function leerTodasLasFilas<T>(
  pagina: (
    desde: number,
    hasta: number
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await pagina(desde, desde + TAMANO_PAGINA - 1);
    if (error) {
      throw new Error(`No se pudieron leer todas las filas: ${error.message}`);
    }
    filas.push(...((data ?? []) as T[]));
    if (!data || data.length < TAMANO_PAGINA) return filas;
  }
}
