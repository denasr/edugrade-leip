"use client";

import { useActionState, useRef } from "react";
import { entregarTarea, type EstadoEntrega } from "./actions";
import { useToast } from "../../../toast-provider";

const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;
const TAMANO_MAXIMO_TOTAL_BYTES = 30 * 1024 * 1024;
const MAXIMO_ARCHIVOS = 10;

const estadoInicial: EstadoEntrega = { error: null };

export default function FormularioEntrega({
  actividadId,
  cursoId,
}: {
  actividadId: string;
  cursoId: string;
}) {
  const { mostrar } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  async function entregarConAviso(
    prevState: EstadoEntrega,
    formData: FormData
  ): Promise<EstadoEntrega> {
    const resultado = await entregarTarea(
      actividadId,
      cursoId,
      prevState,
      formData
    );
    if (!resultado.error) {
      mostrar("Tarea entregada.");
    }
    return resultado;
  }

  const [state, formAction, pending] = useActionState(
    entregarConAviso,
    estadoInicial
  );

  // Mismos límites que entregarTarea, repetidos aquí solo para avisar antes
  // de enviar — la validación real y definitiva sigue siendo la del
  // servidor, esto es nada más para no hacer esperar al envío completo.
  function validarArchivos(e: React.FormEvent<HTMLFormElement>) {
    const input = formRef.current?.elements.namedItem(
      "archivos"
    ) as HTMLInputElement | null;
    const archivos = input?.files;
    if (!archivos || archivos.length === 0) return;

    if (archivos.length > MAXIMO_ARCHIVOS) {
      e.preventDefault();
      alert(`Puedes adjuntar hasta ${MAXIMO_ARCHIVOS} archivos.`);
      return;
    }

    let total = 0;
    for (const archivo of archivos) {
      if (archivo.size > TAMANO_MAXIMO_BYTES) {
        e.preventDefault();
        alert(`"${archivo.name}" supera el máximo de 10 MB.`);
        return;
      }
      total += archivo.size;
    }
    if (total > TAMANO_MAXIMO_TOTAL_BYTES) {
      e.preventDefault();
      alert("El total de archivos supera el máximo de 30 MB entre todos.");
    }
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={validarArchivos}
      className="mt-3 flex flex-col gap-3 border-t border-verde-bosque/15 pt-3"
    >
      <label className="flex flex-col gap-1 text-sm text-ink/80">
        Archivo(s)
        <input
          type="file"
          name="archivos"
          required
          multiple
          accept=".pdf,.docx,.jpg,.jpeg,.png,.heic,.heif"
          // Sin efecto en escritorio (el navegador lo ignora); en un
          // celular le sugiere al navegador abrir la cámara directo en vez
          // de solo el selector de archivos. Con `multiple`, cada toque a
          // la cámara sigue dando una sola foto (así funciona la cámara
          // nativa del navegador), pero el estudiante puede repetir el
          // selector o elegir varias ya tomadas desde su galería en una
          // sola vez — útil para varias hojas de un cuaderno en una misma
          // entrega. No cambia nada del resto del flujo: cada archivo
          // llega como un File normal a entregarTarea.
          capture="environment"
          className="text-sm text-ink/70 file:mr-3 file:rounded-full file:border-0 file:bg-verde-bosque/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-verde-bosque"
        />
        <span className="text-xs text-ink/70">
          PDF, DOCX, JPG, PNG o HEIC. Hasta {MAXIMO_ARCHIVOS} archivos, 10 MB
          cada uno (30 MB en total).
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink/80">
        Comentario (opcional)
        <textarea name="comentario" rows={2} className="input" />
      </label>

      {state.error && <p className="text-sm text-terracota">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary self-start"
      >
        {pending ? "Entregando…" : "Entregar tarea"}
      </button>
    </form>
  );
}
