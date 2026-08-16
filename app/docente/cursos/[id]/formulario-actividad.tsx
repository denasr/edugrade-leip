"use client";

import { useActionState, useEffect, useRef } from "react";
import { crearActividad, type EstadoActividad } from "./actions";

const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

const estadoInicial: EstadoActividad = { error: null };

export default function FormularioActividad({ cursoId }: { cursoId: string }) {
  const crearActividadDelCurso = crearActividad.bind(null, cursoId);
  const [state, formAction, pending] = useActionState(
    crearActividadDelCurso,
    estadoInicial
  );
  const formRef = useRef<HTMLFormElement>(null);
  const primerRender = useRef(true);

  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    if (!pending && state.error === null) {
      formRef.current?.reset();
    }
  }, [state, pending]);

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

        <button type="submit" disabled={pending} className="btn-primary mt-2">
          {pending ? "Creando…" : "Crear tarea"}
        </button>
      </div>
    </form>
  );
}
