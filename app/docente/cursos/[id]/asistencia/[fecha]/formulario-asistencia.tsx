"use client";

import { useActionState } from "react";
import { guardarAsistencia, type EstadoAsistencia } from "./actions";
import { useToast } from "@/app/toast-provider";

type Estudiante = {
  id: string;
  nombre_completo: string;
  estado: string;
};

const estadoInicial: EstadoAsistencia = { error: null };

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
          <li
            key={estudiante.id}
            className="flex items-center justify-between gap-3 py-2"
          >
            <span className="text-sm text-ink">
              {estudiante.nombre_completo}
            </span>
            <div className="flex shrink-0 gap-3">
              <label className="flex items-center gap-1 text-sm text-ink/70">
                <input
                  type="radio"
                  name={`estado-${estudiante.id}`}
                  value="presente"
                  defaultChecked={estudiante.estado === "presente"}
                  className="accent-verde-bosque"
                />
                Presente
              </label>
              <label className="flex items-center gap-1 text-sm text-ink/70">
                <input
                  type="radio"
                  name={`estado-${estudiante.id}`}
                  value="ausente"
                  defaultChecked={estudiante.estado === "ausente"}
                  className="accent-terracota"
                />
                Ausente
              </label>
              <label className="flex items-center gap-1 text-sm text-ink/70">
                <input
                  type="radio"
                  name={`estado-${estudiante.id}`}
                  value="justificado"
                  defaultChecked={estudiante.estado === "justificado"}
                  className="accent-abierta"
                />
                Justificado
              </label>
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
