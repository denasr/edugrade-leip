"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { estadoActividad, textoRelativoCierre } from "@/lib/actividades";
import FormularioCrearExamen from "./formulario-crear-examen";
import FormularioCopiarActividad from "./formulario-copiar-actividad";
import BotonEliminarActividad from "./boton-eliminar-actividad";
import { alternarBloqueo, alternarVisibilidad, eliminarActividad } from "./actions";

type Examen = {
  id: string;
  titulo: string;
  instrucciones: string | null;
  fecha_apertura: string | null;
  fecha_cierre: string;
  bloqueado_manual: boolean;
  visible_estudiantes: boolean;
  // Opcional porque esta tarjeta también se reusa para un "cuestionario"
  // (tipo="TAREA" en la pestaña Tareas), que no trae esta columna en su
  // consulta — siempre es de un solo intento, sin UI para cambiarlo, así
  // que el default de abajo ya refleja ese caso correctamente.
  intentos_permitidos?: number;
};

type Pregunta = {
  enunciado: string;
  opciones: string[];
  correcta: string;
  puntos: number;
};

type CursoOpcion = { id: string; nombre: string; grupo: string; periodo: string };

export default function TarjetaExamen({
  examen,
  cursoId,
  stats,
  preguntas,
  tipo = "EXAMEN",
  otrosCursos = [],
}: {
  examen: Examen;
  cursoId: string;
  stats: { presentados: number; sumaCalif: number; conCalif: number };
  preguntas: Pregunta[];
  // Reusada tal cual para los "cuestionarios" (tipo="TAREA") que se crean
  // desde la pestaña Tareas — misma tarjeta, mismas stats, solo cambia el
  // texto que ve el docente al editar (ver formulario-crear-examen.tsx).
  tipo?: "TAREA" | "EXAMEN";
  // Cursos propios del docente aparte de este — [] si solo tiene uno. Sin
  // esto no habría a dónde copiar, así que el botón "Copiar" ni se muestra.
  otrosCursos?: CursoOpcion[];
}) {
  const estado = estadoActividad(examen);
  const [editando, setEditando] = useState(false);
  const [copiando, setCopiando] = useState(false);
  // Mismo patrón que TarjetaTarea: colapsada por default solo si ya cerró.
  // Sin badge de pendientes aquí — un examen se autocalifica al momento de
  // entregarse, no existe un estado "sin calificar" que señalar.
  const [abierto, setAbierto] = useState(estado !== "CERRADA");

  if (editando) {
    return (
      <li>
        <FormularioCrearExamen
          cursoId={cursoId}
          tipo={tipo}
          examenExistente={{
            id: examen.id,
            titulo: examen.titulo,
            instrucciones: examen.instrucciones,
            fecha_apertura: examen.fecha_apertura,
            fecha_cierre: examen.fecha_cierre,
            preguntas,
            intentosPermitidos: examen.intentos_permitidos,
          }}
          tieneRespuestas={stats.presentados > 0}
          onCancelar={() => setEditando(false)}
        />
      </li>
    );
  }

  if (copiando) {
    return (
      <li>
        <FormularioCopiarActividad
          actividadId={examen.id}
          cursoOrigenId={cursoId}
          otrosCursos={otrosCursos}
          etiqueta={tipo === "TAREA" ? "cuestionario" : "examen"}
          onCancelar={() => setCopiando(false)}
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
  const alternarVisibilidadAction = alternarVisibilidad.bind(
    null,
    cursoId,
    examen.id,
    !examen.visible_estudiantes
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
          {!examen.visible_estudiantes && (
            <span className="badge-oculta shrink-0">Oculta</span>
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
        <p className="font-medium text-ink">{examen.titulo}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {!examen.visible_estudiantes && (
            <span className="badge-oculta">Oculta</span>
          )}
          {(examen.intentos_permitidos ?? 1) > 1 && (
            <span className="inline-block shrink-0 rounded-full bg-verde-bosque/8 px-2.5 py-0.5 text-xs font-medium text-verde-bosque">
              2 intentos
            </span>
          )}
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
        {otrosCursos.length > 0 && (
          <button
            type="button"
            onClick={() => setCopiando(true)}
            className="link-muted"
          >
            Copiar
          </button>
        )}
        <form action={alternarVisibilidadAction}>
          <button type="submit" className="link-muted">
            {examen.visible_estudiantes ? "Ocultar" : "Publicar"}
          </button>
        </form>
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
