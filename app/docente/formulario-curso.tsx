"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { crearCurso, type EstadoCrearCurso } from "./actions";

function generarClaveAcceso() {
  // sin 0/O ni 1/I/L, para que no se confundan al copiarla a mano
  const alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let clave = "";
  for (let i = 0; i < 6; i++) {
    clave += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  }
  return clave;
}

const estadoInicial: EstadoCrearCurso = { error: null };

export default function FormularioCurso() {
  const [state, formAction, pending] = useActionState(
    crearCurso,
    estadoInicial
  );
  const [claveAcceso, setClaveAcceso] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const primerRender = useRef(true);

  // Generada en el cliente para no chocar con el HTML del server durante la
  // hidratación (Math.random() daría valores distintos en cada lado).
  useEffect(() => {
    setClaveAcceso(generarClaveAcceso());
  }, []);

  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    if (!pending && state.error === null) {
      formRef.current?.reset();
      setClaveAcceso(generarClaveAcceso());
    }
  }, [state, pending]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="w-full max-w-sm rounded-lg border border-zinc-200 p-6 dark:border-zinc-800"
    >
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Crear curso
      </h2>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Nombre
          <input
            type="text"
            name="nombre"
            required
            className="rounded border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Grupo
          <input
            type="text"
            name="grupo"
            required
            className="rounded border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Periodo
          <input
            type="text"
            name="periodo"
            required
            className="rounded border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Clave de acceso
          <input
            type="text"
            name="clave_acceso"
            required
            value={claveAcceso}
            onChange={(e) => setClaveAcceso(e.target.value.toUpperCase())}
            className="rounded border border-zinc-300 px-3 py-2 font-mono text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        {state.error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {pending ? "Creando…" : "Crear curso"}
        </button>
      </div>
    </form>
  );
}
