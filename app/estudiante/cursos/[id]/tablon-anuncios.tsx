"use client";

import { useState } from "react";
import { esAnuncioNuevo, fechaAnuncio, type Anuncio } from "@/lib/anuncios";
import TextoConEnlaces from "@/lib/texto-con-enlaces";

// Cuántos se ven sin expandir: los fijados siempre, más los más recientes
// hasta completar este número — para que un semestre de anuncios no empuje
// las tareas y la calificación hasta el fondo de la página.
const VISIBLES_INICIALES = 3;

export default function TablonAnuncios({ anuncios }: { anuncios: Anuncio[] }) {
  const [verTodos, setVerTodos] = useState(false);

  if (anuncios.length === 0) return null;

  const fijados = anuncios.filter((a) => a.fijado).length;
  const limite = Math.max(VISIBLES_INICIALES, fijados);
  const visibles = verTodos ? anuncios : anuncios.slice(0, limite);
  const ocultos = anuncios.length - visibles.length;

  return (
    <section className="w-full max-w-sm">
      <h2 className="font-title text-xl text-verde-bosque">Anuncios</h2>

      <ul className="mt-4 flex flex-col gap-3">
        {visibles.map((anuncio) => (
          <li
            key={anuncio.id}
            className={`card p-4 ${anuncio.fijado ? "border-verde-bosque/40" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/70">
              {anuncio.fijado && <span className="badge-calificado">📌 Fijado</span>}
              {esAnuncioNuevo(anuncio.created_at) && (
                <span className="badge-abierta">Nuevo</span>
              )}
              <span>{fechaAnuncio(anuncio.created_at)}</span>
              {anuncio.editado_at && <span>· editado</span>}
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink">
              <TextoConEnlaces texto={anuncio.contenido} />
            </p>
          </li>
        ))}
      </ul>

      {ocultos > 0 && (
        <button
          type="button"
          onClick={() => setVerTodos(true)}
          className="link-muted mt-2 w-full justify-center"
        >
          Ver anuncios anteriores ({ocultos})
        </button>
      )}
    </section>
  );
}
