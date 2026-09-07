"use client";

import { useActionState, useRef, useState } from "react";
import { presentarExamen, type EstadoExamen } from "./actions";
import { useToast } from "../../../toast-provider";

type Pregunta = {
  id: string;
  enunciado: string;
  opciones: string[];
  puntos: number;
};

const estadoInicial: EstadoExamen = { error: null };

// Umbral en px para distinguir un deslizar horizontal real del scroll
// vertical normal de la página — si el movimiento vertical es mayor, se
// ignora (la persona solo estaba haciendo scroll).
const UMBRAL_DESLIZAR = 50;

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
  const [indice, setIndice] = useState(0);
  // Respuestas CONTROLADAS a propósito, no dejadas a la memoria nativa del
  // radio: React resetea los campos no controlados de un <form action={fn}>
  // después de CUALQUIER intento de envío (incluso uno que la propia
  // validación de abajo interceptó antes de llegar al servidor) — sin este
  // estado, saltar de vuelta a una pregunta faltante borraba las respuestas
  // ya marcadas en las demás (confirmado en vivo). Con el radio controlado,
  // React vuelve a aplicar `checked` desde este estado en el siguiente
  // render sin importar ese reseteo interno.
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const inicioToque = useRef<{ x: number; y: number } | null>(null);

  const esPrimera = indice === 0;
  const esUltima = indice === preguntas.length - 1;

  function irA(nuevoIndice: number) {
    setIndice(Math.max(0, Math.min(preguntas.length - 1, nuevoIndice)));
  }

  function marcarRespuesta(preguntaId: string, opcion: string) {
    setRespuestas((actual) => ({ ...actual, [preguntaId]: opcion }));
  }

  function alTocarInicio(e: React.TouchEvent) {
    const t = e.touches[0];
    inicioToque.current = { x: t.clientX, y: t.clientY };
  }

  function alTocarFin(e: React.TouchEvent) {
    if (!inicioToque.current) return;
    const t = e.changedTouches[0];
    const deltaX = t.clientX - inicioToque.current.x;
    const deltaY = t.clientY - inicioToque.current.y;
    inicioToque.current = null;

    if (Math.abs(deltaX) < UMBRAL_DESLIZAR || Math.abs(deltaX) < Math.abs(deltaY)) {
      return; // fue scroll vertical o un toque corto (ej. tocar una opción), no un swipe
    }
    // Ya se confirmó que es un swipe real: se previene el click de
    // compatibilidad que el navegador sintetiza después de un touchend sin
    // preventDefault (si no, podría activar por accidente lo que haya
    // debajo del dedo al soltar). No se llama arriba, en el toque corto,
    // para no interferir con el tap normal de marcar una opción.
    e.preventDefault();
    if (deltaX < 0 && !esUltima) irA(indice + 1);
    else if (deltaX > 0 && !esPrimera) irA(indice - 1);
  }

  async function presentarConAviso(
    prevState: EstadoExamen,
    formData: FormData
  ): Promise<EstadoExamen> {
    // Sin `required` nativo en los radios (con fieldsets ocultos, el
    // navegador intentaría enfocar un campo invisible al validar — se ve
    // roto). En su lugar se valida aquí contra el estado controlado (no
    // contra formData): si falta alguna, se salta directo a la primera sin
    // responder en vez de llamar al servidor.
    const faltante = preguntas.findIndex((p) => !respuestas[p.id]);
    if (faltante !== -1) {
      irA(faltante);
      return { error: `Responde la pregunta ${faltante + 1} antes de enviar.` };
    }

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
      <div className="flex items-center justify-between text-xs text-ink/70">
        <span>
          Pregunta {indice + 1} de {preguntas.length}
        </span>
        <span>
          {Object.keys(respuestas).length} de {preguntas.length} respondidas
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-verde-bosque/10">
        <div
          className="h-full rounded-full bg-verde-bosque transition-all"
          style={{ width: `${((indice + 1) / preguntas.length) * 100}%` }}
        />
      </div>

      <div onTouchStart={alTocarInicio} onTouchEnd={alTocarFin}>
        {preguntas.map((pregunta, i) => (
          <fieldset
            key={pregunta.id}
            hidden={i !== indice}
            className="flex flex-col gap-1"
          >
            <legend className="text-sm text-ink/80">
              {i + 1}. {pregunta.enunciado}
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
                  checked={respuestas[pregunta.id] === opcion}
                  onChange={() => marcarRespuesta(pregunta.id, opcion)}
                  className="accent-verde-bosque"
                />
                {opcion}
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      {state.error && <p className="text-sm text-terracota">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => irA(indice - 1)}
          disabled={esPrimera}
          className="btn-secondary disabled:opacity-40"
        >
          ← Anterior
        </button>
        {esUltima ? (
          // `key` distinto a propósito: sin esto, React reutiliza el mismo
          // <button> del DOM y solo le cambia `type` de "button" a
          // "submit" — como esa mutación ocurre como efecto del propio
          // clic en "Siguiente" que la disparó, el navegador termina
          // procesando ese mismo clic como un envío real del formulario
          // (confirmado en vivo). Con key distinto, React monta un botón
          // nuevo en vez de mutar el que acaba de recibir el clic.
          <button
            key="enviar"
            type="submit"
            disabled={pending}
            className="btn-primary"
          >
            {pending ? "Enviando…" : "Enviar examen"}
          </button>
        ) : (
          <button
            key="siguiente"
            type="button"
            onClick={() => irA(indice + 1)}
            className="btn-primary"
          >
            Siguiente →
          </button>
        )}
      </div>
    </form>
  );
}
