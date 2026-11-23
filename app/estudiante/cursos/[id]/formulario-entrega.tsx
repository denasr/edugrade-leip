"use client";

import { useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import {
  cancelarEntrega,
  confirmarArchivosEntrega,
  crearEntrega,
} from "./actions";
import { createClient } from "@/lib/supabase/client";
import { nombreArchivoSeguro } from "@/lib/nombre-archivo";
import { subirConReintentos } from "@/lib/subir-archivo";
import { comprimirImagen } from "@/lib/comprimir-imagen";
import { useToast } from "../../../toast-provider";

// Tipo de archivo por extensión, no por `archivo.type`: ese dato lo pone el
// navegador según el sistema operativo y no es confiable — en Windows sin
// Office un .docx llega con type "", algunos Android reportan "image/jpg"
// (no estándar) o "application/octet-stream" para archivos descargados de
// WhatsApp/Drive. Validar contra `archivo.type` rechazaba archivos válidos
// con "no es un formato permitido", y además ese mismo valor se mandaba
// como contentType a Storage, cuyo bucket también lo rechazaba
// (allowed_mime_types). Aquí se deduce el tipo canónico de la extensión y
// ese es el que se valida y se manda a Storage.
const TIPO_POR_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
};

function tipoDeArchivo(archivo: File): string | null {
  const extension = archivo.name.split(".").pop()?.toLowerCase() ?? "";
  return TIPO_POR_EXTENSION[extension] ?? null;
}
const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;
const TAMANO_MAXIMO_TOTAL_BYTES = 30 * 1024 * 1024;
const MAXIMO_ARCHIVOS = 10;

// Los archivos se suben directo del navegador a Supabase Storage (no pasan
// por ninguna Server Action) porque Vercel impone su propio límite de
// payload (~4.5 MB) a las Serverless Functions, por delante de cualquier
// bodySizeLimit configurado en Next.js — con eso, una sola foto de celular
// ya podía fallar aunque estuviera muy por debajo del límite que esta
// misma pantalla anuncia (10 MB). Ver el comentario en actions.ts.
// Antes todo error de Storage se mostraba como "Revisa tu conexión", aunque
// el motivo real fuera el tamaño o el formato — el estudiante reintentaba
// lo mismo sin saber qué cambiar.
function mensajeErrorSubida(mensaje: string, nombreArchivo: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("exceeded") || m.includes("too large") || m.includes("size")) {
    return `"${nombreArchivo}" supera el máximo de 10 MB.`;
  }
  if (m.includes("mime") || m.includes("type")) {
    return `"${nombreArchivo}" no es un formato permitido. Usa PDF, DOCX, JPG, PNG o HEIC.`;
  }
  if (m.includes("jwt") || m.includes("unauthorized") || m.includes("row-level")) {
    return "Tu sesión expiró. Recarga la página, vuelve a iniciar sesión e intenta de nuevo.";
  }
  return `Se cortó la conexión mientras se subía "${nombreArchivo}". Mantén la pantalla encendida y, si puedes, conéctate a Wi-Fi e intenta de nuevo.`;
}

// Cuánto se espera a que una foto se reduzca antes de darse por vencido y
// subir la original. En un celular con poca memoria, decodificar una foto
// grande puede quedarse colgado sin fallar, y la pantalla se quedaba en
// "Preparando archivos…" sin salida.
const LIMITE_REDUCIR_FOTO_MS = 20_000;

type Rechazo = {
  mensaje: string;
  motivo: "sin-archivos" | "demasiados-archivos" | "formato" | "tamano" | "tamano-total";
};

// Solo extensión y tamaño de cada archivo, nunca su nombre: puede traer el
// nombre del estudiante o del contenido.
function describirArchivos(archivos: File[]) {
  return archivos.map((a) => ({
    extension: a.name.includes(".") ? a.name.split(".").pop()?.toLowerCase() : "(sin extensión)",
    tamanoBytes: a.size,
  }));
}

// Lo que el formulario frena antes de subir nada (formato, tamaño, la tarea
// ya cerró…) se le muestra al estudiante, pero antes no quedaba en ningún
// lado: en Sentry y en los registros de Supabase todo se veía limpio
// mientras los estudiantes reportaban que no podían entregar (23-nov-2026).
// Nivel "warning", no "error": son avisos esperados, no fallas de la app.
function reportarFrenoEntrega(
  etapa: string,
  detalle: Record<string, unknown>,
  archivos: File[]
) {
  Sentry.captureMessage(`Entrega de tarea frenada: ${etapa}`, {
    level: "warning",
    tags: { flujo: "entrega-tarea", etapa, motivo: String(detalle.motivo ?? "") },
    extra: { ...detalle, archivos: describirArchivos(archivos) },
  });
}

async function reducirConLimite(original: File): Promise<File> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const vencido = new Promise<null>((resolve) => {
    temporizador = setTimeout(() => resolve(null), LIMITE_REDUCIR_FOTO_MS);
  });
  const resultado = await Promise.race([comprimirImagen(original), vencido]);
  clearTimeout(temporizador);
  if (resultado === null) {
    reportarFrenoEntrega("reducir-foto-tiempo", { motivo: "tiempo-agotado" }, [original]);
    return original;
  }
  return resultado;
}

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

  function validarArchivos(archivos: File[]): Rechazo | null {
    if (archivos.length === 0) {
      return {
        mensaje: "Adjunta al menos un archivo para entregar la tarea.",
        motivo: "sin-archivos",
      };
    }
    if (archivos.length > MAXIMO_ARCHIVOS) {
      return {
        mensaje: `Puedes adjuntar hasta ${MAXIMO_ARCHIVOS} archivos.`,
        motivo: "demasiados-archivos",
      };
    }

    let total = 0;
    for (const archivo of archivos) {
      if (!tipoDeArchivo(archivo)) {
        return {
          mensaje: `"${archivo.name}" no es un formato permitido. Usa PDF, DOCX, JPG, PNG o HEIC.`,
          motivo: "formato",
        };
      }
      if (archivo.size > TAMANO_MAXIMO_BYTES) {
        return {
          mensaje: `"${archivo.name}" supera el máximo de 10 MB.`,
          motivo: "tamano",
        };
      }
      total += archivo.size;
    }
    if (total > TAMANO_MAXIMO_TOTAL_BYTES) {
      return {
        mensaje: "El total de archivos supera el máximo de 30 MB entre todos.",
        motivo: "tamano-total",
      };
    }
    return null;
  }

  function rechazar(rechazo: Rechazo, archivos: File[]) {
    reportarFrenoEntrega("validacion", { motivo: rechazo.motivo }, archivos);
    setError(rechazo.mensaje);
  }

  async function manejarEnvio(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    // Red de seguridad: cualquier excepción no prevista (p. ej. una Server
    // Action que ya no existe porque se publicó una versión nueva mientras
    // la página seguía abierta) dejaba el botón en "Entregando…" para
    // siempre, sin mensaje.
    try {
      await entregar();
    } catch (errorInesperado) {
      Sentry.captureException(errorInesperado, {
        tags: { flujo: "entrega-tarea", etapa: "inesperado" },
      });
      setError(
        "Algo falló al entregar tu tarea. Recarga la página e intenta de nuevo; si sigue igual, avísale a tu docente."
      );
      setPending(false);
      setProgreso(null);
    }
  }

  async function entregar() {
    const form = formRef.current;
    if (!form) return;

    const input = form.elements.namedItem("archivos") as HTMLInputElement | null;
    const originales = Array.from(input?.files ?? []);
    if (originales.length === 0 || originales.length > MAXIMO_ARCHIVOS) {
      rechazar(validarArchivos(originales)!, originales);
      return;
    }

    const comentario = String(
      (form.elements.namedItem("comentario") as HTMLTextAreaElement | null)
        ?.value ?? ""
    ).trim();

    setError(null);
    setPending(true);

    // Las fotos se reducen antes de validar el tamaño: así una foto de
    // 12 MB que antes se rechazaba ahora entra. Una por una (no en
    // paralelo) para no agotar la memoria de un celular modesto.
    setProgreso("Preparando archivos…");
    const archivos: File[] = [];
    for (const original of originales) {
      archivos.push(await reducirConLimite(original));
    }

    // En Android, un archivo elegido desde WhatsApp, Drive o el gestor de
    // descargas a veces no se puede leer (no está descargado en el teléfono
    // o el permiso ya caducó). El navegador no avisa al elegirlo: la subida
    // falla al instante con "Failed to fetch", igual que un corte de red,
    // y reintentar no sirve (pasó así el 20-nov-2026 con un PDF de 745 KB).
    // Leerlo aquí, antes de registrar la entrega, separa ese caso y deja
    // subir una copia en memoria que ya no depende del archivo de origen.
    for (let i = 0; i < archivos.length; i++) {
      try {
        const datos = await archivos[i].arrayBuffer();
        archivos[i] = new File([datos], archivos[i].name, {
          type: archivos[i].type,
          lastModified: archivos[i].lastModified,
        });
      } catch (errorLectura) {
        Sentry.captureException(errorLectura, {
          tags: { flujo: "entrega-tarea", etapa: "leer-archivo" },
          extra: {
            tamanoBytes: archivos[i].size,
            extension: archivos[i].name.split(".").pop()?.toLowerCase(),
          },
        });
        setError(
          `Tu teléfono no dejó leer "${archivos[i].name}". Si lo elegiste desde WhatsApp, Drive o Descargas, ábrelo primero ahí (o guárdalo en tu teléfono) y vuelve a elegirlo.`
        );
        setPending(false);
        setProgreso(null);
        return;
      }
    }

    const errorValidacion = validarArchivos(archivos);
    if (errorValidacion) {
      rechazar(errorValidacion, archivos);
      setPending(false);
      setProgreso(null);
      return;
    }

    setProgreso("Registrando entrega…");

    const resultadoEntrega = await crearEntrega(actividadId, comentario);
    if (resultadoEntrega.error || !resultadoEntrega.entregaId) {
      // Los mensajes de crearEntrega son fijos ("Ya entregaste esta
      // tarea.", "Tu sesión expiró…"), sin datos del estudiante.
      reportarFrenoEntrega(
        "crear-entrega",
        { motivo: resultadoEntrega.error ?? "sin-entregaId" },
        archivos
      );
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
      const { error: errorSubida } = await subirConReintentos(
        supabase,
        "archivos-entrega",
        storagePath,
        archivo,
        tipoDeArchivo(archivo)!
      );

      if (errorSubida) {
        console.error("Error al subir archivo de entrega:", errorSubida);
        // Sin esto una subida fallida no dejaba ningún rastro: ocurre en el
        // navegador, y Sentry solo captura excepciones no manejadas.
        Sentry.captureException(errorSubida, {
          tags: { flujo: "entrega-tarea" },
          extra: {
            tipoNavegador: archivo.type,
            tamanoBytes: archivo.size,
            extension: archivo.name.split(".").pop()?.toLowerCase(),
          },
        });
        if (subidas.length > 0) {
          await supabase.storage
            .from("archivos-entrega")
            .remove(subidas.map((s) => s.storagePath));
        }
        await cancelarEntrega(entregaId);
        setError(mensajeErrorSubida(errorSubida.message, archivo.name));
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
      reportarFrenoEntrega("confirmar-archivos", { motivo: resultadoFinal.error }, archivos);
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
