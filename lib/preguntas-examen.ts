// Reglas de las preguntas de opción múltiple de un examen o cuestionario,
// compartidas por crearExamen y editarExamen (que antes las repetían).

export const MINIMO_OPCIONES = 2;
export const MAXIMO_OPCIONES = 6;

// Verdadero/Falso no es un tipo aparte en la base de datos: es una pregunta
// de opción múltiple con exactamente estas dos opciones. El formulario la
// reconoce por eso al editar.
export const OPCIONES_VERDADERO_FALSO = ["Verdadero", "Falso"];

export function esVerdaderoFalso(opciones: string[]): boolean {
  return (
    opciones.length === 2 &&
    opciones[0] === OPCIONES_VERDADERO_FALSO[0] &&
    opciones[1] === OPCIONES_VERDADERO_FALSO[1]
  );
}

export type PreguntaValidada = {
  enunciado: string;
  opciones: string[];
  correcta: string;
  puntos: number;
};

// Normaliza (trim) y valida lo que manda el formulario. La respuesta
// correcta se guarda y se compara por su texto, así que dos opciones
// iguales en la misma pregunta harían ambigua la calificación: se rechazan.
export function validarPreguntas(
  entrada: unknown
): { preguntas: PreguntaValidada[] } | { error: string } {
  if (!Array.isArray(entrada) || entrada.length === 0) {
    return { error: "Agrega al menos una pregunta." };
  }

  const preguntas: PreguntaValidada[] = entrada.map((p) => ({
    enunciado: String(p?.enunciado ?? "").trim(),
    opciones: (Array.isArray(p?.opciones) ? p.opciones : []).map((o: unknown) =>
      String(o).trim()
    ),
    correcta: String(p?.correcta ?? "").trim(),
    puntos: Number(p?.puntos),
  }));

  for (const [i, p] of preguntas.entries()) {
    const n = i + 1;
    if (!p.enunciado) {
      return { error: `La pregunta ${n} necesita un enunciado.` };
    }
    if (p.opciones.length < MINIMO_OPCIONES || p.opciones.length > MAXIMO_OPCIONES) {
      return {
        error: `La pregunta ${n} necesita entre ${MINIMO_OPCIONES} y ${MAXIMO_OPCIONES} opciones.`,
      };
    }
    if (p.opciones.some((o) => !o)) {
      return { error: `La pregunta ${n} tiene una opción vacía.` };
    }
    if (new Set(p.opciones.map((o) => o.toLowerCase())).size !== p.opciones.length) {
      return { error: `La pregunta ${n} tiene dos opciones iguales.` };
    }
    if (!p.opciones.includes(p.correcta)) {
      return { error: `La pregunta ${n} necesita marcar cuál opción es correcta.` };
    }
    if (!Number.isFinite(p.puntos) || p.puntos <= 0) {
      return { error: `La pregunta ${n} necesita puntos mayores a 0.` };
    }
  }

  return { preguntas };
}

// Barajado determinista: la misma semilla da siempre el mismo orden. Con
// semilla = estudiante + actividad, cada estudiante ve un orden propio que
// no cambia si recarga la página a la mitad del examen (con Math.random()
// se le reacomodaría todo en cada carga).
export function barajar<T>(lista: T[], semilla: string): T[] {
  // Hash FNV-1a de la semilla → estado inicial de un generador mulberry32.
  let h = 2166136261;
  for (let i = 0; i < semilla.length; i++) {
    h ^= semilla.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let estado = h >>> 0;
  const aleatorio = () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// Orden en que un estudiante ve las preguntas (y las opciones de cada una)
// de un examen con orden_aleatorio. Verdadero/Falso se deja siempre en su
// orden natural: barajar dos opciones fijas solo confunde.
export function ordenarParaEstudiante<P extends { id: string; opciones: string[] }>(
  preguntas: P[],
  estudianteId: string,
  actividadId: string
): P[] {
  const base = `${estudianteId}:${actividadId}`;
  return barajar(preguntas, base).map((p) => ({
    ...p,
    opciones: esVerdaderoFalso(p.opciones) ? p.opciones : barajar(p.opciones, `${base}:${p.id}`),
  }));
}
