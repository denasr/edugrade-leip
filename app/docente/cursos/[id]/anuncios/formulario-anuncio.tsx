"use client";

import { useActionState, useState } from "react";
import { LARGO_MAXIMO_ANUNCIO } from "@/lib/anuncios";
import { publicarAnuncio, editarAnuncio, type EstadoAnuncio } from "./actions";
import { useToast } from "../../../../toast-provider";

const estadoInicial: EstadoAnuncio = { error: null };

// Sirve para publicar uno nuevo y para editar uno existente (con
// `anuncioExistente`). El texto es controlado a propósito: así no se pierde
// lo escrito si el guardado falla, y se limpia solo cuando sí se publicó.
export default function FormularioAnuncio({
  cursoId,
  anuncioExistente,
  alTerminar,
}: {
  cursoId: string;
  anuncioExistente?: { id: string; contenido: string };
  alTerminar?: () => void;
}) {
  const { mostrar } = useToast();
  const [contenido, setContenido] = useState(anuncioExistente?.contenido ?? "");
  const editando = Boolean(anuncioExistente);

  async function guardarConAviso(
    prevState: EstadoAnuncio,
    formData: FormData
  ): Promise<EstadoAnuncio> {
    const resultado = anuncioExistente
      ? await editarAnuncio(cursoId, anuncioExistente.id, prevState, formData)
      : await publicarAnuncio(cursoId, prevState, formData);
    if (!resultado.error) {
      mostrar(editando ? "Anuncio actualizado." : "Anuncio publicado.");
      if (!editando) setContenido("");
      alTerminar?.();
    }
    return resultado;
  }

  const [state, formAction, pending] = useActionState(guardarConAviso, estadoInicial);

  return (
    <form action={formAction} className={editando ? "mt-3" : "card w-full p-6"}>
      {!editando && (
        <h2 className="font-title text-xl text-verde-bosque">Nuevo anuncio</h2>
      )}

      <label className={`flex flex-col gap-1 text-sm text-ink/80 ${editando ? "" : "mt-4"}`}>
        {editando ? "Texto del anuncio" : "Mensaje para el grupo"}
        <textarea
          name="contenido"
          required
          rows={editando ? 4 : 3}
          maxLength={LARGO_MAXIMO_ANUNCIO}
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          placeholder={
            editando ? undefined : "Ej. Mañana la clase será por Meet: https://meet.google.com/…"
          }
          className="input"
        />
      </label>

      {!editando && (
        <label className="mt-3 flex items-center gap-2 text-sm text-ink/80">
          <input type="checkbox" name="fijado" className="h-4 w-4 accent-verde-bosque" />
          Fijar arriba del tablón
        </label>
      )}

      {state.error && <p className="mt-2 text-sm text-terracota">{state.error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pending || !contenido.trim()} className="btn-primary">
          {pending ? "Guardando…" : editando ? "Guardar" : "Publicar"}
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
