"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { estadoActividad, motivoCierre, textoRelativoCierre } from "@/lib/actividades";
import FormularioPresentarExamen from "./formulario-presentar-examen";

type Entrega = {
  evaluaciones: { calificacion_final: number; comentarios: string | null } | null;
};

type Pregunta = { id: string; enunciado: string; opciones: string[]; puntos: number };

type Examen = {
  id: string;
  titulo: string;
  instrucciones: string | null;
  fecha_apertura: string | null;
  fecha_cierre: string;
  bloqueado_manual: boolean;
  entrega: Entrega | null;
  preguntas: Pregunta[];
};

export default function TarjetaExamenEstudiante({
  examen,
  cursoId,
}: {
  examen: Examen;
  cursoId: string;
}) {
  const estado = estadoActividad(examen);
  const evaluacion = examen.entrega?.evaluaciones ?? null;

  // Un examen entregado siempre trae evaluación (se autocalifica al
  // momento), así que a diferencia de la tarea aquí no hay un estado
  // "Sin calificar" que mostrar en la vista compacta.
  const [abierto, setAbierto] = useState(estado !== "CERRADA");

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
          {evaluacion && (
            <span className="badge-calificado shrink-0">
              {evaluacion.calificacion_final}/10
            </span>
          )}
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-ink/50" />
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

      {examen.entrega ? (
        <div className="mt-3 border-t border-verde-bosque/15 pt-3 text-sm">
          {evaluacion ? (
            <p className="font-medium text-ink">
              Calificación: {evaluacion.calificacion_final}/10
            </p>
          ) : (
            <span className="badge-pendiente">Presentado, calificando…</span>
          )}
        </div>
      ) : estado === "ABIERTA" ? (
        <FormularioPresentarExamen
          actividadId={examen.id}
          cursoId={cursoId}
          preguntas={examen.preguntas}
        />
      ) : (
        <p className="mt-3 border-t border-verde-bosque/15 pt-3 text-sm text-ink/70">
          No se puede presentar. {motivoCierre(examen)}
        </p>
      )}
    </li>
  );
}
