"use client";

import { useActionState, useRef, useState } from "react";
import { crearExamen } from "./actions";
import type { EstadoActividad } from "./actions";
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

const estadoInicial: EstadoActividad = { error: null };

export default function FormularioCrearExamen({
  cursoId,
}: {
  cursoId: string;
}) {
  const { mostrar } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [preguntas, setPreguntas] = useState<PreguntaForm[]>([
    preguntaVacia(),
  ]);
  const formRef = useRef<HTMLFormElement>(null);

  async function crearExamenConAviso(
    prevState: EstadoActividad,
    formData: FormData
  ): Promise<EstadoActividad> {
    const resultado = await crearExamen(cursoId, prevState, formData);
    if (!resultado.error) {
      formRef.current?.reset();
      setPreguntas([preguntaVacia()]);
      setAbierto(false);
      mostrar("Examen creado.");
    }
    return resultado;
  }

  const [state, formAction, pending] = useActionState(
    crearExamenConAviso,
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

  const preguntasJson = JSON.stringify(
    preguntas.map((p) => ({
      enunciado: p.enunciado,
      opciones: p.opciones,
      correcta: p.opciones[p.correcta],
      puntos: p.puntos,
    }))
  );

  if (!abierto) {
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
      <h2 className="font-title text-xl text-verde-bosque">Nuevo examen</h2>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Título
          <input type="text" name="titulo" required className="input" />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Instrucciones
          <textarea name="instrucciones" rows={2} className="input" />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Fecha de apertura (opcional)
          <input type="datetime-local" name="fecha_apertura" className="input" />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Fecha de cierre
          <input
            type="datetime-local"
            name="fecha_cierre"
            required
            className="input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Ponderación
          <input
            type="number"
            name="ponderacion"
            required
            min={0}
            step="any"
            defaultValue={10}
            className="input"
          />
        </label>

        <div className="flex flex-col gap-3 border-t border-verde-bosque/15 pt-3">
          <p className="text-sm font-medium text-ink/80">Preguntas</p>

          {preguntas.map((pregunta, indice) => (
            <div
              key={indice}
              className="flex flex-col gap-2 rounded-lg border border-verde-bosque/15 bg-crema/40 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink/50">
                  Pregunta {indice + 1}
                </span>
                {preguntas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => quitarPregunta(indice)}
                    className="text-xs text-terracota hover:underline"
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
              <span className="text-xs text-ink/50">
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
            className="self-start text-sm font-medium text-verde-bosque hover:underline"
          >
            + Agregar pregunta
          </button>
        </div>

        <input type="hidden" name="preguntas" value={preguntasJson} />

        {state.error && <p className="text-sm text-terracota">{state.error}</p>}

        <div className="mt-2 flex items-center gap-3">
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Creando…" : "Crear examen"}
          </button>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="link-muted"
          >
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}
