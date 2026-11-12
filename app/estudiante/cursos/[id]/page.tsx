import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { estadoActividad } from "@/lib/actividades";
import { textoNotaParcial } from "@/lib/calificacion-final";
import { obtenerResumenCursoEstudiante } from "@/lib/resumen-curso-estudiante";
import { ordenarParaEstudiante } from "@/lib/preguntas-examen";
import { dentroDelTiempo, type IntentoActivo } from "@/lib/intentos-examen";
import { COLUMNAS_ANUNCIO, type Anuncio } from "@/lib/anuncios";
import {
  COLUMNAS_RECURSO,
  COLUMNAS_UNIDAD,
  agruparPorUnidad,
  type Recurso,
  type Unidad,
} from "@/lib/recursos";
import TablonAnuncios from "./tablon-anuncios";
import RecursosCurso from "./recursos-curso";
import TarjetaTareaEstudiante from "./tarjeta-tarea-estudiante";
import TarjetaExamenEstudiante from "./tarjeta-examen-estudiante";

export default async function DetalleCursoEstudiante({
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

  if (perfil?.rol !== "ESTUDIANTE") redirect("/docente");

  // Datos y cálculos compartidos con el reporte en PDF (reporte/route.ts):
  // una sola fuente para lo que el estudiante ve y lo que descarga.
  const resumen = await obtenerResumenCursoEstudiante(supabase, id, user.id);
  if (!resumen) redirect("/estudiante");
  const { curso, resultadoFinal } = resumen;

  // RLS (anuncios_select) ya limita esto a los cursos donde está inscrito.
  const { data: anuncios } = (await supabase
    .from("anuncios")
    .select(COLUMNAS_ANUNCIO)
    .eq("curso_id", id)
    .order("fijado", { ascending: false })
    .order("created_at", { ascending: false })) as { data: Anuncio[] | null };

  // RLS (unidades_recursos_select / recursos_curso_select) ya deja fuera las
  // unidades y recursos ocultos, y los de cursos donde no está inscrito.
  const [{ data: unidadesRecursos }, { data: recursos }] = await Promise.all([
    supabase.from("unidades_recursos").select(COLUMNAS_UNIDAD).eq("curso_id", id) as unknown as Promise<{
      data: Unidad[] | null;
    }>,
    supabase.from("recursos_curso").select(COLUMNAS_RECURSO).eq("curso_id", id) as unknown as Promise<{
      data: Recurso[] | null;
    }>,
  ]);
  const unidadesConRecursos = agruparPorUnidad(unidadesRecursos ?? [], recursos ?? []);

  // Intentos con tiempo que el estudiante tiene en curso (los vencidos ya
  // se entregaron en obtenerResumenCursoEstudiante). RLS: solo los suyos.
  const { data: intentosAbiertos } = await supabase
    .from("intentos_examen")
    .select("id, actividad_id, vence_at, borrador")
    .eq("estudiante_id", user.id)
    .is("finalizado_at", null);
  const intentoPorActividad = new Map<string, IntentoActivo>(
    (intentosAbiertos ?? [])
      .filter((i) => dentroDelTiempo(i.vence_at))
      .map((i) => [
        i.actividad_id,
        { id: i.id, venceAt: i.vence_at, borrador: (i.borrador ?? {}) as Record<string, string> },
      ])
  );
  // Para que el reloj del navegador se ajuste si el del teléfono está mal.
  const ahoraServidor = new Date().toISOString();

  // Con límite de tiempo, las preguntas no se mandan al navegador hasta que
  // el estudiante presiona "Comenzar" (si no, podría leerlas antes de que
  // empiece a correr su tiempo).
  const puedeVerPreguntas = (actividad: { id: string; limite_minutos: number | null }) =>
    !actividad.limite_minutos || intentoPorActividad.has(actividad.id);

  type PreguntaEstudiante = {
    id: string;
    tipo: "OPCION_MULTIPLE" | "ABIERTA";
    enunciado: string;
    opciones: string[];
    puntos: number;
  };

  const actividadesConEnlace = await Promise.all(
    resumen.tareas.map(async (actividad) => {
      const estado = estadoActividad(actividad);

      let preguntas: PreguntaEstudiante[] = [];
      if (
        actividad.esCuestionario &&
        !actividad.entrega &&
        estado === "ABIERTA" &&
        puedeVerPreguntas(actividad)
      ) {
        const { data } = await supabase
          .from("preguntas_examen_estudiante")
          .select("id, tipo, enunciado, opciones, puntos")
          .eq("actividad_id", actividad.id)
          .order("orden", { ascending: true });
        preguntas = (data ?? []) as PreguntaEstudiante[];
        if (actividad.orden_aleatorio) {
          preguntas = ordenarParaEstudiante(preguntas, user.id, actividad.id);
        }
      }

      // Un cuestionario no tiene material de apoyo ni archivo que descargar
      // — el material sí lo permite el esquema para una tarea de archivo,
      // pero aquí no aplica.
      const material = actividad.esCuestionario
        ? null
        : (actividad.materiales_actividad[0] ?? null);
      let enlaceDescarga: string | null = null;

      if (material) {
        // No debe tronar toda la página si Storage falla (red, timeout):
        // sin enlace de descarga es degradación aceptable, un 500 no.
        try {
          const { data, error } = await supabase.storage
            .from("materiales-actividades")
            .createSignedUrl(material.storage_path, 60 * 10);
          if (error) console.error("Error al firmar URL de material:", error);
          enlaceDescarga = data?.signedUrl ?? null;
        } catch (err) {
          console.error("Excepción al firmar URL de material:", err);
        }
      }

      return {
        ...actividad,
        preguntas,
        nombreArchivo: material?.nombre_archivo ?? null,
        enlaceDescarga,
        intentoActivo: intentoPorActividad.get(actividad.id) ?? null,
        ahoraServidor,
      };
    })
  );

  const examenesConPreguntas = await Promise.all(
    resumen.examenes.map(async (examen) => {
      const intentosRestantes = examen.intentos_permitidos - examen.intentosUsados;
      let preguntas: PreguntaEstudiante[] = [];

      if (
        intentosRestantes > 0 &&
        estadoActividad(examen) === "ABIERTA" &&
        puedeVerPreguntas(examen)
      ) {
        const { data } = await supabase
          .from("preguntas_examen_estudiante")
          .select("id, tipo, enunciado, opciones, puntos")
          .eq("actividad_id", examen.id)
          .order("orden", { ascending: true });
        preguntas = (data ?? []) as PreguntaEstudiante[];
        if (examen.orden_aleatorio) {
          preguntas = ordenarParaEstudiante(preguntas, user.id, examen.id);
        }
      }

      return {
        ...examen,
        preguntas,
        intentosPermitidos: examen.intentos_permitidos,
        limiteMinutos: examen.limite_minutos,
        intentoActivo: intentoPorActividad.get(examen.id) ?? null,
        ahoraServidor,
      };
    })
  );

  const notaParcial = textoNotaParcial(resultadoFinal.categoriasFaltantes);

  return (
    <main className="flex flex-1 flex-col items-center gap-10 px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <Link href="/estudiante" className="link-muted">
          ← Mis cursos
        </Link>
        <h1 className="mt-2 font-title text-2xl text-verde-bosque">
          {curso.nombre}
        </h1>
        <p className="mt-1 text-sm text-ink/70">
          {curso.grupo} · {curso.periodo}
        </p>
      </div>

      <TablonAnuncios anuncios={anuncios ?? []} />

      <section className="card w-full max-w-sm p-6">
        <h2 className="font-title text-xl text-verde-bosque">
          Calificación final
        </h2>

        <div className="mt-4 flex flex-col gap-2 text-sm text-ink/80">
          <div className="flex items-center justify-between">
            <span>Tareas ({curso.porcentaje_tareas}%)</span>
            <span>
              {resultadoFinal.promedioTareas !== null
                ? `${resultadoFinal.promedioTareas.toFixed(1)}/10`
                : "Sin datos"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Exámenes ({curso.porcentaje_examenes}%)</span>
            <span>
              {resultadoFinal.promedioExamenes !== null
                ? `${resultadoFinal.promedioExamenes.toFixed(1)}/10`
                : "Sin datos"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Asistencia ({curso.porcentaje_asistencia}%)</span>
            <span>
              {resultadoFinal.porcentajeAsistencia !== null
                ? `${resultadoFinal.porcentajeAsistencia.toFixed(0)}%`
                : "Sin datos"}
            </span>
          </div>
        </div>

        <div className="mt-4 border-t border-verde-bosque/15 pt-4">
          <p className="font-title text-2xl text-verde-bosque">
            {resultadoFinal.calificacionFinal !== null
              ? `${resultadoFinal.calificacionFinal.toFixed(1)}/10`
              : "Sin datos suficientes"}
          </p>
          {notaParcial && (
            <p className="mt-1 text-xs text-terracota">{notaParcial}</p>
          )}
        </div>

        <a
          href={`/estudiante/cursos/${id}/reporte`}
          className="btn-primary mt-4 inline-block"
        >
          Descargar mi reporte (PDF)
        </a>
      </section>

      <section className="w-full max-w-sm">
        <h2 className="font-title text-xl text-verde-bosque">Tareas</h2>

        {actividadesConEnlace.length === 0 ? (
          <p className="mt-4 text-sm text-ink/70">
            Todavía no hay tareas publicadas en este curso.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {actividadesConEnlace.map((actividad) => (
              <TarjetaTareaEstudiante
                key={actividad.id}
                actividad={actividad}
                cursoId={id}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="w-full max-w-sm">
        <h2 className="font-title text-xl text-verde-bosque">Exámenes</h2>

        {examenesConPreguntas.length === 0 ? (
          <p className="mt-4 text-sm text-ink/70">
            Todavía no hay exámenes publicados en este curso.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {examenesConPreguntas.map((examen) => (
              <TarjetaExamenEstudiante key={examen.id} examen={examen} cursoId={id} />
            ))}
          </ul>
        )}
      </section>

      <RecursosCurso unidades={unidadesConRecursos} />
    </main>
  );
}
