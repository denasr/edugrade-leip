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
    <form ref={formRef} action={formAction} className="card w-full max-w-sm p-6">
      <h2 className="font-title text-xl text-verde-bosque">Crear curso</h2>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Nombre
          <input type="text" name="nombre" required className="input" />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Grupo
          <input type="text" name="grupo" required className="input" />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Periodo
          <input type="text" name="periodo" required className="input" />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Clave de acceso
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

        <button type="submit" disabled={pending} className="btn-primary mt-2">
          {pending ? "Creando…" : "Crear curso"}
        </button>
      </div>
    </form>
  );
}
