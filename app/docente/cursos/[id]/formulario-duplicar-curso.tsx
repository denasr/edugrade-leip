"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { generarClaveAcceso } from "@/lib/clave-acceso";
import { duplicarCurso, type EstadoDuplicarCurso } from "./actions";
import { useToast } from "../../../toast-provider";

const estadoInicial: EstadoDuplicarCurso = { error: null };

export default function FormularioDuplicarCurso({
  cursoId,
  curso,
  totalActividades,
}: {
  cursoId: string;
  curso: { nombre: string; grupo: string; periodo: string };
  totalActividades: number;
}) {
  const { mostrar } = useToast();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [claveAcceso, setClaveAcceso] = useState("");

  async function duplicarConAviso(
    prevState: EstadoDuplicarCurso,
    formData: FormData
  ): Promise<EstadoDuplicarCurso> {
    const resultado = await duplicarCurso(cursoId, prevState, formData);
    if (!resultado.error && resultado.nuevoCursoId) {
      mostrar("Curso duplicado. Sus actividades están ocultas hasta que las publiques.");
      router.push(`/docente/cursos/${resultado.nuevoCursoId}/tareas`);
    }
    return resultado;
  }

  const [state, formAction, pending] = useActionState(duplicarConAviso, estadoInicial);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => {
          // La clave se genera al abrir (no en el render) para no chocar con
          // el HTML del servidor durante la hidratación.
          setClaveAcceso(generarClaveAcceso());
          setAbierto(true);
        }}
        className="link-muted w-full max-w-sm justify-center"
      >
        Duplicar curso para otro grupo o semestre
      </button>
    );
  }

  return (
    <form action={formAction} className="card w-full max-w-sm p-6">
      <h2 className="font-title text-xl text-verde-bosque">Duplicar curso</h2>
      <p className="mt-1 text-sm text-ink/70">
        {totalActividades === 0 ? (
          "Se crea un curso nuevo con la misma ponderación. Este curso todavía no tiene tareas ni exámenes que copiar."
        ) : (
          <>
            Se crea un curso nuevo con la misma ponderación y{" "}
            {totalActividades === 1
              ? "su única actividad"
              : `sus ${totalActividades} tareas y exámenes`}{" "}
            (con preguntas y material). Se copian <strong>ocultas y con sus
            fechas originales</strong>: ajusta la fecha de cada una y publícala
            cuando esté lista.
          </>
        )}{" "}
        No se copian estudiantes, entregas, asistencia ni anuncios.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Nombre
          <input type="text" name="nombre" required defaultValue={curso.nombre} className="input" />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Grupo
          <input type="text" name="grupo" required defaultValue={curso.grupo} className="input" />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Periodo
          <input
            type="text"
            name="periodo"
            required
            placeholder={`El de este curso: ${curso.periodo}`}
            className="input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Clave de acceso nueva
          <input
            type="text"
            name="clave_acceso"
            required
            value={claveAcceso}
            onChange={(e) => setClaveAcceso(e.target.value.toUpperCase())}
            className="input font-mono tracking-wide"
          />
        </label>

        {state.error && <p className="text-sm text-terracota">{state.error}</p>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Duplicando…" : "Duplicar curso"}
          </button>
          <button type="button" onClick={() => setAbierto(false)} className="link-muted">
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}
