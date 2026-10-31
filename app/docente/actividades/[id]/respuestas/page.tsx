import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calificarExamen, type TipoPregunta } from "@/lib/calificar-examen";
import FormularioRespuestasAbiertas from "./formulario-respuestas-abiertas";

type ActividadConCurso = {
  id: string;
  titulo: string;
  tipo: "TAREA" | "EXAMEN";
  curso_id: string;
  cursos: { nombre: string; docente_id: string } | null;
};

type Pregunta = {
  id: string;
  tipo: TipoPregunta;
  enunciado: string;
  correcta: string;
  puntos: number;
};

type Entrega = {
  id: string;
  estudiante_id: string;
  intento: number | null;
  created_at: string;
  evaluaciones: { calificacion_final: number; comentarios: string | null } | null;
  respuestas_examen: {
    pregunta_id: string;
    respuesta_seleccionada: string | null;
    puntos_otorgados: number | null;
  }[];
};

// Calificación de las preguntas abiertas de un examen o cuestionario: una
// tarjeta por entrega con lo que escribió el estudiante, un campo de puntos
// por respuesta abierta y el resumen de las de opción múltiple (que ya se
// calificaron solas). Las que faltan por calificar van primero.
export default async function RespuestasAbiertas({
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
    .select("id, titulo, tipo, curso_id, cursos(nombre, docente_id)")
    .eq("id", id)
    .single()) as { data: ActividadConCurso | null };

  if (!actividad || actividad.cursos?.docente_id !== user.id) redirect("/docente");

  // preguntas_examen no tiene policy: secret key, ya verificado el dueño.
  const admin = createAdminClient();
  const { data: preguntas } = (await admin
    .from("preguntas_examen")
    .select("id, tipo, enunciado, correcta, puntos")
    .eq("actividad_id", id)
    .order("orden", { ascending: true })) as { data: Pregunta[] | null };

  // Una fila por intento: con "2 intentos" cada uno se califica aparte (el
  // que cuenta es el más reciente). Acotado a una actividad: no llega a las
  // 1000 filas.
  const { data: entregas } = (await supabase
    .from("entregas")
    .select(
      "id, estudiante_id, intento, created_at, evaluaciones(calificacion_final, comentarios), respuestas_examen(pregunta_id, respuesta_seleccionada, puntos_otorgados)"
    )
    .eq("actividad_id", id)
    .order("created_at", { ascending: true })) as { data: Entrega[] | null };

  const estudianteIds = [...new Set((entregas ?? []).map((e) => e.estudiante_id))];
  const { data: perfiles } =
    estudianteIds.length > 0
      ? await supabase.from("perfiles").select("id, nombre_completo").in("id", estudianteIds)
      : { data: [] };
  const nombrePorId = new Map((perfiles ?? []).map((p) => [p.id, p.nombre_completo]));

  const tarjetas = (entregas ?? [])
    .map((entrega) => {
      const respuestaPorPregunta = new Map(
        entrega.respuestas_examen.map((r) => [r.pregunta_id, r])
      );
      const resultado = calificarExamen(preguntas ?? [], entrega.respuestas_examen);
      return {
        entrega,
        nombre: nombrePorId.get(entrega.estudiante_id) ?? "—",
        pendiente: entrega.evaluaciones === null,
        resultado,
        preguntas: (preguntas ?? []).map((p) => {
          const r = respuestaPorPregunta.get(p.id);
          return {
            ...p,
            respuesta: r?.respuesta_seleccionada ?? null,
            puntosOtorgados:
              r?.puntos_otorgados === null || r?.puntos_otorgados === undefined
                ? null
                : Number(r.puntos_otorgados),
          };
        }),
      };
    })
    .sort((a, b) => Number(b.pendiente) - Number(a.pendiente) || a.nombre.localeCompare(b.nombre));

  const pendientes = tarjetas.filter((t) => t.pendiente).length;
  const pestana = actividad.tipo === "EXAMEN" ? "examenes" : "tareas";

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-4 py-16">
      <div className="w-full max-w-xl text-center">
        <Link href={`/docente/cursos/${actividad.curso_id}/${pestana}`} className="link-muted">
          ← {actividad.cursos?.nombre}
        </Link>
        <h1 className="mt-2 font-title text-2xl text-verde-bosque">{actividad.titulo}</h1>
        <p className="mt-1 text-sm text-ink/70">
          Respuestas escritas ·{" "}
          {pendientes === 0
            ? "todas calificadas"
            : `${pendientes} ${pendientes === 1 ? "entrega" : "entregas"} por calificar`}
        </p>
      </div>

      <section className="w-full max-w-xl">
        {tarjetas.length === 0 ? (
          <p className="text-sm text-ink/70">Todavía nadie ha presentado.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {tarjetas.map(({ entrega, nombre, pendiente, resultado, preguntas: detalle }) => (
              <li key={entrega.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink">{nombre}</p>
                    <p className="text-xs text-ink/70">
                      {entrega.intento && entrega.intento > 1 ? `Intento ${entrega.intento} · ` : ""}
                      {new Date(entrega.created_at).toLocaleString("es-MX", {
                        timeZone: "America/Mexico_City",
                      })}
                    </p>
                  </div>
                  {pendiente ? (
                    <span className="badge-pendiente">Por calificar</span>
                  ) : (
                    <span className="badge-calificado">
                      {Number(entrega.evaluaciones?.calificacion_final).toFixed(1)}/10
                    </span>
                  )}
                </div>
                {!pendiente && (
                  <p className="mt-1 text-xs text-ink/70">
                    {resultado.puntosObtenidos} de {resultado.puntosTotales} puntos
                  </p>
                )}

                <FormularioRespuestasAbiertas
                  actividadId={id}
                  entregaId={entrega.id}
                  preguntas={detalle}
                  comentarioActual={entrega.evaluaciones?.comentarios ?? null}
                  calificada={!pendiente}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
