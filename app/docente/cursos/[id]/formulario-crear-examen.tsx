"use client";

import { useActionState, useRef, useState } from "react";
import { crearExamen, editarExamen } from "./actions";
import type { EstadoActividad } from "./actions";
import { fechaParaInput } from "@/lib/actividades";
import { useToast } from "../../../toast-provider";

type PreguntaForm = {
  enunciado: string;
  opciones: [string, string, string, string];
  correcta: number;
  puntos: number;
};

function preguntaVacia(): PreguntaForm {
  return { enunciado: "", opciones: ["", "", "", ""], correcta: 0, puntos: 5 };
}

type PreguntaExistente = {
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
};

function preguntasIniciales(examenExistente?: ExamenExistente): PreguntaForm[] {
  if (!examenExistente || examenExistente.preguntas.length === 0) {
    return [preguntaVacia()];
  }
  return examenExistente.preguntas.map((p) => ({
    enunciado: p.enunciado,
    opciones: [p.opciones[0] ?? "", p.opciones[1] ?? "", p.opciones[2] ?? "", p.opciones[3] ?? ""],
    correcta: Math.max(0, p.opciones.indexOf(p.correcta)),
    puntos: p.puntos,
  }));
}

const estadoInicial: EstadoActividad = { error: null };

export default function FormularioCrearExamen({
  cursoId,
  examenExistente,
  tieneRespuestas = false,
  onCancelar,
}: {
  cursoId: string;
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

  async function guardarConAviso(
    prevState: EstadoActividad,
    formData: FormData
  ): Promise<EstadoActividad> {
    const resultado = examenExistente
      ? await editarExamen(cursoId, examenExistente.id, prevState, formData)
      : await crearExamen(cursoId, prevState, formData);

    if (!resultado.error) {
      formRef.current?.reset();
      if (editando) {
        onCancelar?.();
        mostrar("Examen actualizado.");
      } else {
        setPreguntas([preguntaVacia()]);
        setAbierto(false);
        mostrar("Examen creado.");
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
        const opciones = [...p.opciones] as PreguntaForm["opciones"];
        opciones[opcionIndice] = valor;
        return { ...p, opciones };
      })
    );
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
    preguntas.map((p) => ({
      enunciado: p.enunciado,
      opciones: p.opciones,
      correcta: p.opciones[p.correcta],
      puntos: p.puntos,
    }))
  );

  if (!editando && !abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="btn-primary w-full max-w-sm"
      >
        + Nuevo examen
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="card w-full max-w-sm p-6">
      <h2 className="font-title text-xl text-verde-bosque">
        {editando ? "Editar examen" : "Nuevo examen"}
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
            Este examen ya tiene respuestas de estudiantes. Si cambias las
            preguntas, quienes ya presentaron verán una versión distinta a la
            que contestaron.
          </p>
        )}

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

              {pregunta.opciones.map((opcion, opcionIndice) => (
                <label
                  key={opcionIndice}
                  className="flex items-center gap-2 text-sm text-ink/80"
                >
                  <input
                    type="radio"
                    name={`correcta-${indice}`}
                    checked={pregunta.correcta === opcionIndice}
                    onChange={() =>
                      actualizarPregunta(indice, { correcta: opcionIndice })
                    }
                    className="accent-verde-bosque"
                  />
                  <input
                    type="text"
                    required
                    placeholder={`Opción ${opcionIndice + 1}`}
                    value={opcion}
                    onChange={(e) =>
                      actualizarOpcion(indice, opcionIndice, e.target.value)
                    }
                    className="input flex-1 py-1 text-sm"
                  />
                </label>
              ))}
              <span className="text-xs text-ink/70">
                Marca con el radio cuál opción es la correcta.
              </span>

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
                : "Crear examen"}
          </button>
          <button type="button" onClick={cancelar} className="link-muted">
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}
