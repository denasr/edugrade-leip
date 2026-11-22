import Link from "next/link";
import type { ActividadLinea } from "@/lib/resumen-curso-docente";
import DesplazarAHoy from "./desplazar-a-hoy";

// "El semestre hasta hoy": cada tarea (círculo) y examen (rombo) sobre una
// línea de tiempo según su fecha de cierre, con la fecha de hoy marcada.
//   relleno verde  = ya cerró
//   anillo verde   = abierta o por abrir
//   terracota      = tiene entregas por calificar (sin importar si cerró)
//   borde punteado = oculta para los estudiantes
// Componente de servidor, sin interacción: cada marca es un enlace a la
// actividad, con su descripción completa en aria-label y title.

const ZONA = "America/Mexico_City";
const fechaCorta = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  timeZone: ZONA,
});
const mesCorto = new Intl.DateTimeFormat("es-MX", { month: "short", timeZone: ZONA });

const DIA = 24 * 60 * 60 * 1000;
// Separación mínima (en % del ancho) entre dos marcas del mismo carril.
const SEPARACION = 3;
const MAX_CARRILES = 3;

function sinPunto(texto: string) {
  return texto.replace(".", "");
}

export default function LineaSemestre({
  cursoId,
  actividades,
  inicioCurso,
  ahora,
}: {
  ahora: number;
  cursoId: string;
  actividades: ActividadLinea[];
  inicioCurso: string;
}) {
  if (actividades.length === 0) {
    return (
      <p className="text-ink/75">
        Cuando publiques tareas o exámenes, aparecerán aquí en la fecha en que cierran.
      </p>
    );
  }

  const cierres = actividades.map((a) => new Date(a.fecha_cierre).getTime());
  const aperturas = actividades
    .map((a) => (a.fecha_apertura ? new Date(a.fecha_apertura).getTime() : null))
    .filter((t): t is number => t !== null);
  const inicio = Math.min(new Date(inicioCurso).getTime(), ...cierres, ...aperturas) - 3 * DIA;
  const fin = Math.max(...cierres, ahora) + 3 * DIA;
  const posicion = (t: number) => ((t - inicio) / (fin - inicio)) * 100;

  // Reparte en carriles las marcas que caen casi en el mismo día.
  const ultimoPorCarril: number[] = [];
  const marcas = actividades.map((a) => {
    const x = posicion(new Date(a.fecha_cierre).getTime());
    let carril = ultimoPorCarril.findIndex((ultimo) => x - ultimo >= SEPARACION);
    if (carril === -1) {
      carril = ultimoPorCarril.length < MAX_CARRILES ? ultimoPorCarril.length : MAX_CARRILES - 1;
    }
    ultimoPorCarril[carril] = x;
    return { actividad: a, x, carril };
  });

  // Inicio de cada mes dentro del rango, para las etiquetas de abajo.
  const meses: { x: number; texto: string }[] = [];
  const cursor = new Date(inicio);
  cursor.setUTCDate(1);
  cursor.setUTCHours(12, 0, 0, 0);
  while (cursor.getTime() <= fin) {
    if (cursor.getTime() >= inicio) {
      meses.push({ x: posicion(cursor.getTime()), texto: sinPunto(mesCorto.format(cursor)) });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const xHoy = posicion(ahora);

  return (
    <div className="flex flex-col gap-4">
      <DesplazarAHoy posicionHoy={xHoy}>
        <div className="relative h-36 min-w-[560px]">
          {/* Línea base */}
          <div className="absolute top-[88px] right-0 left-0 h-px bg-verde-bosque/25" />

          {/* Meses */}
          {meses.map((m) => (
            <div
              key={m.x}
              className="absolute top-[88px] flex h-12 flex-col items-start"
              style={{ left: `${m.x}%` }}
            >
              <span className="h-2 w-px bg-verde-bosque/30" />
              <span className="mt-1.5 -translate-x-1/2 text-sm capitalize text-ink/70">
                {m.texto}
              </span>
            </div>
          ))}

          {/* Hoy */}
          <div
            className="absolute top-0 flex h-[100px] flex-col items-center"
            style={{ left: `${xHoy}%`, transform: "translateX(-50%)" }}
          >
            <span className="whitespace-nowrap rounded-full bg-ink px-2 py-0.5 text-xs font-medium text-crema">
              Hoy, {sinPunto(fechaCorta.format(ahora))}
            </span>
            <span className="w-px flex-1 bg-ink/70" />
          </div>

          {/* Actividades */}
          {marcas.map(({ actividad: a, x, carril }) => {
            const cerro = new Date(a.fecha_cierre).getTime() < ahora;
            const pendiente = a.porCalificar > 0;
            const forma = a.tipo === "EXAMEN" ? "rotate-45 rounded-[3px]" : "rounded-full";
            const tamano = a.tipo === "EXAMEN" ? "h-3.5 w-3.5" : "h-4 w-4";
            const estilo = !a.visible
              ? "border-2 border-dashed border-ink/55 bg-crema"
              : pendiente
                ? "bg-terracota"
                : cerro
                  ? "bg-verde-bosque"
                  : "border-2 border-verde-bosque bg-superficie";
            const tipoTexto =
              a.tipo === "EXAMEN" ? "examen" : a.esCuestionario ? "cuestionario" : "tarea";
            const descripcion = [
              a.titulo,
              tipoTexto,
              `${cerro ? "cerró" : "cierra"} el ${sinPunto(fechaCorta.format(new Date(a.fecha_cierre)))}`,
              pendiente ? `${a.porCalificar} por calificar` : null,
              !a.visible ? "oculta" : null,
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <Link
                key={a.id}
                href={
                  pendiente
                    ? a.hrefCalificar
                    : `/docente/cursos/${cursoId}/${a.tipo === "EXAMEN" ? "examenes" : "tareas"}`
                }
                aria-label={descripcion}
                title={descripcion}
                className="absolute flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-verde-bosque"
                style={{ left: `${x}%`, top: `${74 - carril * 24}px` }}
              >
                <span className={`block ${tamano} ${forma} ${estilo}`} />
              </Link>
            );
          })}
        </div>
      </DesplazarAHoy>

      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink/75">
        <li className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-full bg-verde-bosque" /> Tarea que ya cerró
        </li>
        <li className="flex items-center gap-2">
          <span className="ml-0.5 h-3 w-3 rotate-45 rounded-[2px] bg-verde-bosque" /> Examen
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-verde-bosque bg-superficie" />{" "}
          Abierta o por abrir
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-full bg-terracota" /> Con entregas por calificar
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-dashed border-ink/55" /> Oculta
        </li>
      </ul>
    </div>
  );
}
