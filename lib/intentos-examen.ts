import { createAdminClient } from "@/lib/supabase/admin";
import {
  calificarExamen,
  LARGO_MAXIMO_RESPUESTA_ABIERTA,
  type PreguntaParaCalificar,
} from "@/lib/calificar-examen";

type AdminClient = ReturnType<typeof createAdminClient>;

// Exámenes y cuestionarios con límite de tiempo (actividades.limite_minutos,
// migración 20261101150000). Cada intento vive en intentos_examen desde que
// el estudiante presiona "Comenzar": ahí quedan su hora de vencimiento y el
// avance que va guardando (borrador). Un intento con límite SIEMPRE se
// entrega por finalizarIntento — sea porque el estudiante presionó "Enviar",
// porque su reloj llegó a cero, o porque se le cerró la página y el intento
// venció sin que regresara (finalizarIntentosVencidos, que se corre al
// abrir las pantallas que muestran calificaciones de ese examen).

// Margen después del vencimiento para lo que ya venía en camino (el envío
// automático al llegar a cero, una conexión lenta). Pasado este margen ya
// no se acepta nada nuevo: se entrega solo el último avance guardado.
export const GRACIA_MS = 2 * 60 * 1000;

export type IntentoExamen = {
  id: string;
  actividad_id: string;
  estudiante_id: string;
  intento: number;
  iniciado_at: string;
  vence_at: string;
  borrador: Record<string, string>;
  finalizado_at: string | null;
  entrega_id: string | null;
};

// Lo que necesita el navegador de un intento en curso para mostrar el reloj
// y reponer el avance guardado.
export type IntentoActivo = {
  id: string;
  venceAt: string;
  borrador: Record<string, string>;
};

export const COLUMNAS_INTENTO =
  "id, actividad_id, estudiante_id, intento, iniciado_at, vence_at, borrador, finalizado_at, entrega_id";

export function dentroDelTiempo(venceAt: string, ahora: number = Date.now()): boolean {
  return ahora <= new Date(venceAt).getTime() + GRACIA_MS;
}

// Deja solo respuestas válidas: preguntas de este examen, texto no vacío y
// dentro del largo máximo. El borrador lo manda el navegador, así que no se
// confía en su forma.
export function limpiarRespuestas(
  entrada: unknown,
  preguntaIds: Set<string>
): Record<string, string> {
  const limpias: Record<string, string> = {};
  if (!entrada || typeof entrada !== "object") return limpias;
  for (const [preguntaId, valor] of Object.entries(entrada as Record<string, unknown>)) {
    if (!preguntaIds.has(preguntaId) || typeof valor !== "string") continue;
    const texto = valor.trim();
    if (texto && texto.length <= LARGO_MAXIMO_RESPUESTA_ABIERTA) limpias[preguntaId] = texto;
  }
  return limpias;
}

// Convierte un intento en entrega: crea la fila de `entregas`, guarda las
// respuestas y, si no hay preguntas abiertas por calificar, la evaluación.
// Con la secret key porque puede correr después del cierre del examen (un
// intento que venció) o sin sesión del estudiante (lo dispara el docente al
// abrir sus pantallas). Quien la llama ya verificó el intento.
//
// Primero "reclama" el intento (finalizado_at) con un update condicional:
// si dos pantallas intentan cerrar el mismo intento a la vez, solo una crea
// la entrega.
export async function finalizarIntento(
  admin: AdminClient,
  intento: IntentoExamen,
  respuestasEnviadas?: Record<string, string>
): Promise<{ error: string | null; pendiente?: boolean }> {
  const { data: reclamado } = await admin
    .from("intentos_examen")
    .update({ finalizado_at: new Date().toISOString() })
    .eq("id", intento.id)
    .is("finalizado_at", null)
    .select("id");

  if (!reclamado || reclamado.length === 0) {
    return { error: "Este intento ya se había entregado." };
  }

  const { data: actividad } = await admin
    .from("actividades")
    .select("curso_id")
    .eq("id", intento.actividad_id)
    .single();

  // Si al estudiante ya lo dieron de baja del curso, no se le crea nada.
  const { data: inscripcion } = actividad
    ? await admin
        .from("inscripciones")
        .select("id")
        .eq("curso_id", actividad.curso_id)
        .eq("estudiante_id", intento.estudiante_id)
        .maybeSingle()
    : { data: null };
  if (!inscripcion) return { error: "Ya no estás inscrito en este curso." };

  const { data: preguntas } = (await admin
    .from("preguntas_examen")
    .select("id, tipo, correcta, puntos")
    .eq("actividad_id", intento.actividad_id)) as { data: PreguntaParaCalificar[] | null };

  const ids = new Set((preguntas ?? []).map((p) => p.id));
  const respuestas = limpiarRespuestas(respuestasEnviadas ?? intento.borrador, ids);

  const { data: entrega, error: errorEntrega } = await admin
    .from("entregas")
    .insert({ actividad_id: intento.actividad_id, estudiante_id: intento.estudiante_id })
    .select("id")
    .single();

  if (errorEntrega || !entrega) {
    console.error("No se pudo crear la entrega de un intento con tiempo:", errorEntrega);
    return { error: errorEntrega?.message ?? "No se pudo registrar tu examen." };
  }

  const filas = Object.entries(respuestas).map(([pregunta_id, respuesta_seleccionada]) => ({
    entrega_id: entrega.id,
    pregunta_id,
    respuesta_seleccionada,
  }));
  if (filas.length > 0) {
    const { error } = await admin.from("respuestas_examen").insert(filas);
    if (error) {
      console.error("No se pudieron guardar las respuestas de un intento con tiempo:", error);
      return { error: "Tu examen se registró, pero no se guardaron tus respuestas. Avísale a tu docente." };
    }
  }

  await admin.from("intentos_examen").update({ entrega_id: entrega.id }).eq("id", intento.id);

  const { nota } = calificarExamen(
    preguntas ?? [],
    filas.map((f) => ({ ...f, puntos_otorgados: null }))
  );
  if (nota === null) return { error: null, pendiente: true };

  const { error: errorEvaluacion } = await admin.from("evaluaciones").insert({
    entrega_id: entrega.id,
    calificacion_final: nota,
    origen: "AUTO_EXAMEN",
  });
  if (errorEvaluacion) {
    return {
      error: "Tu examen se registró, pero no se pudo calificar automáticamente. Avísale a tu docente.",
    };
  }
  return { error: null };
}

// Entrega los intentos que vencieron sin que el estudiante los enviara (se
// le cerró la página, se quedó sin batería...) con el último avance que
// alcanzó a guardar. No hay un proceso que corra cada minuto: se llama al
// abrir las pantallas donde importa (el curso del estudiante, su reporte,
// las pestañas Tareas y Exámenes, las respuestas escritas y el libro de
// calificaciones del docente), así que la entrega existe siempre antes de
// que alguien vea una calificación.
export async function finalizarIntentosVencidos(
  admin: AdminClient,
  filtro: { actividadIds?: string[]; estudianteId?: string }
): Promise<void> {
  if (filtro.actividadIds && filtro.actividadIds.length === 0) return;

  let consulta = admin
    .from("intentos_examen")
    .select(COLUMNAS_INTENTO)
    .is("finalizado_at", null)
    .lt("vence_at", new Date(Date.now() - GRACIA_MS).toISOString());
  if (filtro.actividadIds) consulta = consulta.in("actividad_id", filtro.actividadIds);
  if (filtro.estudianteId) consulta = consulta.eq("estudiante_id", filtro.estudianteId);

  const { data: vencidos, error } = await consulta;
  if (error) {
    console.error("No se pudieron leer los intentos vencidos:", error);
    return;
  }
  for (const intento of (vencidos ?? []) as IntentoExamen[]) {
    const resultado = await finalizarIntento(admin, intento);
    if (resultado.error) console.error("Intento vencido sin finalizar:", intento.id, resultado.error);
  }
}
