"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { crearExamen } from "./actions";
import type { EstadoActividad } from "./actions";

type PreguntaForm = {
  enunciado: string;
  opciones: [string, string, string, string];
  correcta: number;
  puntos: number;
};

function preguntaVacia(): PreguntaForm {
  return { enunciado: "", opciones: ["", "", "", ""], correcta: 0, puntos: 5 };
}

const estadoInicial: EstadoActividad = { error: null };

export default function FormularioCrearExamen({
  cursoId,
}: {
  cursoId: string;
}) {
  const crearExamenDelCurso = crearExamen.bind(null, cursoId);
  const [state, formAction, pending] = useActionState(
    crearExamenDelCurso,
    estadoInicial
  );
  const [preguntas, setPreguntas] = useState<PreguntaForm[]>([
    preguntaVacia(),
  ]);
  const formRef = useRef<HTMLFormElement>(null);
  const primerRender = useRef(true);

  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    if (!pending && state.error === null) {
      formRef.current?.reset();
      setPreguntas([preguntaVacia()]);
    }
  }, [state, pending]);

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

  const preguntasJson = JSON.stringify(
    preguntas.map((p) => ({
      enunciado: p.enunciado,
      opciones: p.opciones,
      correcta: p.opciones[p.correcta],
      puntos: p.puntos,
    }))
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      className="w-full max-w-sm rounded-lg border border-zinc-200 p-6 dark:border-zinc-800"
    >
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Nuevo examen
      </h2>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Título
          <input
            type="text"
            name="titulo"
            required
            className="rounded border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Instrucciones
          <textarea
            name="instrucciones"
            rows={2}
            className="rounded border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Fecha de apertura (opcional)
          <input
            type="datetime-local"
            name="fecha_apertura"
            className="rounded border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Fecha de cierre
          <input
            type="datetime-local"
            name="fecha_cierre"
            required
            className="rounded border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Ponderación
          <input
            type="number"
            name="ponderacion"
            required
            min={0}
            step="any"
            defaultValue={10}
            className="rounded border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <div className="flex flex-col gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Preguntas
          </p>

          {preguntas.map((pregunta, indice) => (
            <div
              key={indice}
              className="flex flex-col gap-2 rounded border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-500">
                  Pregunta {indice + 1}
                </span>
                {preguntas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => quitarPregunta(indice)}
                    className="text-xs text-red-600 hover:underline dark:text-red-400"
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
                className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />

              {pregunta.opciones.map((opcion, opcionIndice) => (
                <label
                  key={opcionIndice}
                  className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                >
                  <input
                    type="radio"
                    name={`correcta-${indice}`}
                    checked={pregunta.correcta === opcionIndice}
                    onChange={() =>
                      actualizarPregunta(indice, { correcta: opcionIndice })
                    }
                  />
                  <input
                    type="text"
                    required
                    placeholder={`Opción ${opcionIndice + 1}`}
                    value={opcion}
                    onChange={(e) =>
                      actualizarOpcion(indice, opcionIndice, e.target.value)
                    }
                    className="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                </label>
              ))}
              <span className="text-xs text-zinc-500 dark:text-zinc-500">
                Marca con el radio cuál opción es la correcta.
              </span>

              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
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
                  className="w-20 rounded border border-zinc-300 px-2 py-1 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </label>
            </div>
          ))}

          <button
            type="button"
            onClick={agregarPregunta}
            className="self-start text-sm text-zinc-700 hover:underline dark:text-zinc-300"
          >
            + Agregar pregunta
          </button>
        </div>

        <input type="hidden" name="preguntas" value={preguntasJson} />

        {state.error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {pending ? "Creando…" : "Crear examen"}
        </button>
      </div>
    </form>
  );
}
