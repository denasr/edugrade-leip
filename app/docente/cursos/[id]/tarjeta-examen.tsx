"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { estadoActividad, textoRelativoCierre } from "@/lib/actividades";
import FormularioCrearExamen from "./formulario-crear-examen";
import BotonEliminarActividad from "./boton-eliminar-actividad";
import { alternarBloqueo, eliminarActividad } from "./actions";

type Examen = {
  id: string;
  titulo: string;
  instrucciones: string | null;
  fecha_apertura: string | null;
  fecha_cierre: string;
  bloqueado_manual: boolean;
};

type Pregunta = {
  enunciado: string;
  opciones: string[];
  correcta: string;
  puntos: number;
};

export default function TarjetaExamen({
  examen,
  cursoId,
  stats,
  preguntas,
}: {
  examen: Examen;
  cursoId: string;
  stats: { presentados: number; sumaCalif: number; conCalif: number };
  preguntas: Pregunta[];
}) {
  const estado = estadoActividad(examen);
  const [editando, setEditando] = useState(false);
  // Mismo patrón que TarjetaTarea: colapsada por default solo si ya cerró.
  // Sin badge de pendientes aquí — un examen se autocalifica al momento de
  // entregarse, no existe un estado "sin calificar" que señalar.
  const [abierto, setAbierto] = useState(estado !== "CERRADA");

  if (editando) {
    return (
      <li>
        <FormularioCrearExamen
          cursoId={cursoId}
          examenExistente={{
            id: examen.id,
            titulo: examen.titulo,
            instrucciones: examen.instrucciones,
            fecha_apertura: examen.fecha_apertura,
            fecha_cierre: examen.fecha_cierre,
            preguntas,
          }}
          tieneRespuestas={stats.presentados > 0}
          onCancelar={() => setEditando(false)}
        />
      </li>
    );
  }

  const promedio =
    stats.conCalif > 0 ? (stats.sumaCalif / stats.conCalif).toFixed(1) : "—";
  const alternarBloqueoAction = alternarBloqueo.bind(
    null,
    cursoId,
    examen.id,
    !examen.bloqueado_manual
  );
  const eliminarActividadAction = eliminarActividad.bind(
    null,
    cursoId,
    examen.id
  );

  if (estado === "CERRADA" && !abierto) {
    return (
      <li>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label={`Expandir ${examen.titulo}`}
          className="flex w-full items-center gap-2 rounded-full border border-verde-bosque/15 bg-superficie px-4 py-2.5 text-left shadow-sm shadow-verde-bosque/5"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
            {examen.titulo}
          </span>
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
        <p className="font-medium text-ink">{examen.titulo}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={estado === "ABIERTA" ? "badge-abierta" : "badge-cerrada"}>
            {estado === "ABIERTA" ? "Abierta" : "Cerrada"}
          </span>
          {estado === "CERRADA" && (
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label={`Colapsar ${examen.titulo}`}
              className="text-ink/50"
            >
              <ChevronDown aria-hidden="true" className="h-4 w-4 rotate-180" />
            </button>
          )}
        </div>
      </div>

      <p className="mt-1 text-xs text-ink/70">
        {stats.presentados} presentados · promedio {promedio}/10
      </p>

      {examen.instrucciones && (
        <p className="mt-1 text-sm text-ink/70">{examen.instrucciones}</p>
      )}

      <p className="mt-2 text-xs text-ink/70">
        {examen.fecha_apertura
          ? `Abre ${new Date(examen.fecha_apertura).toLocaleString("es-MX")} · `
          : ""}
        Cierra {new Date(examen.fecha_cierre).toLocaleString("es-MX")}
        {" ("}
        {textoRelativoCierre(examen.fecha_cierre)}
        {")"}
      </p>

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
            {examen.bloqueado_manual ? "Desbloquear" : "Bloquear"}
          </button>
        </form>
        <BotonEliminarActividad
          accion={eliminarActividadAction}
          titulo={examen.titulo}
        />
      </div>
    </li>
  );
}
