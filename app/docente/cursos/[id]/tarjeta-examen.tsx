"use client";

import { useState } from "react";
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
  ponderacion: number;
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
  const [editando, setEditando] = useState(false);

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
            ponderacion: examen.ponderacion,
            preguntas,
          }}
          tieneRespuestas={stats.presentados > 0}
          onCancelar={() => setEditando(false)}
        />
      </li>
    );
  }

  const estado = estadoActividad(examen);
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

  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-ink">{examen.titulo}</p>
        <span className={estado === "ABIERTA" ? "badge-abierta" : "badge-cerrada"}>
          {estado === "ABIERTA" ? "Abierta" : "Cerrada"}
        </span>
      </div>

      <p className="mt-1 text-xs text-ink/50">
        {stats.presentados} presentados · promedio {promedio}/10
      </p>

      {examen.instrucciones && (
        <p className="mt-1 text-sm text-ink/70">{examen.instrucciones}</p>
      )}

      <p className="mt-2 text-xs text-ink/50">
        {examen.fecha_apertura
          ? `Abre ${new Date(examen.fecha_apertura).toLocaleString("es-MX")} · `
          : ""}
        Cierra {new Date(examen.fecha_cierre).toLocaleString("es-MX")}
        {" ("}
        {textoRelativoCierre(examen.fecha_cierre)}
        {") · "}
        Ponderación {examen.ponderacion}
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
