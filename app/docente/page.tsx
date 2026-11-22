import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contarPendientesCurso } from "@/lib/pendientes-docente";
import FormularioCurso from "./formulario-curso";

type CursoTarjeta = {
  id: string;
  nombre: string;
  grupo: string;
  periodo: string;
  clave_acceso: string;
  inscripciones: { count: number }[];
  actividades: { count: number }[];
  // Solo en cursos activos: los archivados no cuentan para "por calificar".
  pendientes?: { tareas: number; examenes: number; total: number };
};

export default async function PanelDocente() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (perfil?.rol !== "DOCENTE") redirect("/estudiante");

  const { data: cursos } = await supabase
    .from("cursos")
    .select(
      "id, nombre, grupo, periodo, clave_acceso, archivado_at, inscripciones(count), actividades(count)"
    )
    .eq("docente_id", user.id)
    .order("created_at", { ascending: false });

  // Los archivados salen de la lista principal y del conteo de pendientes;
  // se ven aparte, plegados, al final del panel.
  const cursosArchivados = (cursos ?? []).filter((c) => c.archivado_at);

  // Mismo conteo que el número de la franja de pestañas dentro de cada curso
  // (contarPendientesCurso, en lib/pendientes-docente.ts), corrido para todos
  // los cursos activos a la vez: cada tarjeta muestra cuántas entregas
  // esperan calificación sin tener que entrar al curso.
  const cursosActivos: CursoTarjeta[] = await Promise.all(
    (cursos ?? [])
      .filter((c) => !c.archivado_at)
      .map(async (curso) => {
        const { tareas, examenes } = await contarPendientesCurso(supabase, curso.id);
        return { ...curso, pendientes: { tareas, examenes, total: tareas + examenes } };
      })
  );

  const totalPendientes = cursosActivos.reduce(
    (suma, c) => suma + (c.pendientes?.total ?? 0),
    0
  );
  const cursosConPendientes = cursosActivos.filter(
    (c) => (c.pendientes?.total ?? 0) > 0
  ).length;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10 text-[17px] sm:px-8 sm:py-14 sm:text-lg">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-2.5">
          <h1 className="font-title text-4xl font-semibold leading-tight text-verde-bosque sm:text-5xl">
            Tus cursos
          </h1>
          {cursosActivos.length > 0 && (
            <p className="text-lg text-ink/80 sm:text-xl">
              {totalPendientes === 0
                ? "No tienes entregas por calificar."
                : `Tienes ${totalPendientes} ${totalPendientes === 1 ? "entrega" : "entregas"} por calificar en ${cursosConPendientes} ${cursosConPendientes === 1 ? "curso" : "cursos"}.`}
            </p>
          )}
        </div>
        <FormularioCurso />
      </div>

      {cursosActivos.length === 0 ? (
        <p className="text-ink/75">
          {cursosArchivados.length > 0
            ? "No tienes cursos activos. Crea uno nuevo o abre uno archivado."
            : "Todavía no has creado ningún curso. Usa “+ Nuevo curso” para empezar."}
        </p>
      ) : (
        <ListaCursos cursos={cursosActivos} />
      )}

      {cursosArchivados.length > 0 && (
        <details className="text-ink/75">
          <summary className="flex min-h-11 cursor-pointer items-center">
            Cursos archivados ({cursosArchivados.length})
          </summary>
          <div className="mt-4">
            <ListaCursos cursos={cursosArchivados} />
          </div>
        </details>
      )}
    </main>
  );
}

function ListaCursos({ cursos }: { cursos: CursoTarjeta[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
      {cursos.map((curso) => (
        <TarjetaCurso key={curso.id} curso={curso} />
      ))}
    </ul>
  );
}

// Mismo tamaño para "Calificar n" y "Abrir curso"; solo cambia el color.
const botonTarjeta =
  "inline-flex min-h-11 items-center rounded-full border-2 px-5 text-base font-medium transition-colors";

function TarjetaCurso({ curso }: { curso: CursoTarjeta }) {
  const inscritos = curso.inscripciones[0]?.count ?? 0;
  const actividades = curso.actividades[0]?.count ?? 0;
  const pendientes = curso.pendientes;
  const hayPendientes = (pendientes?.total ?? 0) > 0;
  const enlaceCurso = `/docente/cursos/${curso.id}`;

  return (
    <li className="flex min-w-0 flex-col gap-5 rounded-2xl border border-verde-bosque/15 bg-superficie p-6 sm:gap-6 sm:p-7">
      <div className="flex flex-col gap-1">
        <Link
          href={enlaceCurso}
          className="font-title text-2xl font-semibold leading-snug text-ink hover:text-verde-bosque hover:underline sm:text-[26px]"
        >
          {curso.nombre}
        </Link>
        <p className="text-base text-ink/75 sm:text-[17px]">
          {/* Hay grupos escritos como "Grupo I": no repetir la palabra. */}
          {/^grupo\b/i.test(curso.grupo) ? curso.grupo : `Grupo ${curso.grupo}`}, periodo{" "}
          {curso.periodo}
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-2 sm:flex sm:gap-8">
        <Dato valor={inscritos} etiqueta="inscritos" />
        <Dato valor={actividades} etiqueta="actividades" />
        {pendientes && (
          <Dato valor={pendientes.total} etiqueta="por calificar" resaltado={hayPendientes} />
        )}
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-verde-bosque/12 pt-4 sm:pt-5">
        <span className="inline-flex items-center gap-2 text-sm text-ink/75 sm:text-[15px]">
          Clave <span className="clave-acceso">{curso.clave_acceso}</span>
        </span>
        {hayPendientes && pendientes ? (
          <Link
            href={`${enlaceCurso}/${pendientes.tareas > 0 ? "tareas" : "examenes"}`}
            className={`${botonTarjeta} border-terracota text-terracota hover:bg-terracota/5`}
          >
            Calificar {pendientes.total}
          </Link>
        ) : (
          <Link
            href={enlaceCurso}
            className={`${botonTarjeta} border-verde-bosque text-verde-bosque hover:bg-verde-bosque/10`}
          >
            Abrir curso
          </Link>
        )}
      </div>
    </li>
  );
}

function Dato({
  valor,
  etiqueta,
  resaltado = false,
}: {
  valor: number;
  etiqueta: string;
  resaltado?: boolean;
}) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-sm text-ink/75 sm:text-[15px]">{etiqueta}</dt>
      <dd
        className={`text-[26px] font-semibold leading-tight tabular-nums sm:text-3xl ${resaltado ? "text-terracota" : "text-ink"}`}
      >
        {valor}
      </dd>
    </div>
  );
}
