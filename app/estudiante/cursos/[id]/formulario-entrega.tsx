"use client";

import { useRef, useState } from "react";
import {
  cancelarEntrega,
  confirmarArchivosEntrega,
  crearEntrega,
} from "./actions";
import { createClient } from "@/lib/supabase/client";
import { nombreArchivoSeguro } from "@/lib/nombre-archivo";
import { useToast } from "../../../toast-provider";

const TIPOS_PERMITIDOS = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
];
const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;
const TAMANO_MAXIMO_TOTAL_BYTES = 30 * 1024 * 1024;
const MAXIMO_ARCHIVOS = 10;

// Los archivos se suben directo del navegador a Supabase Storage (no pasan
// por ninguna Server Action) porque Vercel impone su propio límite de
// payload (~4.5 MB) a las Serverless Functions, por delante de cualquier
// bodySizeLimit configurado en Next.js — con eso, una sola foto de celular
// ya podía fallar aunque estuviera muy por debajo del límite que esta
// misma pantalla anuncia (10 MB). Ver el comentario en actions.ts.
export default function FormularioEntrega({
  actividadId,
  cursoId,
}: {
  actividadId: string;
  cursoId: string;
}) {
  const { mostrar } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function validarArchivos(archivos: FileList): string | null {
    if (archivos.length === 0) {
      return "Adjunta al menos un archivo para entregar la tarea.";
    }
    if (archivos.length > MAXIMO_ARCHIVOS) {
      return `Puedes adjuntar hasta ${MAXIMO_ARCHIVOS} archivos.`;
    }

    let total = 0;
    for (const archivo of archivos) {
      if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
        return `"${archivo.name}" no es un formato permitido. Usa PDF, DOCX, JPG, PNG o HEIC.`;
      }
      if (archivo.size > TAMANO_MAXIMO_BYTES) {
        return `"${archivo.name}" supera el máximo de 10 MB.`;
      }
      total += archivo.size;
    }
    if (total > TAMANO_MAXIMO_TOTAL_BYTES) {
      return "El total de archivos supera el máximo de 30 MB entre todos.";
    }
    return null;
  }

  async function manejarEnvio(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    const form = formRef.current;
    if (!form) return;

    const input = form.elements.namedItem("archivos") as HTMLInputElement | null;
    const archivos = input?.files;
    if (!archivos) return;

    const errorValidacion = validarArchivos(archivos);
    if (errorValidacion) {
      setError(errorValidacion);
      return;
    }

    const comentario = String(
      (form.elements.namedItem("comentario") as HTMLTextAreaElement | null)
        ?.value ?? ""
    ).trim();

    setError(null);
    setPending(true);
    setProgreso("Registrando entrega…");

    const resultadoEntrega = await crearEntrega(actividadId, comentario);
    if (resultadoEntrega.error || !resultadoEntrega.entregaId) {
      setError(resultadoEntrega.error ?? "No se pudo registrar la entrega.");
      setPending(false);
      setProgreso(null);
      return;
    }
    const entregaId = resultadoEntrega.entregaId;

    // entregaId (uuid) como carpeta ya evita colisiones entre estudiantes;
    // el índice al frente evita que dos fotos con el mismo nombre de origen
    // (común en fotos de celular, ej. "IMG_1234.jpg" repetido) se pisen
    // entre sí dentro de la misma entrega. El nombre en sí necesita
    // sanearse porque Supabase Storage rechaza ciertos caracteres (espacios,
    // acentos, paréntesis) con "Invalid key".
    const supabase = createClient();
    const subidas: { storagePath: string; nombreArchivo: string; tamanoBytes: number }[] = [];
    let indice = 0;
    for (const archivo of archivos) {
      setProgreso(
        archivos.length > 1
          ? `Subiendo archivo ${indice + 1} de ${archivos.length}…`
          : "Subiendo archivo…"
      );
      const storagePath = `${entregaId}/${indice}-${nombreArchivoSeguro(archivo.name)}`;
      const { error: errorSubida } = await supabase.storage
        .from("archivos-entrega")
        .upload(storagePath, archivo, { contentType: archivo.type });

      if (errorSubida) {
        console.error("Error al subir archivo de entrega:", errorSubida);
        if (subidas.length > 0) {
          await supabase.storage
            .from("archivos-entrega")
            .remove(subidas.map((s) => s.storagePath));
        }
        await cancelarEntrega(entregaId);
        setError("No se pudo subir el archivo. Revisa tu conexión e intenta de nuevo.");
        setPending(false);
        setProgreso(null);
        return;
      }

      subidas.push({
        storagePath,
        nombreArchivo: archivo.name,
        tamanoBytes: archivo.size,
      });
      indice++;
    }

    setProgreso("Finalizando entrega…");
    const resultadoFinal = await confirmarArchivosEntrega(
      entregaId,
      cursoId,
      subidas
    );
    setPending(false);
    setProgreso(null);

    if (resultadoFinal.error) {
      setError(resultadoFinal.error);
      return;
    }

    setError(null);
    form.reset();
    mostrar("Tarea entregada.");
  }

  return (
    <form
      ref={formRef}
      onSubmit={manejarEnvio}
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

      {error && <p className="text-sm text-terracota">{error}</p>}
      {pending && progreso && (
        <p className="text-sm text-ink/70">{progreso}</p>
      )}

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
