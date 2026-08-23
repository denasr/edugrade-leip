"use client";

import { useActionState, useRef, useState } from "react";
import { crearActividad, editarActividad, type EstadoActividad } from "./actions";
import { fechaParaInput } from "@/lib/actividades";
import { useToast } from "../../../toast-provider";

const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

const estadoInicial: EstadoActividad = { error: null };

type ActividadExistente = {
  id: string;
  titulo: string;
  instrucciones: string | null;
  fecha_apertura: string | null;
  fecha_cierre: string;
  material: { nombre_archivo: string } | null;
};

export default function FormularioActividad({
  cursoId,
  actividadExistente,
  onCancelar,
}: {
  cursoId: string;
  actividadExistente?: ActividadExistente;
  onCancelar?: () => void;
}) {
  const { mostrar } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [quitarMaterial, setQuitarMaterial] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const editando = Boolean(actividadExistente);

  async function guardarConAviso(
    prevState: EstadoActividad,
    formData: FormData
  ): Promise<EstadoActividad> {
    const resultado = actividadExistente
      ? await editarActividad(cursoId, actividadExistente.id, prevState, formData)
      : await crearActividad(cursoId, prevState, formData);

    if (!resultado.error) {
      formRef.current?.reset();
      if (editando) {
        onCancelar?.();
        mostrar("Tarea actualizada.");
      } else {
        setAbierto(false);
        mostrar("Tarea creada.");
      }
    }
    return resultado;
  }

  const [state, formAction, pending] = useActionState(
    guardarConAviso,
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

  function cancelar() {
    if (editando) {
      onCancelar?.();
    } else {
      setAbierto(false);
    }
  }

  if (!editando && !abierto) {
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
      <h2 className="font-title text-xl text-verde-bosque">
        {editando ? "Editar tarea" : "Nueva tarea"}
      </h2>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Título
          <input
            type="text"
            name="titulo"
            required
            defaultValue={actividadExistente?.titulo}
            className="input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Instrucciones
          <textarea
            name="instrucciones"
            rows={3}
            defaultValue={actividadExistente?.instrucciones ?? ""}
            className="input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Fecha de apertura (opcional)
          <input
            type="datetime-local"
            name="fecha_apertura"
            defaultValue={fechaParaInput(actividadExistente?.fecha_apertura ?? null)}
            className="input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Fecha de cierre
          <input
            type="datetime-local"
            name="fecha_cierre"
            required
            defaultValue={
              actividadExistente
                ? fechaParaInput(actividadExistente.fecha_cierre)
                : undefined
            }
            className="input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          {editando ? "Reemplazar material (opcional)" : "Material de apoyo (opcional)"}
          <input
            type="file"
            name="archivo"
            accept=".pdf,.docx,.jpg,.jpeg,.png"
            className="text-sm text-ink/70 file:mr-3 file:rounded-full file:border-0 file:bg-verde-bosque/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-verde-bosque"
          />
          <span className="text-xs text-ink/70">
            PDF, DOCX, JPG o PNG. Máximo 10 MB.
          </span>
        </label>

        {editando && actividadExistente?.material && (
          <label className="flex items-center gap-2 text-sm text-ink/80">
            <input
              type="checkbox"
              name="quitar_material"
              checked={quitarMaterial}
              onChange={(e) => setQuitarMaterial(e.target.checked)}
              className="accent-terracota"
            />
            Quitar material actual ({actividadExistente.material.nombre_archivo})
          </label>
        )}

        {state.error && <p className="text-sm text-terracota">{state.error}</p>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="btn-primary">
            {pending
              ? "Guardando…"
              : editando
                ? "Guardar cambios"
                : "Crear tarea"}
          </button>
          <button type="button" onClick={cancelar} className="link-muted">
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}
