"use client";

import { useActionState } from "react";
import { copiarActividad, type EstadoActividad } from "./actions";
import { useToast } from "../../../toast-provider";

type CursoOpcion = {
  id: string;
  nombre: string;
  grupo: string;
  periodo: string;
};

const estadoInicial: EstadoActividad = { error: null };

// "tarea" es la única femenina de las tres etiquetas posibles — el resto
// de este formulario (el título "Copiar {etiqueta} a otro curso") no
// necesita concordancia de género, pero el participio del aviso sí.
const PARTICIPIO: Record<string, string> = {
  tarea: "copiada",
  examen: "copiado",
  cuestionario: "copiado",
};

export default function FormularioCopiarActividad({
  actividadId,
  cursoOrigenId,
  otrosCursos,
  etiqueta,
  onCancelar,
}: {
  actividadId: string;
  cursoOrigenId: string;
  otrosCursos: CursoOpcion[];
  // "tarea" | "cuestionario" | "examen" — para el mensaje de éxito.
  etiqueta: string;
  onCancelar: () => void;
}) {
  const { mostrar } = useToast();

  async function copiarConAviso(
    prevState: EstadoActividad,
    formData: FormData
  ): Promise<EstadoActividad> {
    const resultado = await copiarActividad(
      actividadId,
      cursoOrigenId,
      prevState,
      formData
    );
    if (!resultado.error) {
      const participio = PARTICIPIO[etiqueta] ?? "copiado";
      mostrar(`${etiqueta[0].toUpperCase()}${etiqueta.slice(1)} ${participio} a otro curso.`);
      onCancelar();
    }
    return resultado;
  }

  const [state, formAction, pending] = useActionState(
    copiarConAviso,
    estadoInicial
  );

  return (
    <form action={formAction} className="card w-full max-w-sm p-6">
      <h2 className="font-title text-xl text-verde-bosque">
        Copiar {etiqueta} a otro curso
      </h2>
      <p className="mt-1 text-sm text-ink/70">
        Se copian el título, las instrucciones y{" "}
        {etiqueta === "tarea" ? "el material adjunto" : "las preguntas"}.
        La copia queda oculta hasta que la publiques.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Curso destino
          <select name="curso_destino_id" required className="input">
            {otrosCursos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} · {c.grupo} · {c.periodo}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Fecha de apertura (opcional)
          <input type="datetime-local" name="fecha_apertura" className="input" />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Fecha de cierre
          <input type="datetime-local" name="fecha_cierre" required className="input" />
        </label>

        {state.error && <p className="text-sm text-terracota">{state.error}</p>}

        <div className="mt-2 flex items-center gap-3">
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Copiando…" : "Copiar"}
          </button>
          <button type="button" onClick={onCancelar} className="link-muted">
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}
