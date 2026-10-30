import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { textoNotaParcial } from "@/lib/calificacion-final";
import {
  obtenerResumenCursoEstudiante,
  situacionActividad,
  tieneEntregaReal,
  type SituacionActividad,
} from "@/lib/resumen-curso-estudiante";

export const runtime = "nodejs";

// Reporte de desempeño del estudiante en un curso, en PDF. Todos los números
// salen de obtenerResumenCursoEstudiante — la misma función que arma la
// vista del curso — así que el PDF coincide siempre con lo que el
// estudiante ve en pantalla. Route Handler: repite aquí la verificación de
// sesión y rol, y obtenerResumenCursoEstudiante la de inscripción (un Route
// Handler no hereda la protección de la página).

const ZONA_HORARIA = "America/Mexico_City";
const VERDE = rgb(0x24 / 255, 0x4a / 255, 0x38 / 255); // --color-verde-bosque
const TINTA = rgb(0x2a / 255, 0x2a / 255, 0x24 / 255); // --color-ink
const TENUE = rgb(0x5a / 255, 0x5a / 255, 0x52 / 255);
const LINEA = rgb(0.85, 0.85, 0.82);

const ANCHO = 595.28; // A4
const ALTO = 841.89;
const MARGEN = 50;

function slugArchivo(texto: string): string {
  return (
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "curso"
  );
}

function fecha(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    timeZone: ZONA_HORARIA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function textoSituacion(s: SituacionActividad, examen: boolean): string {
  switch (s.tipo) {
    case "CALIFICADA":
      return `${s.calificacion.toFixed(1)}/10`;
    case "SIN_CALIFICAR":
      return "Entregada, sin calificar";
    case "POR_ENTREGAR":
      return examen ? "Por presentar" : "Por entregar";
    case "NO_ENTREGADA":
      return examen ? "No presentado" : "No entregada";
    case "NO_DISPONIBLE":
      return "Aún no disponible";
  }
}

// Escribe el documento de arriba hacia abajo, con salto de página
// automático y ajuste de líneas. Las fuentes estándar de PDF solo cubren
// WinAnsi (sí acentos, ñ, ¿¡; no emojis ni otros alfabetos): cualquier
// carácter fuera de eso se sustituye en vez de tronar la generación.
class Escritor {
  private pagina!: PDFPage;
  private y = 0;
  private soportados = new Map<string, boolean>();

  constructor(
    private doc: PDFDocument,
    private normal: PDFFont,
    private negrita: PDFFont
  ) {
    this.nuevaPagina();
  }

  private nuevaPagina() {
    this.pagina = this.doc.addPage([ANCHO, ALTO]);
    this.y = ALTO - MARGEN;
  }

  private espacio(alto: number) {
    if (this.y - alto < MARGEN + 20) this.nuevaPagina();
  }

  limpiar(texto: string): string {
    return Array.from(texto.replace(/\s+/g, " ").trim())
      .map((c) => {
        let ok = this.soportados.get(c);
        if (ok === undefined) {
          try {
            this.normal.encodeText(c);
            ok = true;
          } catch {
            ok = false;
          }
          this.soportados.set(c, ok);
        }
        return ok ? c : "?";
      })
      .join("");
  }

  private envolver(texto: string, fuente: PDFFont, tamano: number, ancho: number): string[] {
    const palabras = this.limpiar(texto).split(" ");
    const lineas: string[] = [];
    let actual = "";
    for (const palabra of palabras) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (fuente.widthOfTextAtSize(prueba, tamano) <= ancho || !actual) {
        actual = prueba;
      } else {
        lineas.push(actual);
        actual = palabra;
      }
    }
    if (actual) lineas.push(actual);
    return lineas.length > 0 ? lineas : [""];
  }

  texto(
    texto: string,
    opciones: { tamano?: number; negrita?: boolean; color?: ReturnType<typeof rgb>; despues?: number } = {}
  ) {
    const tamano = opciones.tamano ?? 10;
    const fuente = opciones.negrita ? this.negrita : this.normal;
    for (const linea of this.envolver(texto, fuente, tamano, ANCHO - 2 * MARGEN)) {
      this.espacio(tamano + 4);
      this.pagina.drawText(linea, {
        x: MARGEN,
        y: this.y - tamano,
        size: tamano,
        font: fuente,
        color: opciones.color ?? TINTA,
      });
      this.y -= tamano + 4;
    }
    this.y -= opciones.despues ?? 0;
  }

  titulo(texto: string) {
    this.espacio(40);
    this.y -= 10;
    this.texto(texto, { tamano: 13, negrita: true, color: VERDE, despues: 2 });
    this.pagina.drawLine({
      start: { x: MARGEN, y: this.y },
      end: { x: ANCHO - MARGEN, y: this.y },
      thickness: 0.8,
      color: VERDE,
    });
    this.y -= 8;
  }

  // Fila "etiqueta ........ valor".
  dato(etiqueta: string, valor: string, negrita = false) {
    const tamano = 10;
    this.espacio(tamano + 6);
    const fuente = negrita ? this.negrita : this.normal;
    const valorLimpio = this.limpiar(valor);
    this.pagina.drawText(this.limpiar(etiqueta), {
      x: MARGEN,
      y: this.y - tamano,
      size: tamano,
      font: fuente,
      color: TINTA,
    });
    this.pagina.drawText(valorLimpio, {
      x: ANCHO - MARGEN - fuente.widthOfTextAtSize(valorLimpio, tamano),
      y: this.y - tamano,
      size: tamano,
      font: fuente,
      color: TINTA,
    });
    this.y -= tamano + 6;
  }

  // Tabla de 3 columnas: título (se ajusta en varias líneas), cierre, situación.
  tabla(encabezados: [string, string, string], filas: [string, string, string][]) {
    const tamano = 9;
    const x = [MARGEN, ANCHO - MARGEN - 210, ANCHO - MARGEN - 130];
    const anchoTitulo = x[1] - x[0] - 10;

    const encabezado = () => {
      this.espacio(tamano + 10);
      encabezados.forEach((e, i) =>
        this.pagina.drawText(e, {
          x: x[i],
          y: this.y - tamano,
          size: tamano,
          font: this.negrita,
          color: TENUE,
        })
      );
      this.y -= tamano + 6;
    };

    encabezado();
    for (const [titulo, cierre, situacion] of filas) {
      const lineas = this.envolver(titulo, this.normal, tamano, anchoTitulo);
      const alto = lineas.length * (tamano + 3) + 5;
      if (this.y - alto < MARGEN + 20) {
        this.nuevaPagina();
        encabezado();
      }
      this.pagina.drawLine({
        start: { x: MARGEN, y: this.y },
        end: { x: ANCHO - MARGEN, y: this.y },
        thickness: 0.4,
        color: LINEA,
      });
      const yFila = this.y - 3;
      lineas.forEach((l, i) =>
        this.pagina.drawText(l, {
          x: x[0],
          y: yFila - tamano - i * (tamano + 3),
          size: tamano,
          font: this.normal,
          color: TINTA,
        })
      );
      this.pagina.drawText(this.limpiar(cierre), {
        x: x[1],
        y: yFila - tamano,
        size: tamano,
        font: this.normal,
        color: TINTA,
      });
      this.pagina.drawText(this.limpiar(situacion), {
        x: x[2],
        y: yFila - tamano,
        size: tamano,
        font: this.negrita,
        color: TINTA,
      });
      this.y -= alto;
    }
  }

  numerarPaginas() {
    const paginas = this.doc.getPages();
    paginas.forEach((p, i) => {
      const texto = `Virtual Grade · Página ${i + 1} de ${paginas.length}`;
      p.drawText(this.limpiar(texto), {
        x: ANCHO - MARGEN - this.normal.widthOfTextAtSize(this.limpiar(texto), 8),
        y: MARGEN - 20,
        size: 8,
        font: this.normal,
        color: TENUE,
      });
    });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("No autorizado.", { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol, nombre_completo")
    .eq("id", user.id)
    .single();

  if (perfil?.rol !== "ESTUDIANTE") {
    return new Response("No autorizado.", { status: 403 });
  }

  const resumen = await obtenerResumenCursoEstudiante(supabase, id, user.id);
  if (!resumen) {
    return new Response("Curso no encontrado.", { status: 404 });
  }

  const { curso, resultadoFinal, asistencia } = resumen;

  const tareas = resumen.tareas.map((t) => ({
    titulo: t.titulo,
    cierre: fecha(t.fecha_cierre),
    situacion: situacionActividad(
      t,
      tieneEntregaReal(t),
      t.entrega?.evaluaciones?.calificacion_final
    ),
  }));
  const examenes = resumen.examenes.map((e) => ({
    titulo: e.titulo,
    cierre: fecha(e.fecha_cierre),
    situacion: situacionActividad(
      e,
      e.entrega !== null,
      e.entrega?.evaluaciones?.calificacion_final
    ),
  }));
  const contar = (lista: { situacion: SituacionActividad }[], tipo: SituacionActividad["tipo"]) =>
    lista.filter((x) => x.situacion.tipo === tipo).length;

  const doc = await PDFDocument.create();
  doc.setTitle(`Reporte de desempeño - ${curso.nombre}`);
  doc.setAuthor("Virtual Grade");
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Escritor(doc, normal, negrita);

  // Encabezado
  w.texto("Virtual Grade", { tamano: 18, negrita: true, color: VERDE });
  w.texto("Reporte de desempeño", { tamano: 13, negrita: true, despues: 6 });
  w.texto(perfil.nombre_completo, { tamano: 11, negrita: true });
  w.texto(`${curso.nombre} · ${curso.grupo} · ${curso.periodo}`, { tamano: 10 });
  w.texto(
    `Fecha de inscripción: ${fecha(resumen.fechaInscripcion)} · Generado el ${new Date().toLocaleString("es-MX", { timeZone: ZONA_HORARIA, dateStyle: "short", timeStyle: "short" })}`,
    { tamano: 9, color: TENUE }
  );

  // Promedio general
  w.titulo("Promedio general");
  w.dato(
    "Calificación final",
    resultadoFinal.calificacionFinal !== null
      ? `${resultadoFinal.calificacionFinal.toFixed(1)}/10`
      : "Sin datos suficientes",
    true
  );
  w.dato(
    `Promedio de tareas (${curso.porcentaje_tareas}%)`,
    resultadoFinal.promedioTareas !== null ? `${resultadoFinal.promedioTareas.toFixed(1)}/10` : "Sin datos"
  );
  w.dato(
    `Promedio de exámenes (${curso.porcentaje_examenes}%)`,
    resultadoFinal.promedioExamenes !== null ? `${resultadoFinal.promedioExamenes.toFixed(1)}/10` : "Sin datos"
  );
  w.dato(
    `Asistencia (${curso.porcentaje_asistencia}%)`,
    resultadoFinal.porcentajeAsistencia !== null ? `${resultadoFinal.porcentajeAsistencia.toFixed(0)}%` : "Sin datos"
  );
  const notaParcial = textoNotaParcial(resultadoFinal.categoriasFaltantes);
  if (notaParcial) w.texto(notaParcial, { tamano: 9, color: TENUE });
  w.texto(
    "Se calcula con lo que ya entregaste y fue calificado, más tu asistencia, según la ponderación del curso. Las actividades sin calificar o sin entregar no cuentan como cero.",
    { tamano: 8, color: TENUE }
  );

  // Asistencia
  w.titulo("Asistencia");
  w.dato("Sesiones registradas desde tu inscripción", String(asistencia.presentes + asistencia.ausentes + asistencia.justificados));
  w.dato("Asistencias", String(asistencia.presentes));
  w.dato("Faltas", String(asistencia.ausentes));
  w.dato("Faltas justificadas (no cuentan en el porcentaje)", String(asistencia.justificados));

  // Pendientes
  w.titulo("Pendientes");
  w.dato("Tareas por entregar (todavía abiertas)", String(contar(tareas, "POR_ENTREGAR")));
  w.dato("Tareas no entregadas (ya cerraron)", String(contar(tareas, "NO_ENTREGADA")));
  w.dato("Exámenes por presentar (todavía abiertos)", String(contar(examenes, "POR_ENTREGAR")));
  w.dato("Exámenes no presentados (ya cerraron)", String(contar(examenes, "NO_ENTREGADA")));

  // Detalle
  w.titulo(`Tareas (${tareas.length})`);
  if (tareas.length === 0) {
    w.texto("Todavía no hay tareas publicadas en este curso.", { color: TENUE });
  } else {
    w.tabla(
      ["Tarea", "Cierre", "Situación"],
      tareas.map((t) => [t.titulo, t.cierre, textoSituacion(t.situacion, false)])
    );
  }

  w.titulo(`Exámenes (${examenes.length})`);
  if (examenes.length === 0) {
    w.texto("Todavía no hay exámenes publicados en este curso.", { color: TENUE });
  } else {
    w.tabla(
      ["Examen", "Cierre", "Situación"],
      examenes.map((e) => [e.titulo, e.cierre, textoSituacion(e.situacion, true)])
    );
  }

  w.numerarPaginas();
  const bytes = await doc.save();

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: ZONA_HORARIA });
  const nombreArchivo = `reporte-${slugArchivo(curso.nombre)}-${hoy}.pdf`;

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
      // Datos personales: que ningún caché intermedio los guarde.
      "Cache-Control": "private, no-store",
    },
  });
}
