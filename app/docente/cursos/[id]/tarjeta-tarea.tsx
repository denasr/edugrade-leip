"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { estadoActividad, textoRelativoCierre } from "@/lib/actividades";
import { IconoArchivo } from "@/lib/icono-archivo";
import FormularioActividad from "./formulario-actividad";
import BotonEliminarActividad from "./boton-eliminar-actividad";
import { alternarBloqueo, alternarVisibilidad, eliminarActividad } from "./actions";

type Actividad = {
  id: string;
  titulo: string;
  instrucciones: string | null;
  fecha_apertura: string | null;
  fecha_cierre: string;
  bloqueado_manual: boolean;
  visible_estudiantes: boolean;
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
  const estado = estadoActividad(actividad);
  const [editando, setEditando] = useState(false);
  // Colapsada por default solo si ya está cerrada — ahorra espacio en
  // cursos con muchas tareas viejas sin esconder nada: un clic la abre a
  // la tarjeta completa de siempre, con Editar/Bloquear/Eliminar incluidos
  // (esos botones no existen en ningún otro lado, así que nunca deben
  // quedar inalcanzables).
  const [abierta, setAbierta] = useState(estado !== "CERRADA");

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

  const alternarBloqueoAction = alternarBloqueo.bind(
    null,
    cursoId,
    actividad.id,
    !actividad.bloqueado_manual
  );
  const alternarVisibilidadAction = alternarVisibilidad.bind(
    null,
    cursoId,
    actividad.id,
    !actividad.visible_estudiantes
  );
  const eliminarActividadAction = eliminarActividad.bind(
    null,
    cursoId,
    actividad.id
  );

  if (estado === "CERRADA" && !abierta) {
    return (
      <li>
        <button
          type="button"
          onClick={() => setAbierta(true)}
          aria-label={`Expandir ${actividad.titulo}`}
          className="flex w-full items-center gap-2 rounded-full border border-verde-bosque/15 bg-superficie px-4 py-2.5 text-left shadow-sm shadow-verde-bosque/5"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
            {actividad.titulo}
          </span>
          {!actividad.visible_estudiantes && (
            <span className="badge-oculta shrink-0">Oculta</span>
          )}
          {conteo.pendientes > 0 && (
            <span className="badge-pendiente shrink-0">
              {conteo.pendientes} pendientes
            </span>
          )}
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-ink/50"
          />
        </button>
      </li>
    );
  }

  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/docente/actividades/${actividad.id}`}
          className="font-medium text-ink hover:underline"
        >
          {actividad.titulo}
        </Link>
        <div className="flex shrink-0 items-center gap-1.5">
          {!actividad.visible_estudiantes && (
            <span className="badge-oculta">Oculta</span>
          )}
          <span className={estado === "ABIERTA" ? "badge-abierta" : "badge-cerrada"}>
            {estado === "ABIERTA" ? "Abierta" : "Cerrada"}
          </span>
          {estado === "CERRADA" && (
            <button
              type="button"
              onClick={() => setAbierta(false)}
              aria-label={`Colapsar ${actividad.titulo}`}
              className="text-ink/50"
            >
              <ChevronDown aria-hidden="true" className="h-4 w-4 rotate-180" />
            </button>
          )}
        </div>
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
        <form action={alternarVisibilidadAction}>
          <button type="submit" className="link-muted">
            {actividad.visible_estudiantes ? "Ocultar" : "Publicar"}
          </button>
        </form>
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
