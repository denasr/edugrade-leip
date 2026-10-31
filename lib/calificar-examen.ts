// Calificación de un examen o cuestionario a partir de sus preguntas y las
// respuestas de una entrega. Una sola fórmula para los dos momentos en que
// se califica:
//  - presentarExamen, al entregar: si todas son de opción múltiple, la nota
//    sale ahí mismo (AUTO_EXAMEN);
//  - calificarRespuestasAbiertas, cuando el docente asigna los puntos de
//    las preguntas abiertas (MANUAL).
//
// Opción múltiple: todos sus puntos si la respuesta coincide con
// `correcta`, cero si no. Abierta: los puntos que dio el docente
// (puntos_otorgados), cero si la dejó sin contestar.

export type TipoPregunta = "OPCION_MULTIPLE" | "ABIERTA";

export type PreguntaParaCalificar = {
  id: string;
  tipo: TipoPregunta;
  correcta: string;
  puntos: number;
};

export type RespuestaParaCalificar = {
  pregunta_id: string;
  respuesta_seleccionada: string | null;
  puntos_otorgados: number | null;
};

export type ResultadoExamen = {
  puntosObtenidos: number;
  puntosTotales: number;
  // Preguntas abiertas contestadas que el docente todavía no califica. Si
  // es > 0, no hay nota todavía.
  abiertasSinCalificar: number;
  // Sobre 10, con 2 decimales; null mientras falten abiertas por calificar.
  nota: number | null;
};

export function calificarExamen(
  preguntas: PreguntaParaCalificar[],
  respuestas: RespuestaParaCalificar[]
): ResultadoExamen {
  const respuestaPorPregunta = new Map(respuestas.map((r) => [r.pregunta_id, r]));
  let puntosTotales = 0;
  let puntosObtenidos = 0;
  let abiertasSinCalificar = 0;

  for (const pregunta of preguntas) {
    const puntos = Number(pregunta.puntos);
    puntosTotales += puntos;
    const respuesta = respuestaPorPregunta.get(pregunta.id);

    if (pregunta.tipo === "ABIERTA") {
      if (!respuesta?.respuesta_seleccionada?.trim()) continue; // sin contestar: 0
      if (respuesta.puntos_otorgados === null) {
        abiertasSinCalificar += 1;
      } else {
        puntosObtenidos += Math.min(Number(respuesta.puntos_otorgados), puntos);
      }
    } else if (respuesta?.respuesta_seleccionada === pregunta.correcta) {
      puntosObtenidos += puntos;
    }
  }

  const nota =
    abiertasSinCalificar > 0
      ? null
      : puntosTotales > 0
        ? Math.round((puntosObtenidos / puntosTotales) * 10 * 100) / 100
        : 0;

  return { puntosObtenidos, puntosTotales, abiertasSinCalificar, nota };
}

export function tienePreguntasAbiertas(preguntas: { tipo: TipoPregunta }[]): boolean {
  return preguntas.some((p) => p.tipo === "ABIERTA");
}

// Largo máximo de una respuesta abierta (la valida presentarExamen).
export const LARGO_MAXIMO_RESPUESTA_ABIERTA = 5000;
