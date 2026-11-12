import { ExternalLink } from "lucide-react";
import { IconoArchivo } from "@/lib/icono-archivo";
import TextoConEnlaces from "@/lib/texto-con-enlaces";
import { dominioDeUrl, tamanoLegible, type Recurso } from "@/lib/recursos";

// Cómo se ve un recurso, igual para el docente y el estudiante. Un archivo
// abre por /recursos/[id], que firma un enlace nuevo en cada clic (los
// enlaces firmados vencen y la página puede llevar horas abierta); un enlace
// abre directo en otra pestaña.
export default function ItemRecurso({ recurso }: { recurso: Recurso }) {
  const esEnlace = recurso.tipo === "ENLACE";
  const href = esEnlace ? recurso.url! : `/recursos/${recurso.id}`;
  const detalle = esEnlace
    ? dominioDeUrl(recurso.url!)
    : [recurso.nombre_archivo?.split(".").pop()?.toUpperCase(), tamanoLegible(recurso.tamano_bytes)]
        .filter(Boolean)
        .join(" · ");

  return (
    <div className="min-w-0">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start gap-2 text-sm font-medium text-verde-bosque hover:underline"
      >
        {esEnlace ? (
          <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-verde-bosque/70" aria-hidden="true" />
        ) : (
          <span className="mt-0.5">
            <IconoArchivo nombreArchivo={recurso.nombre_archivo ?? ""} />
          </span>
        )}
        <span className="break-words">{recurso.titulo}</span>
      </a>
      {detalle && <p className="ml-6 text-xs text-ink/70">{detalle}</p>}
      {recurso.descripcion && (
        <p className="ml-6 mt-1 whitespace-pre-wrap break-words text-sm text-ink/80">
          <TextoConEnlaces texto={recurso.descripcion} />
        </p>
      )}
    </div>
  );
}
