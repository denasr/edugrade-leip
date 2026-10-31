"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { guardarAvanceExamen, presentarExamen, type EstadoExamen } from "./actions";
import { LARGO_MAXIMO_RESPUESTA_ABIERTA } from "@/lib/calificar-examen";
import type { IntentoActivo } from "@/lib/intentos-examen";
import { useToast } from "../../../toast-provider";

type Pregunta = {
  id: string;
  tipo: "OPCION_MULTIPLE" | "ABIERTA";
  enunciado: string;
  opciones: string[];
  puntos: number;
};

const estadoInicial: EstadoExamen = { error: null };

// Umbral en px para distinguir un deslizar horizontal real del scroll
// vertical normal de la página — si el movimiento vertical es mayor, se
// ignora (la persona solo estaba haciendo scroll).
const UMBRAL_DESLIZAR = 50;

// Cuánto esperar después del último cambio para guardar el avance de un
// examen con tiempo: suficiente para no mandar una petición por cada letra.
const ESPERA_GUARDADO_MS = 1500;

function formatoReloj(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function FormularioPresentarExamen({
  actividadId,
  cursoId,
  preguntas,
  etiquetaIntento,
  intento,
  ahoraServidor,
}: {
  actividadId: string;
  cursoId: string;
  preguntas: Pregunta[];
  etiquetaIntento?: string;
  // Solo en exámenes con límite de tiempo: el intento en curso (con su
  // avance guardado) y la hora del servidor al cargar la página, para que
  // el reloj no dependa de si la hora del teléfono está bien.
  intento?: IntentoActivo;
  ahoraServidor?: string;
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
  const [respuestas, setRespuestas] = useState<Record<string, string>>(
    intento?.borrador ?? {}
  );
  const inicioToque = useRef<{ x: number; y: number } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // ---- Límite de tiempo ----
  const [segundosRestantes, setSegundosRestantes] = useState<number | null>(null);
  const [estadoGuardado, setEstadoGuardado] = useState<"" | "guardando" | "guardado" | "error">("");
  // Envío automático al llegar a cero: se salta la validación de "responde
  // todas" (se entrega lo que haya).
  const tiempoAgotado = useRef(false);
  const primeraCarga = useRef(true);

  useEffect(() => {
    if (!intento || !ahoraServidor) return;
    // Diferencia entre el reloj del teléfono y el del servidor, medida una
    // vez al cargar.
    const desfase = new Date(ahoraServidor).getTime() - Date.now();
    const vence = new Date(intento.venceAt).getTime();
    const actualizar = () => {
      const restante = Math.max(0, Math.ceil((vence - (Date.now() + desfase)) / 1000));
      setSegundosRestantes(restante);
      if (restante === 0 && !tiempoAgotado.current) {
        tiempoAgotado.current = true;
        formRef.current?.requestSubmit();
      }
    };
    const primero = setTimeout(actualizar, 0);
    const reloj = setInterval(actualizar, 1000);
    return () => {
      clearTimeout(primero);
      clearInterval(reloj);
    };
  }, [intento, ahoraServidor]);

  // Guarda el avance en el servidor un momento después de cada cambio: si
  // se le cierra la página, se entrega con esto al vencer el tiempo.
  useEffect(() => {
    if (!intento) return;
    if (primeraCarga.current) {
      primeraCarga.current = false;
      return;
    }
    const temporizador = setTimeout(async () => {
      setEstadoGuardado("guardando");
      const resultado = await guardarAvanceExamen(intento.id, respuestas);
      setEstadoGuardado(resultado.error ? "error" : "guardado");
    }, ESPERA_GUARDADO_MS);
    return () => clearTimeout(temporizador);
  }, [intento, respuestas]);

  const esPrimera = indice === 0;
  const esUltima = indice === preguntas.length - 1;

  function irA(nuevoIndice: number) {
    setIndice(Math.max(0, Math.min(preguntas.length - 1, nuevoIndice)));
  }

  function marcarRespuesta(preguntaId: string, opcion: string) {
    setRespuestas((actual) => ({ ...actual, [preguntaId]: opcion }));
  }

  function alTocarInicio(e: React.TouchEvent) {
    // Dentro del cuadro de una respuesta abierta, deslizar es seleccionar o
    // mover el cursor en el texto, no cambiar de pregunta.
    if ((e.target as HTMLElement).tagName === "TEXTAREA") {
      inicioToque.current = null;
      return;
    }
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
    const faltante = preguntas.findIndex((p) => !respuestas[p.id]?.trim());
    if (faltante !== -1 && !tiempoAgotado.current) {
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
      mostrar(
        resultado.aviso ??
          (tiempoAgotado.current
            ? "Se acabó el tiempo: tu examen se entregó con lo que contestaste."
            : resultado.pendiente
              ? "Examen enviado. Tu docente calificará tus respuestas escritas."
              : "Examen enviado.")
      );
    }
    return resultado;
  }

  const [state, formAction, pending] = useActionState(
    presentarConAviso,
    estadoInicial
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      className="mt-3 flex flex-col gap-4 border-t border-verde-bosque/15 pt-3"
    >
      {intento && <input type="hidden" name="intento_id" value={intento.id} />}
      {intento && segundosRestantes !== null && (
        <div
          role="timer"
          aria-live="off"
          className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${
            segundosRestantes <= 60 ? "bg-terracota/10 text-terracota" : "bg-verde-bosque/8 text-verde-bosque"
          }`}
        >
          <span>Tiempo restante: {formatoReloj(segundosRestantes)}</span>
          <span className="text-xs font-normal text-ink/70">
            {estadoGuardado === "guardando"
              ? "Guardando…"
              : estadoGuardado === "guardado"
                ? "Avance guardado"
                : estadoGuardado === "error"
                  ? "No se pudo guardar"
                  : ""}
          </span>
        </div>
      )}
      {etiquetaIntento && (
        <p className="text-xs font-medium text-verde-bosque">{etiquetaIntento}</p>
      )}
      <div className="flex items-center justify-between text-xs text-ink/70">
        <span>
          Pregunta {indice + 1} de {preguntas.length}
        </span>
        <span>
          {preguntas.filter((p) => respuestas[p.id]?.trim()).length} de {preguntas.length}{" "}
          respondidas
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
            {pregunta.tipo === "ABIERTA" && (
              <textarea
                name={`respuesta-${pregunta.id}`}
                aria-label={`Tu respuesta a la pregunta ${i + 1}`}
                rows={5}
                maxLength={LARGO_MAXIMO_RESPUESTA_ABIERTA}
                value={respuestas[pregunta.id] ?? ""}
                onChange={(e) => marcarRespuesta(pregunta.id, e.target.value)}
                placeholder="Escribe tu respuesta"
                className="input mt-1 text-sm"
              />
            )}
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
