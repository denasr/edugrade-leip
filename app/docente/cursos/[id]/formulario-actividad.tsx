"use client";

import { useActionState, useRef, useState } from "react";
import { crearActividad, type EstadoActividad } from "./actions";
import { useToast } from "../../../toast-provider";

const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

const estadoInicial: EstadoActividad = { error: null };

export default function FormularioActividad({ cursoId }: { cursoId: string }) {
  const { mostrar } = useToast();
  const [abierto, setAbierto] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function crearActividadConAviso(
    prevState: EstadoActividad,
    formData: FormData
  ): Promise<EstadoActividad> {
    const resultado = await crearActividad(cursoId, prevState, formData);
    if (!resultado.error) {
      formRef.current?.reset();
      setAbierto(false);
      mostrar("Tarea creada.");
    }
    return resultado;
  }

  const [state, formAction, pending] = useActionState(
    crearActividadConAviso,
    estadoInicial
  );

  function validarArchivo(e: React.FormEvent<HTMLFormElement>) {
    const input = formRef.current?.elements.namedItem(
      "archivo"
    ) as HTMLInputElement | null;
    const archivo = input?.files?.[0];
    if (archivo && archivo.size > TAMANO_MAXIMO_BYTES) {
      e.preventDefault();
      alert("El archivo supera el máximo de 10 MB.");
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="btn-primary w-full max-w-sm"
      >
        + Nueva tarea
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={validarArchivo}
      className="card w-full max-w-sm p-6"
    >
      <h2 className="font-title text-xl text-verde-bosque">Nueva tarea</h2>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Título
          <input type="text" name="titulo" required className="input" />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Instrucciones
          <textarea name="instrucciones" rows={3} className="input" />
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

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Material de apoyo (opcional)
          <input
            type="file"
            name="archivo"
            accept=".pdf,.docx,.jpg,.jpeg,.png"
            className="text-sm text-ink/70 file:mr-3 file:rounded-full file:border-0 file:bg-verde-bosque/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-verde-bosque"
          />
          <span className="text-xs text-ink/50">
            PDF, DOCX, JPG o PNG. Máximo 10 MB.
          </span>
        </label>

        {state.error && <p className="text-sm text-terracota">{state.error}</p>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Creando…" : "Crear tarea"}
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
