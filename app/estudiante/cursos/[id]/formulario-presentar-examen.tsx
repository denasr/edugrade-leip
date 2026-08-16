"use client";

import { useActionState } from "react";
import { presentarExamen, type EstadoExamen } from "./actions";

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
  const presentarEsteExamen = presentarExamen.bind(null, actividadId, cursoId);
  const [state, formAction, pending] = useActionState(
    presentarEsteExamen,
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
