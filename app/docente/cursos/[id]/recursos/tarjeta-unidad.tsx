"use client";

import { useState } from "react";
import ItemRecurso from "@/lib/item-recurso";
import type { Recurso, UnidadConRecursos } from "@/lib/recursos";
import BotonSubmitEliminar from "../boton-submit-eliminar";
import FormularioUnidad from "./formulario-unidad";
import FormularioRecurso from "./formulario-recurso";
import {
  cambiarVisibleRecurso,
  cambiarVisibleUnidad,
  eliminarRecurso,
  eliminarUnidad,
  moverRecurso,
  moverUnidad,
} from "./actions";

function BotonFlecha({
  accion,
  etiqueta,
  simbolo,
  deshabilitado,
}: {
  accion: (formData: FormData) => void | Promise<void>;
  etiqueta: string;
  simbolo: string;
  deshabilitado: boolean;
}) {
  return (
    <form action={accion}>
      <button
        type="submit"
        disabled={deshabilitado}
        aria-label={etiqueta}
        title={etiqueta}
        className="link-muted px-1 disabled:opacity-30"
      >
        {simbolo}
      </button>
    </form>
  );
}

function FilaRecurso({
  cursoId,
  recurso,
  unidades,
  esPrimero,
  esUltimo,
}: {
  cursoId: string;
  recurso: Recurso;
  unidades: { id: string; titulo: string }[];
  esPrimero: boolean;
  esUltimo: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const u = recurso.unidad_id;

  return (
    <li className="border-t border-verde-bosque/10 pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-2">
        <ItemRecurso recurso={recurso} />
        {!recurso.visible && <span className="badge-oculta shrink-0">Oculto</span>}
      </div>

      {editando ? (
        <FormularioRecurso
          cursoId={cursoId}
          unidadId={u}
          unidades={unidades}
          recursoExistente={recurso}
          alTerminar={() => setEditando(false)}
        />
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-x-1">
          <BotonFlecha
            accion={moverRecurso.bind(null, cursoId, u, recurso.id, "arriba")}
            etiqueta={`Subir "${recurso.titulo}"`}
            simbolo="↑"
            deshabilitado={esPrimero}
          />
          <BotonFlecha
            accion={moverRecurso.bind(null, cursoId, u, recurso.id, "abajo")}
            etiqueta={`Bajar "${recurso.titulo}"`}
            simbolo="↓"
            deshabilitado={esUltimo}
          />
          <button type="button" onClick={() => setEditando(true)} className="link-muted">
            Editar
          </button>
          <form action={cambiarVisibleRecurso.bind(null, cursoId, recurso.id, !recurso.visible)}>
            <button type="submit" className="link-muted">
              {recurso.visible ? "Ocultar" : "Mostrar"}
            </button>
          </form>
          <form action={eliminarRecurso.bind(null, cursoId, recurso.id)}>
            <BotonSubmitEliminar mensajeConfirmacion={`Esto eliminará "${recurso.titulo}". ¿Continuar?`} />
          </form>
        </div>
      )}
    </li>
  );
}

export default function TarjetaUnidad({
  cursoId,
  unidad,
  unidades,
  esPrimera,
  esUltima,
}: {
  cursoId: string;
  unidad: UnidadConRecursos;
  unidades: { id: string; titulo: string }[];
  esPrimera: boolean;
  esUltima: boolean;
}) {
  const [renombrando, setRenombrando] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const total = unidad.recursos.length;

  return (
    <li className={`card p-4 ${unidad.visible ? "" : "border-dashed"}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-title text-lg text-verde-bosque break-words">{unidad.titulo}</h3>
        {!unidad.visible && <span className="badge-oculta shrink-0">Oculta</span>}
      </div>
      {!unidad.visible && total > 0 && (
        <p className="text-xs text-ink/70">
          Los estudiantes no ven esta unidad ni nada de lo que tiene adentro.
        </p>
      )}

      {renombrando ? (
        <FormularioUnidad
          cursoId={cursoId}
          unidadExistente={{ id: unidad.id, titulo: unidad.titulo }}
          alTerminar={() => setRenombrando(false)}
        />
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-x-1">
          <BotonFlecha
            accion={moverUnidad.bind(null, cursoId, unidad.id, "arriba")}
            etiqueta={`Subir unidad "${unidad.titulo}"`}
            simbolo="↑"
            deshabilitado={esPrimera}
          />
          <BotonFlecha
            accion={moverUnidad.bind(null, cursoId, unidad.id, "abajo")}
            etiqueta={`Bajar unidad "${unidad.titulo}"`}
            simbolo="↓"
            deshabilitado={esUltima}
          />
          <button type="button" onClick={() => setRenombrando(true)} className="link-muted">
            Renombrar
          </button>
          <form action={cambiarVisibleUnidad.bind(null, cursoId, unidad.id, !unidad.visible)}>
            <button type="submit" className="link-muted">
              {unidad.visible ? "Ocultar unidad" : "Mostrar unidad"}
            </button>
          </form>
          <form action={eliminarUnidad.bind(null, cursoId, unidad.id)}>
            <BotonSubmitEliminar
              mensajeConfirmacion={
                total > 0
                  ? `Esto eliminará la unidad "${unidad.titulo}" y sus ${total} recurso(s), con sus archivos. ¿Continuar?`
                  : `Esto eliminará la unidad "${unidad.titulo}". ¿Continuar?`
              }
            />
          </form>
        </div>
      )}

      {total === 0 ? (
        <p className="mt-3 text-sm text-ink/70">Esta unidad todavía no tiene recursos.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {unidad.recursos.map((recurso, i) => (
            <FilaRecurso
              key={recurso.id}
              cursoId={cursoId}
              recurso={recurso}
              unidades={unidades}
              esPrimero={i === 0}
              esUltimo={i === total - 1}
            />
          ))}
        </ul>
      )}

      {agregando ? (
        <FormularioRecurso
          cursoId={cursoId}
          unidadId={unidad.id}
          alTerminar={() => setAgregando(false)}
        />
      ) : (
        <button type="button" onClick={() => setAgregando(true)} className="btn-secondary mt-3 self-start">
          + Agregar recurso
        </button>
      )}
    </li>
  );
}
