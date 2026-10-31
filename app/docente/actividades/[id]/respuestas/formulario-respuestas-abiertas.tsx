"use client";

import { startTransition, useActionState } from "react";
import {
  calificarRespuestasAbiertas,
  type EstadoRespuestasAbiertas,
} from "../actions";
import { useToast } from "../../../../toast-provider";

export type PreguntaParaRevisar = {
  id: string;
  tipo: "OPCION_MULTIPLE" | "ABIERTA";
  enunciado: string;
  correcta: string;
  puntos: number;
  // Lo que contestó el estudiante (texto en una abierta, la opción en una de
  // opción múltiple) y, en una abierta, los puntos que ya se le dieron.
  respuesta: string | null;
  puntosOtorgados: number | null;
};

const estadoInicial: EstadoRespuestasAbiertas = { error: null };

export default function FormularioRespuestasAbiertas({
  actividadId,
  entregaId,
  preguntas,
  comentarioActual,
  calificada,
}: {
  actividadId: string;
  entregaId: string;
  preguntas: PreguntaParaRevisar[];
  comentarioActual: string | null;
  calificada: boolean;
}) {
  const { mostrar } = useToast();

  async function guardarConAviso(
    prevState: EstadoRespuestasAbiertas,
    formData: FormData
  ): Promise<EstadoRespuestasAbiertas> {
    const resultado = await calificarRespuestasAbiertas(actividadId, entregaId, prevState, formData);
    if (!resultado.error) mostrar("Calificación guardada.");
    return resultado;
  }

  const [state, formAction, pending] = useActionState(guardarConAviso, estadoInicial);

  return (
    <form
      // Mismo motivo que FormularioCrearExamen: con action={formAction} React
      // vaciaría los puntos ya escritos si la validación falla.
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => formAction(datos));
      }}
      className="mt-3 flex flex-col gap-4 border-t border-verde-bosque/15 pt-3"
    >
      {preguntas.map((pregunta, i) => (
        <div key={pregunta.id} className="flex flex-col gap-1 text-sm">
          <p className="font-medium text-ink">
            {i + 1}. {pregunta.enunciado}
          </p>

          {pregunta.tipo === "ABIERTA" ? (
            <>
              <p className="whitespace-pre-wrap rounded-lg bg-crema px-3 py-2 text-ink/80">
                {pregunta.respuesta?.trim() || "(sin contestar — vale 0)"}
              </p>
              {pregunta.respuesta?.trim() && (
                <label className="flex items-center gap-2 text-ink/80">
                  Puntos
                  <input
                    type="number"
                    name={`puntos-${pregunta.id}`}
                    required
                    min={0}
                    max={pregunta.puntos}
                    step="any"
                    defaultValue={pregunta.puntosOtorgados ?? undefined}
                    aria-label={`Puntos de la pregunta ${i + 1}`}
                    className="input w-20 py-1"
                  />
                  <span className="text-ink/70">de {pregunta.puntos}</span>
                </label>
              )}
            </>
          ) : (
            <p
              className={`text-xs ${
                pregunta.respuesta === pregunta.correcta ? "text-calificado" : "text-terracota"
              }`}
            >
              {pregunta.respuesta === pregunta.correcta ? "✓ Correcta" : "✗ Incorrecta"} ·
              contestó &quot;{pregunta.respuesta ?? "—"}&quot; · {" "}
              {pregunta.respuesta === pregunta.correcta ? pregunta.puntos : 0} de{" "}
              {pregunta.puntos} puntos (automático)
            </p>
          )}
        </div>
      ))}

      <label className="flex flex-col gap-1 text-sm text-ink/80">
        Retroalimentación (opcional)
        <textarea
          name="retroalimentacion"
          rows={2}
          defaultValue={comentarioActual ?? ""}
          className="input"
        />
      </label>

      {state.error && <p className="text-sm text-terracota">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn-primary self-start">
        {pending ? "Guardando…" : calificada ? "Actualizar calificación" : "Guardar calificación"}
      </button>
    </form>
  );
}
