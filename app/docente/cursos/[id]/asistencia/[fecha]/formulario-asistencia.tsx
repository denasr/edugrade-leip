"use client";

import { useActionState } from "react";
import { Check, Triangle, X } from "lucide-react";
import { guardarAsistencia, type EstadoAsistencia } from "./actions";
import { useToast } from "@/app/toast-provider";

type Estudiante = {
  id: string;
  nombre_completo: string;
  estado: string;
};

const estadoInicial: EstadoAsistencia = { error: null };

// Radio nativo real, oculto visualmente (appearance-none + posicionado sobre
// el icono), para no perder navegación por teclado ni el anuncio de
// lector de pantalla que ya trae gratis un <input type="radio">. El icono y
// el fondo circular reaccionan al estado :checked del input vía peer-*, sin
// nada de estado en React — el value que llega a FormData es idéntico al de
// antes, actions.ts no cambió.
function OpcionAsistencia({
  estudianteId,
  valor,
  etiqueta,
  defaultChecked,
  Icono,
  colorTexto,
  colorFondo,
}: {
  estudianteId: string;
  valor: "presente" | "ausente" | "justificado";
  etiqueta: string;
  defaultChecked: boolean;
  Icono: typeof Check;
  colorTexto: string;
  colorFondo: string;
}) {
  return (
    <label className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
      <input
        type="radio"
        name={`estado-${estudianteId}`}
        value={valor}
        defaultChecked={defaultChecked}
        aria-label={etiqueta}
        className="peer absolute inset-0 h-11 w-11 cursor-pointer appearance-none rounded-full"
      />
      <span
        className={`pointer-events-none absolute inset-0 rounded-full ${colorFondo}`}
      />
      <Icono
        aria-hidden="true"
        className={`pointer-events-none h-5 w-5 text-ink/55 ${colorTexto}`}
      />
    </label>
  );
}

export default function FormularioAsistencia({
  cursoId,
  sesionId,
  estudiantes,
}: {
  cursoId: string;
  sesionId: string;
  estudiantes: Estudiante[];
}) {
  const { mostrar } = useToast();

  async function guardarConAviso(
    prevState: EstadoAsistencia,
    formData: FormData
  ): Promise<EstadoAsistencia> {
    const resultado = await guardarAsistencia(
      cursoId,
      sesionId,
      prevState,
      formData
    );
    if (!resultado.error) {
      mostrar("Asistencia guardada.");
    }
    return resultado;
  }

  const [state, formAction, pending] = useActionState(
    guardarConAviso,
    estadoInicial
  );

  return (
    <form action={formAction} className="card w-full max-w-sm p-6">
      <ul className="flex flex-col divide-y divide-verde-bosque/10">
        {estudiantes.map((estudiante) => (
          <li key={estudiante.id} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1 text-sm text-ink">
              {estudiante.nombre_completo}
            </span>
            <div
              role="radiogroup"
              aria-label={`Asistencia de ${estudiante.nombre_completo}`}
              className="flex shrink-0 gap-1"
            >
              <OpcionAsistencia
                estudianteId={estudiante.id}
                valor="presente"
                etiqueta="Presente"
                defaultChecked={estudiante.estado === "presente"}
                Icono={Check}
                colorTexto="peer-checked:text-verde-bosque"
                colorFondo="peer-checked:bg-verde-bosque/10"
              />
              <OpcionAsistencia
                estudianteId={estudiante.id}
                valor="ausente"
                etiqueta="Ausente"
                defaultChecked={estudiante.estado === "ausente"}
                Icono={X}
                colorTexto="peer-checked:text-terracota"
                colorFondo="peer-checked:bg-terracota/10"
              />
              <OpcionAsistencia
                estudianteId={estudiante.id}
                valor="justificado"
                etiqueta="Justificado"
                defaultChecked={estudiante.estado === "justificado"}
                Icono={Triangle}
                colorTexto="peer-checked:text-abierta"
                colorFondo="peer-checked:bg-abierta/10"
              />
            </div>
          </li>
        ))}
      </ul>

      {state.error && (
        <p className="mt-3 text-sm text-terracota">{state.error}</p>
      )}

      <button type="submit" disabled={pending} className="btn-primary mt-4">
        {pending ? "Guardando…" : "Guardar asistencia"}
      </button>
    </form>
  );
}
