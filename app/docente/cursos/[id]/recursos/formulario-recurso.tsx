"use client";

import { useRef, useState, type FormEvent } from "react";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/client";
import { nombreArchivoSeguro } from "@/lib/nombre-archivo";
import { subirConReintentos } from "@/lib/subir-archivo";
import {
  ACCEPT_RECURSOS,
  BUCKET_RECURSOS,
  FORMATOS_RECURSOS_TEXTO,
  LARGO_MAXIMO_DESCRIPCION,
  LARGO_MAXIMO_TITULO,
  TAMANO_MAXIMO_RECURSO_BYTES,
  tipoDeArchivoRecurso,
  type Recurso,
} from "@/lib/recursos";
import { crearEnlace, editarRecurso, registrarArchivoRecurso } from "./actions";
import { useToast } from "../../../../toast-provider";

// Agregar un recurso a una unidad (archivo o enlace), o editar uno existente
// (`recursoExistente`: título, descripción, dirección del enlace y unidad).
// Todo controlado y con onSubmit (no `action`): así un error no borra lo
// escrito. El archivo se sube directo del navegador a Storage — una
// presentación pasa fácil del límite de ~4.5 MB que Vercel pone a una
// Server Action — y solo después se registra con registrarArchivoRecurso.
export default function FormularioRecurso({
  cursoId,
  unidadId,
  unidades,
  recursoExistente,
  alTerminar,
}: {
  cursoId: string;
  unidadId: string;
  unidades?: { id: string; titulo: string }[];
  recursoExistente?: Recurso;
  alTerminar: () => void;
}) {
  const { mostrar } = useToast();
  const editando = Boolean(recursoExistente);
  const inputArchivo = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<"ARCHIVO" | "ENLACE">(recursoExistente?.tipo ?? "ARCHIVO");
  const [titulo, setTitulo] = useState(recursoExistente?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(recursoExistente?.descripcion ?? "");
  const [url, setUrl] = useState(recursoExistente?.url ?? "");
  const [unidadDestino, setUnidadDestino] = useState(recursoExistente?.unidad_id ?? unidadId);
  const [ocultar, setOcultar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function datosFormulario() {
    const fd = new FormData();
    fd.set("titulo", titulo);
    fd.set("descripcion", descripcion);
    fd.set("url", url);
    fd.set("unidad_id", unidadDestino);
    if (ocultar) fd.set("ocultar", "on");
    return fd;
  }

  async function subirArchivo(): Promise<string | null> {
    const archivo = inputArchivo.current?.files?.[0];
    if (!archivo) return "Elige un archivo.";
    const contentType = tipoDeArchivoRecurso(archivo.name);
    if (!contentType) {
      return `"${archivo.name}" no es un formato permitido. Usa ${FORMATOS_RECURSOS_TEXTO}.`;
    }
    if (archivo.size > TAMANO_MAXIMO_RECURSO_BYTES) {
      return `"${archivo.name}" supera el máximo de 25 MB.`;
    }

    setProgreso("Subiendo archivo…");
    const supabase = createClient();
    // Un uuid por recurso: dos archivos con el mismo nombre no se pisan, y
    // un reintento que choque con "ya existe" es este mismo archivo.
    const storagePath = `${cursoId}/${crypto.randomUUID()}/${nombreArchivoSeguro(archivo.name)}`;
    const { error: errorSubida } = await subirConReintentos(
      supabase,
      BUCKET_RECURSOS,
      storagePath,
      archivo,
      contentType
    );
    if (errorSubida) {
      Sentry.captureException(errorSubida, {
        tags: { flujo: "recurso-curso" },
        extra: { tamanoBytes: archivo.size, extension: archivo.name.split(".").pop() },
      });
      return "No se pudo subir el archivo. Revisa tu conexión e intenta de nuevo.";
    }

    setProgreso("Guardando…");
    const resultado = await registrarArchivoRecurso(cursoId, {
      unidadId,
      titulo,
      descripcion,
      ocultar,
      storagePath,
      nombreArchivo: archivo.name,
      tamanoBytes: archivo.size,
    });
    return resultado.error;
  }

  async function manejarEnvio(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);

    let mensajeError: string | null;
    if (recursoExistente) {
      mensajeError = (
        await editarRecurso(cursoId, recursoExistente.id, { error: null }, datosFormulario())
      ).error;
    } else if (tipo === "ENLACE") {
      mensajeError = (await crearEnlace(cursoId, unidadId, { error: null }, datosFormulario()))
        .error;
    } else {
      mensajeError = await subirArchivo();
    }

    setPending(false);
    setProgreso(null);
    if (mensajeError) {
      setError(mensajeError);
      return;
    }
    mostrar(editando ? "Recurso actualizado." : "Recurso agregado.");
    alTerminar();
  }

  const esEnlace = tipo === "ENLACE";

  return (
    <form onSubmit={manejarEnvio} className="mt-3 flex flex-col gap-3 border-t border-verde-bosque/15 pt-3">
      {!editando && (
        <fieldset className="flex gap-4 text-sm text-ink/80">
          <legend className="sr-only">Tipo de recurso</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="tipo"
              checked={!esEnlace}
              onChange={() => setTipo("ARCHIVO")}
              className="h-4 w-4 accent-verde-bosque"
            />
            Archivo
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="tipo"
              checked={esEnlace}
              onChange={() => setTipo("ENLACE")}
              className="h-4 w-4 accent-verde-bosque"
            />
            Enlace
          </label>
        </fieldset>
      )}

      {!editando && !esEnlace && (
        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Archivo
          <input
            ref={inputArchivo}
            type="file"
            name="archivo"
            required
            accept={ACCEPT_RECURSOS}
            onChange={(e) => {
              const nombre = e.target.files?.[0]?.name;
              if (nombre && !titulo.trim()) setTitulo(nombre.replace(/\.[^.]+$/, ""));
            }}
            className="text-sm text-ink/70 file:mr-3 file:rounded-full file:border-0 file:bg-verde-bosque/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-verde-bosque"
          />
          <span className="text-xs text-ink/70">{FORMATOS_RECURSOS_TEXTO}. Hasta 25 MB.</span>
        </label>
      )}

      {esEnlace && (
        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Dirección del enlace
          <input
            name="url"
            type="text"
            inputMode="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/…"
            className="input"
          />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm text-ink/80">
        Título
        <input
          name="titulo"
          required={esEnlace || editando}
          maxLength={LARGO_MAXIMO_TITULO}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          className="input"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink/80">
        Descripción (opcional)
        <textarea
          name="descripcion"
          rows={2}
          maxLength={LARGO_MAXIMO_DESCRIPCION}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="input"
        />
      </label>

      {editando && unidades && unidades.length > 1 && (
        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Unidad
          <select
            name="unidad_id"
            value={unidadDestino}
            onChange={(e) => setUnidadDestino(e.target.value)}
            className="input"
          >
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.titulo}
              </option>
            ))}
          </select>
        </label>
      )}

      {!editando && (
        <label className="flex items-center gap-2 text-sm text-ink/80">
          <input
            type="checkbox"
            checked={ocultar}
            onChange={(e) => setOcultar(e.target.checked)}
            className="h-4 w-4 accent-verde-bosque"
          />
          Ocultar a los estudiantes por ahora
        </label>
      )}

      {error && <p className="text-sm text-terracota">{error}</p>}
      {pending && progreso && <p className="text-sm text-ink/70">{progreso}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Guardando…" : editando ? "Guardar" : "Agregar recurso"}
        </button>
        <button type="button" onClick={alTerminar} disabled={pending} className="link-muted">
          Cancelar
        </button>
      </div>
    </form>
  );
}
