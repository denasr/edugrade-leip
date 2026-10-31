"use client";

import { useState } from "react";
import { fechaAnuncio, type Anuncio } from "@/lib/anuncios";
import TextoConEnlaces from "@/lib/texto-con-enlaces";
import BotonSubmitEliminar from "../boton-submit-eliminar";
import FormularioAnuncio from "./formulario-anuncio";
import { cambiarFijadoAnuncio, eliminarAnuncio } from "./actions";

export default function TarjetaAnuncio({
  cursoId,
  anuncio,
}: {
  cursoId: string;
  anuncio: Anuncio;
}) {
  const [editando, setEditando] = useState(false);
  const cambiarFijado = cambiarFijadoAnuncio.bind(null, cursoId, anuncio.id, !anuncio.fijado);
  const eliminar = eliminarAnuncio.bind(null, cursoId, anuncio.id);

  return (
    <li className={`card p-4 ${anuncio.fijado ? "border-verde-bosque/40" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/70">
        {anuncio.fijado && <span className="badge-calificado">📌 Fijado</span>}
        <span>{fechaAnuncio(anuncio.created_at)}</span>
        {anuncio.editado_at && <span>· editado</span>}
      </div>

      {editando ? (
        <FormularioAnuncio
          cursoId={cursoId}
          anuncioExistente={{ id: anuncio.id, contenido: anuncio.contenido }}
          alTerminar={() => setEditando(false)}
        />
      ) : (
        <>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink">
            <TextoConEnlaces texto={anuncio.contenido} />
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-1">
            <button type="button" onClick={() => setEditando(true)} className="link-muted">
              Editar
            </button>
            <form action={cambiarFijado}>
              <button type="submit" className="link-muted">
                {anuncio.fijado ? "Desfijar" : "Fijar arriba"}
              </button>
            </form>
            <form action={eliminar}>
              <BotonSubmitEliminar mensajeConfirmacion="Esto eliminará el anuncio para todo el grupo. ¿Continuar?" />
            </form>
          </div>
        </>
      )}
    </li>
  );
}
