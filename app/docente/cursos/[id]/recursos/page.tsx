import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contarPendientesCurso } from "@/lib/pendientes-docente";
import {
  COLUMNAS_RECURSO,
  COLUMNAS_UNIDAD,
  agruparPorUnidad,
  type Recurso,
  type Unidad,
} from "@/lib/recursos";
import EncabezadoCurso from "../encabezado-curso";
import FranjaPestanas from "../franja-pestanas";
import FormularioUnidad from "./formulario-unidad";
import TarjetaUnidad from "./tarjeta-unidad";

export default async function RecursosCurso({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const { data: curso } = await supabase
    .from("cursos")
    .select("id, nombre, grupo, periodo, clave_acceso")
    .eq("id", id)
    .eq("docente_id", user.id)
    .single();

  if (!curso) redirect("/docente");

  const [pendientes, { data: unidades }, { data: recursos }] = await Promise.all([
    contarPendientesCurso(supabase, id),
    supabase.from("unidades_recursos").select(COLUMNAS_UNIDAD).eq("curso_id", id) as unknown as Promise<{
      data: Unidad[] | null;
    }>,
    supabase.from("recursos_curso").select(COLUMNAS_RECURSO).eq("curso_id", id) as unknown as Promise<{
      data: Recurso[] | null;
    }>,
  ]);

  const agrupadas = agruparPorUnidad(unidades ?? [], recursos ?? []);
  const opcionesUnidad = agrupadas.map((u) => ({ id: u.id, titulo: u.titulo }));

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-4 py-16">
      <EncabezadoCurso curso={curso} />
      <FranjaPestanas cursoId={curso.id} activa="recursos" pendientes={pendientes} />

      <section className="flex w-full max-w-sm flex-col gap-4">
        {agrupadas.length === 0 ? (
          <p className="text-sm text-ink/70">
            Aquí puedes compartir lecturas, presentaciones, imágenes y enlaces con tu grupo,
            organizados por unidad. Empieza creando la primera unidad.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {agrupadas.map((unidad, i) => (
              <TarjetaUnidad
                key={unidad.id}
                cursoId={curso.id}
                unidad={unidad}
                unidades={opcionesUnidad}
                esPrimera={i === 0}
                esUltima={i === agrupadas.length - 1}
              />
            ))}
          </ul>
        )}

        <FormularioUnidad cursoId={curso.id} />
      </section>
    </main>
  );
}
