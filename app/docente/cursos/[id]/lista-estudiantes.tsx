"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import ModalEliminarEstudiante from "./modal-eliminar-estudiante";
import { eliminarEstudianteDeCurso } from "./actions";

type Estudiante = { id: string; nombre_completo: string; correo: string };

export default function ListaEstudiantes({
  cursoId,
  estudiantes,
}: {
  cursoId: string;
  estudiantes: Estudiante[];
}) {
  // Colapsado por default: es información de consulta ocasional, no la
  // acción principal de esta pantalla — igual que la Configuración de
  // ponderación de abajo.
  const [abierto, setAbierto] = useState(false);

  return (
    <section className="w-full max-w-sm">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-2"
        aria-expanded={abierto}
      >
        <h2 className="font-title text-xl text-verde-bosque">
          Estudiantes inscritos ({estudiantes.length})
        </h2>
        <ChevronDown
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 text-verde-bosque transition-transform ${
            abierto ? "rotate-180" : ""
          }`}
        />
      </button>

      {abierto &&
        (estudiantes.length === 0 ? (
          <p className="mt-4 text-sm text-ink/70">
            Todavía no hay estudiantes inscritos en este curso.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {estudiantes.map((estudiante) => (
              <li
                key={estudiante.id}
                className="card flex items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">
                    {estudiante.nombre_completo}
                  </p>
                  <p className="truncate text-sm text-ink/70">
                    {estudiante.correo}
                  </p>
                </div>
                <ModalEliminarEstudiante
                  accion={eliminarEstudianteDeCurso.bind(
                    null,
                    cursoId,
                    estudiante.id
                  )}
                  nombreCompleto={estudiante.nombre_completo}
                />
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
