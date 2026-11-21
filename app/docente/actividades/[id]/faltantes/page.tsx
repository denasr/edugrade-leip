import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { estadoActividad, motivoCierre } from "@/lib/actividades";
import { finalizarIntentosVencidos } from "@/lib/intentos-examen";
import { calcularFaltantes } from "@/lib/faltantes-tarea";

// Ver nota en ../page.tsx sobre el cast de cursos(...).
type ActividadConCurso = {
  id: string;
  titulo: string;
  tipo: "TAREA" | "EXAMEN";
  curso_id: string;
  fecha_apertura: string | null;
  fecha_cierre: string;
  bloqueado_manual: boolean;
  visible_estudiantes: boolean;
  cursos: { id: string; nombre: string; docente_id: string } | null;
};

type EntregaResumen = {
  estudiante_id: string;
  archivos_entrega: { count: number }[];
  evaluaciones: { id: string } | null;
};

// Lista de estudiantes inscritos que todavía no entregan una tarea (o no
// presentan un cuestionario), con el conteo. Se entra desde la tarjeta de
// la actividad en la pestaña Tareas. El criterio de "entregó" vive en
// lib/faltantes-tarea.ts, compartido con ese conteo.
export default async function FaltantesActividad({
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

  const { data: actividad } = (await supabase
    .from("actividades")
    .select(
      "id, titulo, tipo, curso_id, fecha_apertura, fecha_cierre, bloqueado_manual, visible_estudiantes, cursos(id, nombre, docente_id)"
    )
    .eq("id", id)
    .single()) as { data: ActividadConCurso | null };

  if (!actividad || actividad.cursos?.docente_id !== user.id) {
    redirect("/docente");
  }

  // preguntas_examen no tiene policy (ver CLAUDE.md): secret key, ya
  // verificado arriba que la actividad es de un curso del docente. Solo
  // se pregunta si tiene preguntas, para saber si es cuestionario.
  const admin = createAdminClient();
  const { count: numPreguntas } = await admin
    .from("preguntas_examen")
    .select("id", { count: "exact", head: true })
    .eq("actividad_id", id);
  const sinArchivo = actividad.tipo === "EXAMEN" || (numPreguntas ?? 0) > 0;

  // Un intento con tiempo que venció sin enviarse cuenta como entregado
  // (ver lib/intentos-examen.ts): se entrega antes de leer entregas.
  if (sinArchivo) {
    await finalizarIntentosVencidos(admin, { actividadIds: [id] });
  }

  // Acotadas a un curso y una actividad: a lo más una fila por estudiante,
  // lejos del límite de 1000 de PostgREST.
  const { data: inscripciones } = await supabase
    .from("inscripciones")
    .select("estudiante_id, created_at")
    .eq("curso_id", actividad.curso_id);

  const { data: entregas } = (await supabase
    .from("entregas")
    .select("estudiante_id, archivos_entrega(count), evaluaciones(id)")
    .eq("actividad_id", id)) as { data: EntregaResumen[] | null };

  const estudianteIds = (inscripciones ?? []).map((i) => i.estudiante_id);
  const faltantes = calcularFaltantes(
    estudianteIds,
    (entregas ?? []).map((e) => ({
      estudiante_id: e.estudiante_id,
      numArchivos: e.archivos_entrega[0]?.count ?? 0,
      calificada: e.evaluaciones !== null,
    })),
    sinArchivo
  );

  const faltanteIds = faltantes.map((f) => f.estudiante_id);
  const { data: perfiles } =
    faltanteIds.length > 0
      ? await supabase
          .from("perfiles")
          .select("id, nombre_completo")
          .in("id", faltanteIds)
      : { data: [] };
  const nombrePorId = new Map(
    (perfiles ?? []).map((p) => [p.id, p.nombre_completo as string])
  );
  const inscritoDesde = new Map(
    (inscripciones ?? []).map((i) => [i.estudiante_id, i.created_at as string])
  );

  const cierre = new Date(actividad.fecha_cierre).getTime();
  const filas = faltantes
    .map((f) => {
      const inscrito = inscritoDesde.get(f.estudiante_id);
      return {
        ...f,
        nombre: nombrePorId.get(f.estudiante_id) ?? "—",
        // Se inscribió cuando la actividad ya había cerrado: nunca tuvo
        // oportunidad de entregarla. Se muestra igual (el libro de
        // calificaciones también la marca "Sin entregar"), pero señalado.
        inscritoTrasCierre:
          inscrito !== undefined && new Date(inscrito).getTime() > cierre,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const total = estudianteIds.length;
  const entregaron = total - filas.length;
  const verbo = sinArchivo ? "presentado" : "entregado";
  const motivo = motivoCierre(actividad);
  const abierta = estadoActividad(actividad) === "ABIERTA";

  return (
    <main className="flex flex-1 flex-col items-center gap-10 px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <Link
          href={`/docente/cursos/${actividad.curso_id}/tareas`}
          className="link-muted"
        >
          ← {actividad.cursos?.nombre}
        </Link>
        <h1 className="mt-2 font-title text-2xl text-verde-bosque">
          {actividad.titulo}
        </h1>
        <p className="mt-1 text-xs text-ink/70">
          {abierta
            ? `Abierta · cierra el ${new Date(actividad.fecha_cierre).toLocaleString("es-MX")}`
            : motivo}
          {!actividad.visible_estudiantes && " · Oculta para los estudiantes"}
        </p>
      </div>

      <section className="w-full max-w-sm">
        <h2 className="font-title text-xl text-verde-bosque">
          No han {verbo}
        </h2>

        {total === 0 ? (
          <p className="mt-4 text-sm text-ink/70">
            Todavía no hay estudiantes inscritos en este curso.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink" data-testid="conteo-faltantes">
              <span className="font-semibold">{filas.length}</span> de {total}{" "}
              {total === 1 ? "estudiante" : "estudiantes"} sin {sinArchivo ? "presentar" : "entregar"}
              {" · "}
              {entregaron} {entregaron === 1 ? "ya lo hizo" : "ya lo hicieron"}
            </p>

            {filas.length === 0 ? (
              <p className="mt-4 text-sm text-ink/70">
                Todos los estudiantes inscritos ya han {verbo}.
              </p>
            ) : (
              <ul className="card mt-4 divide-y divide-verde-bosque/10">
                {filas.map((f) => (
                  <li
                    key={f.estudiante_id}
                    className="flex items-start justify-between gap-2 px-4 py-2.5"
                  >
                    <span className="text-sm text-ink">{f.nombre}</span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {f.aMedias && (
                        <span
                          className="badge-pendiente"
                          title="Empezó a entregar pero la subida del archivo no terminó"
                        >
                          Entrega incompleta
                        </span>
                      )}
                      {f.inscritoTrasCierre && (
                        <span className="badge-cerrada">
                          Se inscribió tras el cierre
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <Link
          href={`/docente/actividades/${id}`}
          className="link-muted mt-6 inline-block"
        >
          Ver las entregas recibidas
        </Link>
      </section>
    </main>
  );
}
