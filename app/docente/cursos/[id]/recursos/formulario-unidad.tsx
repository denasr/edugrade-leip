"use client";

import { useActionState, useState } from "react";
import { LARGO_MAXIMO_TITULO } from "@/lib/recursos";
import { crearUnidad, renombrarUnidad, type EstadoRecursos } from "./actions";
import { useToast } from "../../../../toast-provider";

const estadoInicial: EstadoRecursos = { error: null };

// Nueva unidad, o renombrar una existente (con `unidadExistente`).
export default function FormularioUnidad({
  cursoId,
  unidadExistente,
  alTerminar,
}: {
  cursoId: string;
  unidadExistente?: { id: string; titulo: string };
  alTerminar?: () => void;
}) {
  const { mostrar } = useToast();
  const [titulo, setTitulo] = useState(unidadExistente?.titulo ?? "");
  const editando = Boolean(unidadExistente);

  async function guardar(prev: EstadoRecursos, formData: FormData): Promise<EstadoRecursos> {
    const resultado = unidadExistente
      ? await renombrarUnidad(cursoId, unidadExistente.id, prev, formData)
      : await crearUnidad(cursoId, prev, formData);
    if (!resultado.error) {
      mostrar(editando ? "Unidad actualizada." : "Unidad creada.");
      if (!editando) setTitulo("");
      alTerminar?.();
    }
    return resultado;
  }

  const [state, formAction, pending] = useActionState(guardar, estadoInicial);

  return (
    <form action={formAction} className={editando ? "mt-2" : "card w-full p-6"}>
      {!editando && <h2 className="font-title text-xl text-verde-bosque">Nueva unidad</h2>}

      <label className={`flex flex-col gap-1 text-sm text-ink/80 ${editando ? "" : "mt-4"}`}>
        Nombre de la unidad
        <input
          name="titulo"
          required
          maxLength={LARGO_MAXIMO_TITULO}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder={editando ? undefined : "Ej. Unidad 1. Fundamentos"}
          className="input"
        />
      </label>

      {!editando && (
        <label className="mt-3 flex items-center gap-2 text-sm text-ink/80">
          <input type="checkbox" name="ocultar" className="h-4 w-4 accent-verde-bosque" />
          Ocultar a los estudiantes por ahora
        </label>
      )}

      {state.error && <p className="mt-2 text-sm text-terracota">{state.error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pending || !titulo.trim()} className="btn-primary">
          {pending ? "Guardando…" : editando ? "Guardar" : "Crear unidad"}
        </button>
        {editando && (
          <button type="button" onClick={alTerminar} className="link-muted">
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
