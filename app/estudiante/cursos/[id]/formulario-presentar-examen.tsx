"use client";

import { useActionState } from "react";
import { presentarExamen, type EstadoExamen } from "./actions";
import { useToast } from "../../../toast-provider";

type Pregunta = {
  id: string;
  enunciado: string;
  opciones: string[];
  puntos: number;
};

const estadoInicial: EstadoExamen = { error: null };

export default function FormularioPresentarExamen({
  actividadId,
  cursoId,
  preguntas,
}: {
  actividadId: string;
  cursoId: string;
  preguntas: Pregunta[];
}) {
  const { mostrar } = useToast();

  async function presentarConAviso(
    prevState: EstadoExamen,
    formData: FormData
  ): Promise<EstadoExamen> {
    const resultado = await presentarExamen(
      actividadId,
      cursoId,
      prevState,
      formData
    );
    if (!resultado.error) {
      mostrar("Examen enviado.");
    }
    return resultado;
  }

  const [state, formAction, pending] = useActionState(
    presentarConAviso,
    estadoInicial
  );

  return (
    <form
      action={formAction}
      className="mt-3 flex flex-col gap-4 border-t border-verde-bosque/15 pt-3"
    >
      {preguntas.map((pregunta, indice) => (
        <fieldset key={pregunta.id} className="flex flex-col gap-1">
          <legend className="text-sm text-ink/80">
            {indice + 1}. {pregunta.enunciado}
          </legend>
          {pregunta.opciones.map((opcion, opcionIndice) => (
            <label
              key={opcionIndice}
              className="flex items-center gap-2 text-sm text-ink/70"
            >
              <input
                type="radio"
                name={`respuesta-${pregunta.id}`}
                value={opcion}
                required
                className="accent-verde-bosque"
              />
              {opcion}
            </label>
          ))}
        </fieldset>
      ))}

      {state.error && <p className="text-sm text-terracota">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary self-start"
      >
        {pending ? "Enviando…" : "Enviar examen"}
      </button>
    </form>
  );
}
