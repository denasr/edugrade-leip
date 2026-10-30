import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { estadoActividad } from "@/lib/actividades";
import { textoNotaParcial } from "@/lib/calificacion-final";
import { obtenerResumenCursoEstudiante } from "@/lib/resumen-curso-estudiante";
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

  type PreguntaEstudiante = {
    id: string;
    enunciado: string;
    opciones: string[];
    puntos: number;
  };

  const actividadesConEnlace = await Promise.all(
    resumen.tareas.map(async (actividad) => {
      const estado = estadoActividad(actividad);

      let preguntas: PreguntaEstudiante[] = [];
      if (actividad.esCuestionario && !actividad.entrega && estado === "ABIERTA") {
        const { data } = await supabase
          .from("preguntas_examen_estudiante")
          .select("id, enunciado, opciones, puntos")
          .eq("actividad_id", actividad.id)
          .order("orden", { ascending: true });
        preguntas = (data ?? []) as PreguntaEstudiante[];
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
      };
    })
  );

  const examenesConPreguntas = await Promise.all(
    resumen.examenes.map(async (examen) => {
      const intentosRestantes = examen.intentos_permitidos - examen.intentosUsados;
      let preguntas: PreguntaEstudiante[] = [];

      if (intentosRestantes > 0 && estadoActividad(examen) === "ABIERTA") {
        const { data } = await supabase
          .from("preguntas_examen_estudiante")
          .select("id, enunciado, opciones, puntos")
          .eq("actividad_id", examen.id)
          .order("orden", { ascending: true });
        preguntas = (data ?? []) as PreguntaEstudiante[];
      }

      return {
        ...examen,
        preguntas,
        intentosPermitidos: examen.intentos_permitidos,
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
    </main>
  );
}
