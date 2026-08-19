import { File, FileImage, FileText, FileType } from "lucide-react";

const IMAGENES = ["jpg", "jpeg", "png"];

export function IconoArchivo({
  nombreArchivo,
  className = "h-4 w-4 shrink-0 text-verde-bosque/70",
}: {
  nombreArchivo: string;
  className?: string;
}) {
  const extension = nombreArchivo.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    return <FileText className={className} aria-hidden="true" />;
  }
  if (extension === "docx") {
    return <FileType className={className} aria-hidden="true" />;
  }
  if (extension && IMAGENES.includes(extension)) {
    return <FileImage className={className} aria-hidden="true" />;
  }
  return <File className={className} aria-hidden="true" />;
}
