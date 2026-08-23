import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import {
  obtenerLibroCalificaciones,
  textoAsistencia,
  textoCalificacionFinalConParcial,
  textoCeldaExamen,
  textoCeldaTarea,
} from "@/lib/libro-calificaciones";

export const runtime = "nodejs";

function slugArchivo(texto: string): string {
  return (
    texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "curso"
  );
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
    .select("rol")
    .eq("id", user.id)
    .single();

  if (perfil?.rol !== "DOCENTE") {
    return new Response("No autorizado.", { status: 403 });
  }

  const libro = await obtenerLibroCalificaciones(supabase, id, user.id);
  if (!libro) {
    return new Response("Curso no encontrado.", { status: 404 });
  }

  const { curso, tareas, examenes, estudiantes } = libro;

  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet("Calificaciones");

  const columnas = [
    { header: "Estudiante", key: "estudiante", width: 32 },
    ...tareas.map((t) => ({ header: t.titulo, key: `t:${t.id}`, width: 22 })),
    ...examenes.map((e) => ({ header: e.titulo, key: `e:${e.id}`, width: 22 })),
    { header: "Asistencia", key: "asistencia", width: 14 },
    { header: "Final", key: "final", width: 18 },
  ];
  hoja.columns = columnas;
  hoja.getRow(1).font = { bold: true };

  for (const estudiante of estudiantes) {
    const fila: Record<string, string> = {
      estudiante: estudiante.nombre_completo,
      asistencia: textoAsistencia(estudiante.resultado.porcentajeAsistencia),
      final: textoCalificacionFinalConParcial(estudiante.resultado),
    };
    for (const t of tareas) {
      fila[`t:${t.id}`] = textoCeldaTarea(estudiante.celdas.get(t.id));
    }
    for (const e of examenes) {
      fila[`e:${e.id}`] = textoCeldaExamen(estudiante.celdas.get(e.id));
    }
    hoja.addRow(fila);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const fecha = new Date().toISOString().slice(0, 10);
  const nombreArchivo = `calificaciones-${slugArchivo(curso.nombre)}-${fecha}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
