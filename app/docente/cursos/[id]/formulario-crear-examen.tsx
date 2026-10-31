"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { crearExamen, editarExamen } from "./actions";
import type { EstadoActividad } from "./actions";
import { fechaParaInput } from "@/lib/actividades";
import {
  MAXIMO_OPCIONES,
  MINIMO_OPCIONES,
  OPCIONES_VERDADERO_FALSO,
  esVerdaderoFalso,
} from "@/lib/preguntas-examen";
import { useToast } from "../../../toast-provider";

// Cómo se ve la pregunta en el formulario. En la base de datos solo hay
// OPCION_MULTIPLE y ABIERTA: Verdadero/Falso es una de opción múltiple con
// OPCIONES_VERDADERO_FALSO (ver lib/preguntas-examen.ts).
type TipoFormulario = "OPCION_MULTIPLE" | "VERDADERO_FALSO" | "ABIERTA";

const TIPOS_FORMULARIO: { valor: TipoFormulario; etiqueta: string }[] = [
  { valor: "OPCION_MULTIPLE", etiqueta: "Opción múltiple" },
  { valor: "VERDADERO_FALSO", etiqueta: "Verdadero/Falso" },
  { valor: "ABIERTA", etiqueta: "Abierta" },
];

type PreguntaForm = {
  enunciado: string;
  tipo: TipoFormulario;
  // Solo las usa OPCION_MULTIPLE; se conservan al cambiar de tipo para no
  // perder lo que el docente ya escribió si se regresa.
  opciones: string[];
  correcta: number;
  puntos: number;
};

function preguntaVacia(): PreguntaForm {
  return { enunciado: "", tipo: "OPCION_MULTIPLE", opciones: ["", "", "", ""], correcta: 0, puntos: 5 };
}

type PreguntaExistente = {
  tipo?: "OPCION_MULTIPLE" | "ABIERTA";
  enunciado: string;
  opciones: string[];
  correcta: string;
  puntos: number;
};

type ExamenExistente = {
  id: string;
  titulo: string;
  instrucciones: string | null;
  fecha_apertura: string | null;
  fecha_cierre: string;
  preguntas: PreguntaExistente[];
  intentosPermitidos?: number;
  ordenAleatorio?: boolean;
};

function preguntasIniciales(examenExistente?: ExamenExistente): PreguntaForm[] {
  if (!examenExistente || examenExistente.preguntas.length === 0) {
    return [preguntaVacia()];
  }
  return examenExistente.preguntas.map((p) => {
    const tipo: TipoFormulario =
      p.tipo === "ABIERTA"
        ? "ABIERTA"
        : esVerdaderoFalso(p.opciones)
          ? "VERDADERO_FALSO"
          : "OPCION_MULTIPLE";
    return {
      enunciado: p.enunciado,
      tipo,
      opciones: tipo === "OPCION_MULTIPLE" ? [...p.opciones] : ["", "", "", ""],
      correcta: Math.max(0, p.opciones.indexOf(p.correcta)),
      puntos: p.puntos,
    };
  });
}

const estadoInicial: EstadoActividad = { error: null };

// Reusado para dos cosas distintas: un examen de verdad (tipo="EXAMEN",
// cuenta para porcentaje_examenes) y un "cuestionario" — misma mecánica de
// preguntas y autocalificación, pero archivado como tarea (tipo="TAREA",
// cuenta para porcentaje_tareas). editarExamen no necesita saber cuál es
// (nunca toca actividades.tipo, ese valor no cambia después de creado),
// así que solo crearExamen recibe el tipo — la edición funciona igual
// para ambos sin tocar nada aquí.
export default function FormularioCrearExamen({
  cursoId,
  tipo = "EXAMEN",
  examenExistente,
  tieneRespuestas = false,
  onCancelar,
}: {
  cursoId: string;
  tipo?: "TAREA" | "EXAMEN";
  examenExistente?: ExamenExistente;
  tieneRespuestas?: boolean;
  onCancelar?: () => void;
}) {
  const { mostrar } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [preguntas, setPreguntas] = useState<PreguntaForm[]>(
    preguntasIniciales(examenExistente)
  );
  const formRef = useRef<HTMLFormElement>(null);
  const editando = Boolean(examenExistente);
  const etiqueta = tipo === "TAREA" ? "cuestionario" : "examen";

  async function guardarConAviso(
    prevState: EstadoActividad,
    formData: FormData
  ): Promise<EstadoActividad> {
    const resultado = examenExistente
      ? await editarExamen(cursoId, examenExistente.id, prevState, formData)
      : await crearExamen(cursoId, tipo, prevState, formData);

    if (!resultado.error) {
      formRef.current?.reset();
      if (editando) {
        onCancelar?.();
        mostrar(`${etiqueta === "cuestionario" ? "Cuestionario" : "Examen"} actualizado.`);
      } else {
        setPreguntas([preguntaVacia()]);
        setAbierto(false);
        mostrar(`${etiqueta === "cuestionario" ? "Cuestionario" : "Examen"} creado.`);
      }
    }
    return resultado;
  }

  const [state, formAction, pending] = useActionState(
    guardarConAviso,
    estadoInicial
  );

  function actualizarPregunta(indice: number, cambios: Partial<PreguntaForm>) {
    setPreguntas((actual) =>
      actual.map((p, i) => (i === indice ? { ...p, ...cambios } : p))
    );
  }

  function actualizarOpcion(indice: number, opcionIndice: number, valor: string) {
    setPreguntas((actual) =>
      actual.map((p, i) => {
        if (i !== indice) return p;
        const opciones = [...p.opciones];
        opciones[opcionIndice] = valor;
        return { ...p, opciones };
      })
    );
  }

  function agregarOpcion(indice: number) {
    setPreguntas((actual) =>
      actual.map((p, i) => (i === indice ? { ...p, opciones: [...p.opciones, ""] } : p))
    );
  }

  function quitarOpcion(indice: number, opcionIndice: number) {
    setPreguntas((actual) =>
      actual.map((p, i) => {
        if (i !== indice) return p;
        // La correcta se guarda por posición: si se quita una de arriba, se
        // recorre para seguir apuntando a la misma opción.
        let correcta = p.correcta;
        if (opcionIndice < correcta) correcta -= 1;
        else if (opcionIndice === correcta) correcta = 0;
        return { ...p, opciones: p.opciones.filter((_, j) => j !== opcionIndice), correcta };
      })
    );
  }

  function cambiarTipoPregunta(indice: number, tipo: TipoFormulario) {
    // correcta vuelve a 0 porque las posiciones de un tipo no corresponden
    // a las del otro.
    actualizarPregunta(indice, { tipo, correcta: 0 });
  }

  function agregarPregunta() {
    setPreguntas((actual) => [...actual, preguntaVacia()]);
  }

  function quitarPregunta(indice: number) {
    setPreguntas((actual) => actual.filter((_, i) => i !== indice));
  }

  function cancelar() {
    if (editando) {
      onCancelar?.();
    } else {
      setAbierto(false);
    }
  }

  const preguntasJson = JSON.stringify(
    preguntas.map((p) => {
      if (p.tipo === "ABIERTA") {
        return { tipo: "ABIERTA", enunciado: p.enunciado, puntos: p.puntos };
      }
      const opciones = p.tipo === "VERDADERO_FALSO" ? OPCIONES_VERDADERO_FALSO : p.opciones;
      return {
        tipo: "OPCION_MULTIPLE",
        enunciado: p.enunciado,
        opciones,
        correcta: opciones[p.correcta],
        puntos: p.puntos,
      };
    })
  );

  if (!editando && !abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="btn-secondary w-full max-w-sm"
      >
        + Nuevo {etiqueta}
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      // onSubmit en vez de action={formAction}: con action, React vacía los
      // campos no controlados (título, fechas, casillas) en cuanto termina el
      // envío, aunque haya fallado la validación — el docente perdía todo lo
      // que no fueran las preguntas. Así el formulario solo se limpia cuando
      // sí se guardó (formRef.current.reset() en guardarConAviso).
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => formAction(datos));
      }}
      className="card w-full max-w-sm p-6"
    >
      <h2 className="font-title text-xl text-verde-bosque">
        {editando ? `Editar ${etiqueta}` : `Nuevo ${etiqueta}`}
      </h2>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Título
          <input
            type="text"
            name="titulo"
            required
            defaultValue={examenExistente?.titulo}
            className="input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Instrucciones
          <textarea
            name="instrucciones"
            rows={2}
            defaultValue={examenExistente?.instrucciones ?? ""}
            className="input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Fecha de apertura (opcional)
          <input
            type="datetime-local"
            name="fecha_apertura"
            defaultValue={fechaParaInput(examenExistente?.fecha_apertura ?? null)}
            className="input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Fecha de cierre
          <input
            type="datetime-local"
            name="fecha_cierre"
            required
            defaultValue={
              examenExistente
                ? fechaParaInput(examenExistente.fecha_cierre)
                : undefined
            }
            className="input"
          />
        </label>

        {editando && tieneRespuestas && (
          <p className="rounded-lg bg-terracota/10 p-3 text-sm text-terracota">
            Este {etiqueta} ya tiene respuestas de estudiantes. Si cambias las
            preguntas, quienes ya presentaron verán una versión distinta a la
            que contestaron.
          </p>
        )}

        {tipo === "EXAMEN" && (
          <label className="flex items-center gap-2 text-sm text-ink/80">
            <input
              type="checkbox"
              name="dos_intentos"
              defaultChecked={(examenExistente?.intentosPermitidos ?? 1) > 1}
              className="accent-verde-bosque"
            />
            Permitir 2 intentos (cuenta el más reciente)
          </label>
        )}

        <label className="flex items-start gap-2 text-sm text-ink/80">
          <input
            type="checkbox"
            name="orden_aleatorio"
            defaultChecked={examenExistente?.ordenAleatorio ?? false}
            className="mt-1 accent-verde-bosque"
          />
          <span>
            Orden aleatorio
            <span className="block text-xs text-ink/70">
              Cada estudiante ve las preguntas y las opciones en distinto orden.
            </span>
          </span>
        </label>

        <div className="flex flex-col gap-3 border-t border-verde-bosque/15 pt-3">
          <p className="text-sm font-medium text-ink/80">Preguntas</p>

          {preguntas.map((pregunta, indice) => (
            <div
              key={indice}
              className="flex flex-col gap-2 rounded-lg border border-verde-bosque/15 bg-crema/40 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink/70">
                  Pregunta {indice + 1}
                </span>
                {preguntas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => quitarPregunta(indice)}
                    className="inline-flex min-h-11 items-center text-xs text-terracota hover:underline"
                  >
                    Quitar
                  </button>
                )}
              </div>

              <input
                type="text"
                required
                placeholder="Enunciado"
                value={pregunta.enunciado}
                onChange={(e) =>
                  actualizarPregunta(indice, { enunciado: e.target.value })
                }
                className="input text-sm"
              />

              <div
                role="group"
                aria-label={`Tipo de la pregunta ${indice + 1}`}
                className="flex flex-wrap gap-1 text-xs"
              >
                {TIPOS_FORMULARIO.map((tipoPregunta) => (
                  <button
                    key={tipoPregunta.valor}
                    type="button"
                    aria-pressed={pregunta.tipo === tipoPregunta.valor}
                    onClick={() => cambiarTipoPregunta(indice, tipoPregunta.valor)}
                    className={`rounded-full border px-3 py-1.5 font-medium transition-colors ${
                      pregunta.tipo === tipoPregunta.valor
                        ? "border-verde-bosque bg-verde-bosque text-crema"
                        : "border-verde-bosque/30 text-verde-bosque hover:bg-verde-bosque/10"
                    }`}
                  >
                    {tipoPregunta.etiqueta}
                  </button>
                ))}
              </div>

              {pregunta.tipo === "ABIERTA" ? (
                <p className="rounded-lg bg-white/60 p-2 text-xs text-ink/70">
                  El estudiante escribe su respuesta y tú la calificas a mano (de 0
                  a los puntos de la pregunta). El examen queda pendiente hasta
                  que la califiques; las de opción múltiple se califican solas.
                </p>
              ) : pregunta.tipo === "VERDADERO_FALSO"
                ? OPCIONES_VERDADERO_FALSO.map((opcion, opcionIndice) => (
                    <label
                      key={opcion}
                      className="flex min-h-9 items-center gap-2 text-sm text-ink/80"
                    >
                      <input
                        type="radio"
                        name={`correcta-${indice}`}
                        checked={pregunta.correcta === opcionIndice}
                        onChange={() => actualizarPregunta(indice, { correcta: opcionIndice })}
                        className="accent-verde-bosque"
                      />
                      {opcion}
                    </label>
                  ))
                : pregunta.opciones.map((opcion, opcionIndice) => (
                    <div key={opcionIndice} className="flex items-center gap-2 text-sm text-ink/80">
                      <input
                        type="radio"
                        name={`correcta-${indice}`}
                        aria-label={`Marcar la opción ${opcionIndice + 1} como correcta`}
                        checked={pregunta.correcta === opcionIndice}
                        onChange={() => actualizarPregunta(indice, { correcta: opcionIndice })}
                        className="accent-verde-bosque"
                      />
                      <input
                        type="text"
                        required
                        placeholder={`Opción ${opcionIndice + 1}`}
                        value={opcion}
                        onChange={(e) => actualizarOpcion(indice, opcionIndice, e.target.value)}
                        className="input flex-1 py-1 text-sm"
                      />
                      {pregunta.opciones.length > MINIMO_OPCIONES && (
                        <button
                          type="button"
                          onClick={() => quitarOpcion(indice, opcionIndice)}
                          aria-label={`Quitar la opción ${opcionIndice + 1}`}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink/70 hover:bg-terracota/10 hover:text-terracota"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}

              {pregunta.tipo === "OPCION_MULTIPLE" && pregunta.opciones.length < MAXIMO_OPCIONES && (
                <button
                  type="button"
                  onClick={() => agregarOpcion(indice)}
                  className="inline-flex min-h-9 items-center self-start text-xs font-medium text-verde-bosque hover:underline"
                >
                  + Agregar opción
                </button>
              )}
              {pregunta.tipo !== "ABIERTA" && (
                <span className="text-xs text-ink/70">
                  Marca con el círculo cuál es la respuesta correcta.
                </span>
              )}

              <label className="flex items-center gap-2 text-sm text-ink/80">
                Puntos
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={pregunta.puntos}
                  onChange={(e) =>
                    actualizarPregunta(indice, {
                      puntos: Number(e.target.value),
                    })
                  }
                  className="input w-20 py-1"
                />
              </label>
            </div>
          ))}

          <button
            type="button"
            onClick={agregarPregunta}
            className="inline-flex min-h-11 items-center self-start text-sm font-medium text-verde-bosque hover:underline"
          >
            + Agregar pregunta
          </button>
        </div>

        <input type="hidden" name="preguntas" value={preguntasJson} />

        {state.error && <p className="text-sm text-terracota">{state.error}</p>}

        <div className="mt-2 flex items-center gap-3">
          <button type="submit" disabled={pending} className="btn-primary">
            {pending
              ? "Guardando…"
              : editando
                ? "Guardar cambios"
                : `Crear ${etiqueta}`}
          </button>
          <button type="button" onClick={cancelar} className="link-muted">
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}
