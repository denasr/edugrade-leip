"use client";

import { useFormStatus } from "react-dom";
import { cambiarArchivadoCurso } from "./actions";

function BotonEnviar({ archivado }: { archivado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (
          !archivado &&
          !confirm(
            "El curso saldrá de tu lista principal y pasará a \"Cursos archivados\". Lo podrás seguir abriendo y editando, y desarchivarlo cuando quieras. Ya no aceptará inscripciones nuevas. ¿Continuar?"
          )
        ) {
          e.preventDefault();
        }
      }}
      className="link-muted w-full justify-center disabled:opacity-50"
    >
      {pending ? "Guardando…" : archivado ? "↺ Desarchivar curso" : "Archivar curso"}
    </button>
  );
}

export default function BotonArchivarCurso({
  cursoId,
  archivado,
}: {
  cursoId: string;
  archivado: boolean;
}) {
  return (
    <form action={cambiarArchivadoCurso.bind(null, cursoId, !archivado)} className="w-full max-w-sm">
      <BotonEnviar archivado={archivado} />
    </form>
  );
}
