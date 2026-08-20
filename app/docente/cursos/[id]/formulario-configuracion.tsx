"use client";

import { useActionState, useState } from "react";
import {
  actualizarConfiguracionCurso,
  type EstadoConfiguracion,
} from "./actions";
import { useToast } from "../../../toast-provider";

type Porcentajes = {
  porcentaje_examenes: number;
  porcentaje_tareas: number;
  porcentaje_asistencia: number;
};

const estadoInicial: EstadoConfiguracion = { error: null };

export default function FormularioConfiguracion({
  cursoId,
  porcentajes,
}: {
  cursoId: string;
  porcentajes: Porcentajes;
}) {
  const { mostrar } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [examenes, setExamenes] = useState(porcentajes.porcentaje_examenes);
  const [tareas, setTareas] = useState(porcentajes.porcentaje_tareas);
  const [asistencia, setAsistencia] = useState(
    porcentajes.porcentaje_asistencia
  );

  const suma = examenes + tareas + asistencia;
  const sumaValida = suma === 100;

  async function guardarConAviso(
    prevState: EstadoConfiguracion,
    formData: FormData
  ): Promise<EstadoConfiguracion> {
    const resultado = await actualizarConfiguracionCurso(
      cursoId,
      prevState,
      formData
    );
    if (!resultado.error) {
      setAbierto(false);
      mostrar("Configuración guardada.");
    }
    return resultado;
  }

  const [state, formAction, pending] = useActionState(
    guardarConAviso,
    estadoInicial
  );

  function cancelar() {
    setExamenes(porcentajes.porcentaje_examenes);
    setTareas(porcentajes.porcentaje_tareas);
    setAsistencia(porcentajes.porcentaje_asistencia);
    setAbierto(false);
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="link-muted w-full max-w-sm justify-center"
      >
        ⚙ Configuración de ponderación
      </button>
    );
  }

  return (
    <form action={formAction} className="card w-full max-w-sm p-6">
      <h2 className="font-title text-xl text-verde-bosque">
        Configuración de ponderación
      </h2>
      <p className="mt-1 text-sm text-ink/60">
        Qué tanto pesa cada categoría en la calificación final del curso.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Exámenes (%)
          <input
            type="number"
            name="porcentaje_examenes"
            required
            min={0}
            max={100}
            step={1}
            value={examenes}
            onChange={(e) => setExamenes(Number(e.target.value))}
            className="input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Tareas (%)
          <input
            type="number"
            name="porcentaje_tareas"
            required
            min={0}
            max={100}
            step={1}
            value={tareas}
            onChange={(e) => setTareas(Number(e.target.value))}
            className="input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Asistencia (%)
          <input
            type="number"
            name="porcentaje_asistencia"
            required
            min={0}
            max={100}
            step={1}
            value={asistencia}
            onChange={(e) => setAsistencia(Number(e.target.value))}
            className="input"
          />
        </label>

        <p className={`text-sm ${sumaValida ? "text-ink/60" : "text-terracota"}`}>
          Suma: {suma}/100{!sumaValida && " — debe sumar exactamente 100"}
        </p>

        {state.error && <p className="text-sm text-terracota">{state.error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending || !sumaValida}
            className="btn-primary"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
          <button type="button" onClick={cancelar} className="link-muted">
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}
