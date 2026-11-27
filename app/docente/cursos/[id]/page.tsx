import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contarPendientesCurso } from "@/lib/pendientes-docente";
import { textoRelativoCierre } from "@/lib/actividades";
import { obtenerResumenCursoDocente } from "@/lib/resumen-curso-docente";
import EncabezadoCurso from "./encabezado-curso";
import FranjaPestanas from "./franja-pestanas";
import FormularioConfiguracion from "./formulario-configuracion";
import FormularioDuplicarCurso from "./formulario-duplicar-curso";
import BotonArchivarCurso from "./boton-archivar-curso";
import BotonCambiarClave from "./boton-cambiar-clave";
import LineaSemestre from "./linea-semestre";

const ZONA = "America/Mexico_City";
const dia = new Intl.DateTimeFormat("es-MX", { day: "numeric", timeZone: ZONA });
const mes = new Intl.DateTimeFormat("es-MX", { month: "short", timeZone: ZONA });
// sesiones_asistencia.fecha es un `date` sin hora: se formatea en UTC para
// que no se recorra un día.
const fechaSesion = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function sinPunto(texto: string) {
  return texto.replace(".", "");
}

function plural(n: number, singular: string, pluralTexto: string) {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

// El Resumen muestra primero lo que necesita atención (qué calificar, qué
// cierra pronto) y deja la configuración al final, porque se toca una o dos
// veces por semestre.
export default async function ResumenCurso({
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
    .select(
      "id, nombre, grupo, periodo, clave_acceso, porcentaje_examenes, porcentaje_tareas, porcentaje_asistencia, archivado_at, created_at"
    )
    .eq("id", id)
    .eq("docente_id", user.id)
    .single();

  if (!curso) redirect("/docente");

  const [pendientes, resumen] = await Promise.all([
    contarPendientesCurso(supabase, id),
    obtenerResumenCursoDocente(supabase, id),
  ]);

  const porCalificar = resumen.actividades.filter((a) => a.porCalificar > 0);
  const totalPorCalificar = porCalificar.reduce((s, a) => s + a.porCalificar, 0);

  const ponderacion = [
    { etiqueta: "Exámenes", valor: curso.porcentaje_examenes, color: "bg-verde-bosque" },
    { etiqueta: "Tareas", valor: curso.porcentaje_tareas, color: "bg-abierta" },
    { etiqueta: "Asistencia", valor: curso.porcentaje_asistencia, color: "bg-cerrada" },
  ].filter((p) => p.valor > 0);

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-4 py-16">
      <EncabezadoCurso curso={curso} />
      {curso.archivado_at && (
        <p className="card w-full max-w-sm p-4 text-center text-sm text-ink/80">
          Curso archivado el{" "}
          {new Date(curso.archivado_at).toLocaleDateString("es-MX", {
            timeZone: ZONA,
            dateStyle: "long",
          })}
          . No aparece en tu lista principal ni acepta inscripciones nuevas.
        </p>
      )}
      <FranjaPestanas cursoId={curso.id} activa="resumen" pendientes={pendientes} />

      <div className="flex w-full max-w-4xl flex-col gap-12 text-base sm:text-[17px]">
        {/* Por calificar */}
        {totalPorCalificar > 0 ? (
          <section
            aria-labelledby="titulo-por-calificar"
            className="rounded-2xl border-2 border-terracota/45 bg-superficie p-5 sm:p-7"
          >
            <h2
              id="titulo-por-calificar"
              className="font-title text-2xl font-semibold leading-snug text-ink sm:text-[28px]"
            >
              {totalPorCalificar === 1
                ? "1 entrega espera tu calificación"
                : `${totalPorCalificar} entregas esperan tu calificación`}
            </h2>
            <ul className="mt-4 divide-y divide-verde-bosque/10">
              {porCalificar.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{a.titulo}</p>
                    <p className="text-sm text-ink/70">
                      {a.tipo === "EXAMEN"
                        ? "Examen, respuestas escritas"
                        : a.esCuestionario
                          ? "Cuestionario, respuestas escritas"
                          : "Tarea"}
                      , {textoRelativoCierre(a.fecha_cierre)}.
                    </p>
                  </div>
                  <Link
                    href={a.hrefCalificar}
                    className="inline-flex min-h-11 items-center rounded-full border-2 border-terracota px-5 font-medium text-terracota transition-colors hover:bg-terracota hover:text-crema"
                  >
                    Calificar {a.porCalificar}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          resumen.actividades.length > 0 && (
            <p className="text-lg text-ink/80">No tienes entregas por calificar en este curso.</p>
          )
        )}

        {/* Línea del semestre */}
        <section aria-labelledby="titulo-semestre" className="flex flex-col gap-5">
          <h2
            id="titulo-semestre"
            className="font-title text-2xl font-semibold text-verde-bosque sm:text-[28px]"
          >
            El semestre hasta hoy
          </h2>
          <LineaSemestre
            cursoId={curso.id}
            actividades={resumen.actividades}
            inicioCurso={curso.created_at}
            ahora={new Date().getTime()}
          />
        </section>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-10">
          {/* Próximos cierres */}
          <section aria-labelledby="titulo-cierres" className="flex flex-col gap-4">
            <h2
              id="titulo-cierres"
              className="font-title text-2xl font-semibold text-verde-bosque"
            >
              Próximos cierres
            </h2>
            {resumen.proximosCierres.length === 0 ? (
              <p className="text-ink/75">
                No hay tareas ni exámenes abiertos o por abrir.{" "}
                <Link
                  href={`/docente/cursos/${curso.id}/tareas`}
                  className="font-medium text-verde-bosque underline underline-offset-4"
                >
                  Publicar una tarea
                </Link>
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {resumen.proximosCierres.map((a) => {
                  const cierre = new Date(a.fecha_cierre);
                  const pestana = a.tipo === "EXAMEN" ? "examenes" : "tareas";
                  return (
                    <li
                      key={a.id}
                      className="flex items-center gap-4 rounded-2xl border border-verde-bosque/15 bg-superficie p-4"
                    >
                      <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-verde-bosque/8 py-1.5 text-verde-bosque">
                        <span className="font-title text-2xl font-semibold leading-none">
                          {dia.format(cierre)}
                        </span>
                        <span className="text-sm">{sinPunto(mes.format(cierre))}</span>
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/docente/cursos/${curso.id}/${pestana}`}
                          className="font-medium text-ink hover:text-verde-bosque hover:underline"
                        >
                          {a.titulo}
                        </Link>
                        <p className="text-sm text-ink/70">
                          {a.tipo === "EXAMEN"
                            ? "Examen"
                            : a.esCuestionario
                              ? "Cuestionario"
                              : "Tarea"}
                          , {textoRelativoCierre(a.fecha_cierre)}.{" "}
                          {a.inscritos > 0 &&
                            `${a.entregaron} de ${a.inscritos} ${
                              a.tipo === "EXAMEN" || a.esCuestionario
                                ? "lo presentaron"
                                : "entregaron"
                            }.`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Asistencia */}
          <section aria-labelledby="titulo-asistencia" className="flex flex-col gap-4">
            <h2
              id="titulo-asistencia"
              className="font-title text-2xl font-semibold text-verde-bosque"
            >
              Asistencia
            </h2>
            {resumen.sesiones.length === 0 ? (
              <p className="text-ink/75">
                Todavía no has tomado asistencia. Usa “Tomar asistencia de hoy” arriba.
              </p>
            ) : (
              <div className="flex flex-col gap-4 rounded-2xl border border-verde-bosque/15 bg-superficie p-5">
                <p className="text-ink/80">
                  {resumen.promedioAsistencia === null ? (
                    "Sin registros de presentes o ausentes todavía."
                  ) : (
                    <>
                      <span className="font-title text-3xl font-semibold text-ink">
                        {Math.round(resumen.promedioAsistencia)} %
                      </span>{" "}
                      de asistencia en{" "}
                      {resumen.sesiones.length === 1
                        ? "la última sesión"
                        : `las últimas ${resumen.sesiones.length} sesiones`}
                      .
                    </>
                  )}
                </p>
                <ul className="flex h-36 gap-1.5 sm:gap-2" aria-label="Asistencia por sesión">
                  {resumen.sesiones.map((s) => {
                    const fecha = sinPunto(fechaSesion.format(new Date(`${s.fecha}T12:00:00Z`)));
                    const pct = s.porcentaje;
                    return (
                      <li
                        key={s.fecha}
                        className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5"
                        aria-label={`${fecha}: ${pct === null ? "sin datos" : `${Math.round(pct)} %`}`}
                        title={`${fecha}: ${pct === null ? "sin datos" : `${Math.round(pct)} %`}`}
                      >
                        <span className="flex w-full flex-1 items-end justify-center">
                          <span
                            className={`w-full max-w-9 rounded-t-md ${
                              pct !== null && pct < 70 ? "bg-terracota" : "bg-verde-bosque"
                            }`}
                            style={{ height: `${Math.max(pct ?? 0, 3)}%` }}
                          />
                        </span>
                        <span className="whitespace-nowrap text-[11px] text-ink/70 sm:text-xs">{fecha}</span>
                      </li>
                    );
                  })}
                </ul>
                <Link
                  href={`/docente/cursos/${curso.id}/asistencia`}
                  className="w-fit text-sm font-medium text-verde-bosque underline underline-offset-4"
                >
                  Ver todas las sesiones
                </Link>
              </div>
            )}
          </section>
        </div>

        {/* Ponderación */}
        <section aria-labelledby="titulo-ponderacion" className="flex flex-col gap-4">
          <h2
            id="titulo-ponderacion"
            className="font-title text-2xl font-semibold text-verde-bosque"
          >
            Cómo se calcula la calificación final
          </h2>
          <div className="flex h-11 w-full overflow-hidden rounded-full">
            {ponderacion.map((p) => (
              <div
                key={p.etiqueta}
                className={`${p.color} flex items-center justify-center overflow-hidden px-2 text-sm font-medium whitespace-nowrap text-crema`}
                style={{ width: `${p.valor}%` }}
              >
                {p.valor >= 12 ? `${p.etiqueta} ${p.valor} %` : `${p.valor} %`}
              </div>
            ))}
          </div>
          <p className="text-sm text-ink/70">
            {ponderacion.map((p) => `${p.etiqueta} ${p.valor} %`).join(", ")}. Dentro de cada
            parte, todas las actividades valen lo mismo.
          </p>
          <div className="-ml-1 flex [&_button]:w-auto [&_button]:justify-start">
            <FormularioConfiguracion
              cursoId={curso.id}
              textoBoton="Cambiar ponderación"
              porcentajes={{
                porcentaje_examenes: curso.porcentaje_examenes,
                porcentaje_tareas: curso.porcentaje_tareas,
                porcentaje_asistencia: curso.porcentaje_asistencia,
              }}
            />
          </div>
        </section>

        {/* Fin de semestre */}
        <section
          aria-labelledby="titulo-fin"
          className="flex flex-col gap-3 border-t border-verde-bosque/15 pt-8"
        >
          <h2 id="titulo-fin" className="font-title text-xl font-semibold text-ink/80">
            Al terminar el semestre
          </h2>
          <p className="text-sm text-ink/70">
            {plural(resumen.actividades.length, "actividad", "actividades")} en este curso.
            Duplícalo para otro grupo, archívalo cuando termine o cambia su clave de acceso
            para que la actual ya no sirva para inscribirse.
          </p>
          <div className="-ml-1 flex flex-col items-start [&_button]:w-auto [&_button]:justify-start">
            <FormularioDuplicarCurso
              cursoId={curso.id}
              curso={{ nombre: curso.nombre, grupo: curso.grupo, periodo: curso.periodo }}
              totalActividades={resumen.actividades.length}
            />
            <BotonArchivarCurso cursoId={curso.id} archivado={curso.archivado_at !== null} />
            <BotonCambiarClave cursoId={curso.id} />
          </div>
        </section>
      </div>
    </main>
  );
}
