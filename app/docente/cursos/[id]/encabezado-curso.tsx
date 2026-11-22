import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BotonTomarAsistencia from "./boton-tomar-asistencia";
import BotonCopiarClave from "./boton-copiar-clave";

// Franja verde a todo lo ancho, igual en las 7 pestañas del curso: deja claro
// en qué curso estás y tiene a la mano lo que se usa en cada clase (la clave
// para quien se inscribe tarde y tomar asistencia). Cada página ya verificó
// que el curso es del docente antes de llegar aquí.
//
// Se sale del padding de <main> (px-4 py-16) con márgenes negativos, para no
// tener que cambiar el contenedor de cada pestaña.
export default async function EncabezadoCurso({
  curso,
}: {
  curso: { id: string; nombre: string; grupo: string; periodo: string; clave_acceso: string };
}) {
  const supabase = await createClient();
  const { count: inscritos } = await supabase
    .from("inscripciones")
    .select("id", { count: "exact", head: true })
    .eq("curso_id", curso.id);
  const totalInscritos = inscritos ?? 0;

  return (
    <header className="-mx-4 -mt-16 self-stretch bg-verde-bosque text-crema">
      <div className="mx-auto box-content flex max-w-4xl flex-col gap-6 px-4 pt-6 pb-8 sm:pt-8 sm:pb-10 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <Link
            href="/docente"
            className="inline-flex min-h-11 w-fit items-center text-sm text-crema/85 underline-offset-4 hover:text-crema hover:underline"
          >
            ‹ Tus cursos
          </Link>
          <h1 className="font-title text-3xl font-semibold leading-tight sm:text-[42px]">
            {curso.nombre}
          </h1>
          <p className="text-base text-crema/85 sm:text-lg">
            Grupo {curso.grupo}, periodo {curso.periodo}.{" "}
            {totalInscritos === 1
              ? "1 estudiante inscrito."
              : `${totalInscritos} estudiantes inscritos.`}
          </p>
          <div className="mt-1 flex w-fit items-center gap-1 rounded-full bg-crema/12 py-0.5 pl-4">
            <span className="text-sm text-crema/85">Clave</span>
            <span className="ml-1 font-mono text-base tracking-wider">{curso.clave_acceso}</span>
            <BotonCopiarClave clave={curso.clave_acceso} />
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:flex-col lg:items-end">
          <BotonTomarAsistencia cursoId={curso.id} variante="franja" />
          <Link
            href={`/docente/cursos/${curso.id}/calificaciones`}
            className="inline-flex min-h-11 items-center justify-center px-2 text-sm font-medium text-crema underline-offset-4 hover:underline"
          >
            Libro de calificaciones
          </Link>
        </div>
      </div>
    </header>
  );
}
