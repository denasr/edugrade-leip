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
      className="mt-3 flex flex-col gap-4 border-t border-zinc-200 pt-3 dark:border-zinc-800"
    >
      {preguntas.map((pregunta, indice) => (
        <fieldset key={pregunta.id} className="flex flex-col gap-1">
          <legend className="text-sm text-zinc-700 dark:text-zinc-300">
            {indice + 1}. {pregunta.enunciado}
          </legend>
          {pregunta.opciones.map((opcion, opcionIndice) => (
            <label
              key={opcionIndice}
              className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"
            >
              <input
                type="radio"
                name={`respuesta-${pregunta.id}`}
                value={opcion}
                required
              />
              {opcion}
            </label>
          ))}
        </fieldset>
      ))}

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {pending ? "Enviando…" : "Enviar examen"}
      </button>
    </form>
  );
}
