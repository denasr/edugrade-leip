import { IconoArchivo } from "@/lib/icono-archivo";
import type { TipoVistaPrevia } from "@/lib/vista-previa-archivo";

export type ArchivoParaRevision = {
  nombreArchivo: string;
  enlace: string | null;
  tipo: TipoVistaPrevia;
  // Solo para .docx: el documento ya convertido a HTML (null si no se pudo).
  html: string | null;
};

// Estilos mínimos para el .docx convertido, que vive en un iframe aislado
// y no hereda nada de la página.
const ESTILOS_DOCX = `
  body { font-family: Georgia, "Times New Roman", serif; line-height: 1.5;
         color: #1f1f1f; margin: 0; padding: 24px; max-width: 760px; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; }
  td, th { border: 1px solid #ccc; padding: 4px 8px; }
`;

export default function VistaPreviaEntrega({ archivo }: { archivo: ArchivoParaRevision }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-verde-bosque/15 px-4 py-2">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-ink">
          <IconoArchivo nombreArchivo={archivo.nombreArchivo} />
          <span className="truncate">{archivo.nombreArchivo}</span>
        </p>
        {archivo.enlace && (
          <a
            href={archivo.enlace}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-sm font-medium text-verde-bosque hover:underline"
          >
            Abrir aparte
          </a>
        )}
      </div>

      <Contenido archivo={archivo} />
    </div>
  );
}

function Contenido({ archivo }: { archivo: ArchivoParaRevision }) {
  if (!archivo.enlace) {
    return (
      <p className="p-4 text-sm text-terracota">
        No se pudo cargar este archivo. Recarga la página para intentarlo de nuevo.
      </p>
    );
  }

  if (archivo.tipo === "pdf") {
    return (
      <>
        <iframe
          src={archivo.enlace}
          title={archivo.nombreArchivo}
          className="hidden h-[75vh] w-full bg-white sm:block"
        />
        {/* Los navegadores de celular no muestran un PDF dentro de la página. */}
        <p className="p-4 text-sm text-ink/70 sm:hidden">
          En el celular el PDF se abre aparte: usa &quot;Abrir aparte&quot;.
        </p>
      </>
    );
  }

  if (archivo.tipo === "imagen") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, temporal; next/image no aplica
      <img src={archivo.enlace} alt={archivo.nombreArchivo} className="w-full bg-white" />
    );
  }

  if (archivo.tipo === "docx" && archivo.html) {
    return (
      <>
        <iframe
          // sandbox vacío: sin scripts, sin formularios, sin navegar la página.
          sandbox=""
          srcDoc={`<!doctype html><meta charset="utf-8"><style>${ESTILOS_DOCX}</style>${archivo.html}`}
          title={archivo.nombreArchivo}
          className="h-[75vh] w-full bg-white"
        />
        <p className="border-t border-verde-bosque/15 px-4 py-2 text-xs text-ink/70">
          Vista aproximada del Word: el formato exacto (márgenes, fuentes) puede
          variar. Usa &quot;Abrir aparte&quot; para ver el original.
        </p>
      </>
    );
  }

  return (
    <p className="p-4 text-sm text-ink/70">
      Este archivo no se puede mostrar aquí. Usa &quot;Abrir aparte&quot; para
      descargarlo.
    </p>
  );
}
