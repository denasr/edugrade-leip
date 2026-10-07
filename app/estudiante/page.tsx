import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  estadoActividad,
  compararPorCierre,
  textoRelativoCierre,
  cierraPronto,
} from "@/lib/actividades";
import FormularioInscripcion from "./formulario-inscripcion";

// select("cursos(...)") es una relación many-to-one (FK en inscripciones),
// así que Postgrest devuelve un objeto; el tipado por defecto de supabase-js
// (sin generar tipos desde el esquema) lo infiere como arreglo, por eso el cast.
type InscripcionConCurso = {
  id: string;
  cursos: { id: string; nombre: string; grupo: string; periodo: string } | null;
};

// Mismo motivo de cast que arriba — actividades.curso_id → cursos es
// many-to-one.
type ActividadConCurso = {
  id: string;
  titulo: string;
  tipo: "TAREA" | "EXAMEN";
  fecha_apertura: string | null;
  fecha_cierre: string;
  bloqueado_manual: boolean;
  curso_id: string;
  cursos: { nombre: string } | null;
};

export default async function PanelEstudiante() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol, nombre_completo")
    .eq("id", user.id)
    .single();

  if (perfil?.rol !== "ESTUDIANTE") redirect("/docente");

  const { data: inscripciones } = (await supabase
    .from("inscripciones")
    .select("id, cursos(id, nombre, grupo, periodo)")
    .eq("estudiante_id", user.id)
    .order("created_at", { ascending: false })) as {
    data: InscripcionConCurso[] | null;
  };

  // "Pendientes": junta lo abierto y sin entregar de TODOS los cursos en
  // los que está inscrito, para no tener que entrar curso por curso a ver
  // qué falta. No distingue cuestionario de tarea de archivo (ambas son
  // tipo="TAREA") porque para esta vista da igual — las dos son "algo que
  // hacer"; esa distinción ya vive en el detalle de cada curso. Un examen
  // con "2 intentos" ya presentado una vez no cuenta aquí aunque le queden
  // intentos — esta lista es para lo que todavía no se ha tocado, no para
  // sugerir mejorar una nota ya obtenida.
  const cursoIds = (inscripciones ?? [])
    .map((i) => i.cursos?.id)
    .filter((id): id is string => Boolean(id));

  const { data: actividadesCrudas } = (
    cursoIds.length > 0
      ? await supabase
          .from("actividades")
          .select(
            "id, titulo, tipo, fecha_apertura, fecha_cierre, bloqueado_manual, curso_id, cursos(nombre)"
          )
          .in("curso_id", cursoIds)
          .eq("visible_estudiantes", true)
      : { data: [] }
  ) as { data: ActividadConCurso[] | null };

  const actividadIds = (actividadesCrudas ?? []).map((a) => a.id);
  const { data: entregasPropias } =
    actividadIds.length > 0
      ? await supabase
          .from("entregas")
          .select("actividad_id")
          .eq("estudiante_id", user.id)
          .in("actividad_id", actividadIds)
      : { data: [] };
  const idsConEntrega = new Set((entregasPropias ?? []).map((e) => e.actividad_id));

  const pendientes = (actividadesCrudas ?? [])
    .filter((a) => estadoActividad(a) === "ABIERTA" && !idsConEntrega.has(a.id))
    .sort(compararPorCierre);

  return (
    <main className="flex flex-1 flex-col items-center gap-10 px-4 py-16">
      <div className="text-center">
        <h1 className="font-title text-2xl text-verde-bosque">
          Panel del estudiante
        </h1>
        <p className="mt-2 text-sm text-ink/70">
          Bienvenido, {perfil.nombre_completo}.
        </p>
      </div>

      {!inscripciones || inscripciones.length === 0 ? (
        <FormularioInscripcion />
      ) : (
        <>
          <FormularioInscripcion mostrarBotonToggle />

          <section className="w-full max-w-sm">
            <h2 className="font-title text-xl text-verde-bosque">
              Pendientes
            </h2>
            {pendientes.length === 0 ? (
              <p className="mt-4 text-sm text-ink/70">
                No tienes tareas ni exámenes pendientes por ahora.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {pendientes.map((actividad) => {
                  const urgente = cierraPronto(actividad.fecha_cierre);
                  return (
                    <li
                      key={actividad.id}
                      className={`card p-4 transition-shadow hover:shadow-md ${
                        urgente ? "border-terracota/40" : ""
                      }`}
                    >
                      <Link
                        href={`/estudiante/cursos/${actividad.curso_id}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">
                            {actividad.titulo}
                          </p>
                          <p className="truncate text-xs text-ink/70">
                            {actividad.cursos?.nombre} ·{" "}
                            {actividad.tipo === "EXAMEN" ? "Examen" : "Tarea"}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-xs font-medium ${
                            urgente ? "text-terracota" : "text-ink/70"
                          }`}
                        >
                          {textoRelativoCierre(actividad.fecha_cierre)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="w-full max-w-sm">
            <h2 className="font-title text-xl text-verde-bosque">
              Mis cursos
            </h2>
            <ul className="mt-4 flex flex-col gap-3">
              {inscripciones.map((inscripcion) => {
                const curso = inscripcion.cursos;
                if (!curso) return null;
                return (
                  <li
                    key={inscripcion.id}
                    className="card p-4 transition-shadow hover:shadow-md"
                  >
                    <Link href={`/estudiante/cursos/${curso.id}`}>
                      <p className="font-medium text-ink">{curso.nombre}</p>
                      <p className="text-sm text-ink/70">
                        {curso.grupo} · {curso.periodo}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
