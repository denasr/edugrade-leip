"use client";

import { useState } from "react";
import Link from "next/link";
import { estadoActividad, textoRelativoCierre } from "@/lib/actividades";
import { IconoArchivo } from "@/lib/icono-archivo";
import FormularioActividad from "./formulario-actividad";
import BotonEliminarActividad from "./boton-eliminar-actividad";
import { alternarBloqueo, eliminarActividad } from "./actions";

type Actividad = {
  id: string;
  titulo: string;
  instrucciones: string | null;
  fecha_apertura: string | null;
  fecha_cierre: string;
  bloqueado_manual: boolean;
  materiales_actividad: { nombre_archivo: string }[];
};

export default function TarjetaTarea({
  actividad,
  cursoId,
  conteo,
}: {
  actividad: Actividad;
  cursoId: string;
  conteo: { total: number; pendientes: number };
}) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <li>
        <FormularioActividad
          cursoId={cursoId}
          actividadExistente={{
            id: actividad.id,
            titulo: actividad.titulo,
            instrucciones: actividad.instrucciones,
            fecha_apertura: actividad.fecha_apertura,
            fecha_cierre: actividad.fecha_cierre,
            material: actividad.materiales_actividad[0] ?? null,
          }}
          onCancelar={() => setEditando(false)}
        />
      </li>
    );
  }

  const estado = estadoActividad(actividad);
  const alternarBloqueoAction = alternarBloqueo.bind(
    null,
    cursoId,
    actividad.id,
    !actividad.bloqueado_manual
  );
  const eliminarActividadAction = eliminarActividad.bind(
    null,
    cursoId,
    actividad.id
  );

  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/docente/actividades/${actividad.id}`}
          className="font-medium text-ink hover:underline"
        >
          {actividad.titulo}
        </Link>
        <span className={estado === "ABIERTA" ? "badge-abierta" : "badge-cerrada"}>
          {estado === "ABIERTA" ? "Abierta" : "Cerrada"}
        </span>
      </div>

      <Link
        href={`/docente/actividades/${actividad.id}`}
        className="mt-1 inline-block text-xs text-ink/70 hover:underline"
      >
        {conteo.total} entregas · {conteo.pendientes} pendientes
      </Link>

      {actividad.instrucciones && (
        <p className="mt-1 whitespace-pre-wrap text-sm text-ink/70">
          {actividad.instrucciones}
        </p>
      )}

      <p className="mt-2 text-xs text-ink/70">
        {actividad.fecha_apertura
          ? `Abre ${new Date(actividad.fecha_apertura).toLocaleString("es-MX")} · `
          : ""}
        Cierra {new Date(actividad.fecha_cierre).toLocaleString("es-MX")}
        {" ("}
        {textoRelativoCierre(actividad.fecha_cierre)}
        {")"}
      </p>

      {actividad.materiales_actividad.length > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink/70">
          <IconoArchivo nombreArchivo={actividad.materiales_actividad[0].nombre_archivo} />
          Material: {actividad.materiales_actividad[0].nombre_archivo}
        </p>
      )}

      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="link-muted"
        >
          Editar
        </button>
        <form action={alternarBloqueoAction}>
          <button type="submit" className="link-muted">
            {actividad.bloqueado_manual ? "Desbloquear" : "Bloquear"}
          </button>
        </form>
        <BotonEliminarActividad
          accion={eliminarActividadAction}
          titulo={actividad.titulo}
        />
      </div>
    </li>
  );
}
