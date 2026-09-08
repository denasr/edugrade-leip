"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { estadoActividad, motivoCierre, textoRelativoCierre } from "@/lib/actividades";
import { IconoArchivo } from "@/lib/icono-archivo";
import FormularioEntrega from "./formulario-entrega";

type Entrega = {
  comentario_estudiante: string | null;
  archivos_entrega: { nombre_archivo: string }[];
  evaluaciones: { calificacion_final: number; comentarios: string | null } | null;
};

type Actividad = {
  id: string;
  titulo: string;
  instrucciones: string | null;
  fecha_apertura: string | null;
  fecha_cierre: string;
  bloqueado_manual: boolean;
  nombreArchivo: string | null;
  enlaceDescarga: string | null;
  entrega: Entrega | null;
};

export default function TarjetaTareaEstudiante({
  actividad,
  cursoId,
}: {
  actividad: Actividad;
  cursoId: string;
}) {
  const estado = estadoActividad(actividad);
  const evaluacion = actividad.entrega?.evaluaciones ?? null;
  const archivosEntregados = actividad.entrega?.archivos_entrega ?? [];

  // Colapsada por default solo si ya cerró — un clic la abre a la tarjeta
  // completa, así nunca se pierde acceso a la calificación/retroalimentación
  // ya puesta (no hay otra pantalla donde volver a verla).
  const [abierta, setAbierta] = useState(estado !== "CERRADA");

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
          {evaluacion ? (
            <span className="badge-calificado shrink-0">
              {evaluacion.calificacion_final}/10
            </span>
          ) : actividad.entrega ? (
            <span className="badge-pendiente shrink-0">Sin calificar</span>
          ) : null}
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-ink/50" />
        </button>
      </li>
    );
  }

  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-ink">{actividad.titulo}</p>
        <div className="flex shrink-0 items-center gap-1.5">
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

      {actividad.enlaceDescarga && (
        <a
          href={actividad.enlaceDescarga}
          className="mt-2 flex items-center gap-1.5 text-sm font-medium text-verde-bosque hover:underline"
        >
          <IconoArchivo nombreArchivo={actividad.nombreArchivo ?? ""} />
          Descargar {actividad.nombreArchivo}
        </a>
      )}

      {actividad.entrega ? (
        <div className="mt-3 border-t border-verde-bosque/15 pt-3 text-sm">
          {archivosEntregados.length === 1 ? (
            <p className="flex items-center gap-1.5 text-ink/70">
              <IconoArchivo nombreArchivo={archivosEntregados[0].nombre_archivo} />
              Entregaste: {archivosEntregados[0].nombre_archivo}
            </p>
          ) : (
            <div className="text-ink/70">
              <p>Entregaste {archivosEntregados.length} archivos:</p>
              <ul className="mt-1 flex flex-col gap-1">
                {archivosEntregados.map((archivo, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <IconoArchivo nombreArchivo={archivo.nombre_archivo} />
                    {archivo.nombre_archivo}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {actividad.entrega.comentario_estudiante && (
            <p className="mt-1 text-ink/70">
              Tu comentario: {actividad.entrega.comentario_estudiante}
            </p>
          )}
          {evaluacion ? (
            <div className="mt-2">
              <p className="font-medium text-ink">
                Calificación: {evaluacion.calificacion_final}/10
              </p>
              {evaluacion.comentarios && (
                <p className="mt-1 text-ink/70">{evaluacion.comentarios}</p>
              )}
            </div>
          ) : (
            <span className="badge-pendiente mt-2">Pendiente de calificar</span>
          )}
        </div>
      ) : estado === "ABIERTA" ? (
        <FormularioEntrega actividadId={actividad.id} cursoId={cursoId} />
      ) : (
        <p className="mt-3 border-t border-verde-bosque/15 pt-3 text-sm text-ink/70">
          No se puede entregar. {motivoCierre(actividad)}
        </p>
      )}
    </li>
  );
}
