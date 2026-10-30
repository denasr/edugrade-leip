import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Repetido aparte en vez de importarlo del route de calificaciones: no hay
// un lib compartido para esto todavía y es una función de 6 líneas, no
// justifica crear uno solo para evitar repetirla una vez más.
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

  // Repite aquí las mismas verificaciones de sesión/rol/dueño del curso que
  // la página — un Route Handler no hereda esa protección (ver
  // CLAUDE.md, mismo patrón que calificaciones/export).
  const { data: curso } = await supabase
    .from("cursos")
    .select("id, nombre")
    .eq("id", id)
    .eq("docente_id", user.id)
    .single();

  if (!curso) {
    return new Response("Curso no encontrado.", { status: 404 });
  }

  const { data: inscripciones } = await supabase
    .from("inscripciones")
    .select("estudiante_id, created_at")
    .eq("curso_id", id);

  const estudianteIds = (inscripciones ?? []).map((i) => i.estudiante_id);

  const { data: perfilesEstudiantes } =
    estudianteIds.length > 0
      ? await supabase
          .from("perfiles")
          .select("id, nombre_completo")
          .in("id", estudianteIds)
          .order("nombre_completo", { ascending: true })
      : { data: [] };

  // Mismo motivo que en la página: el correo solo vive en auth.users, sin
  // RLS accesible desde el cliente normal. Ya se verificó arriba que quien
  // pide esto es el docente dueño del curso, y estos IDs ya salieron de
  // inscripciones filtradas por ese mismo curso.
  const admin = createAdminClient();
  const correoPorId = new Map<string, string>();
  await Promise.all(
    estudianteIds.map(async (estudianteId) => {
      const { data } = await admin.auth.admin.getUserById(estudianteId);
      if (data.user?.email) correoPorId.set(estudianteId, data.user.email);
    })
  );

  const fechaInscripcionPorId = new Map(
    (inscripciones ?? []).map((i) => [i.estudiante_id, i.created_at])
  );

  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet("Estudiantes");

  hoja.columns = [
    { header: "Nombre completo", key: "nombre", width: 32 },
    { header: "Correo", key: "correo", width: 32 },
    { header: "Fecha de inscripción", key: "inscripcion", width: 20 },
  ];
  hoja.getRow(1).font = { bold: true };

  for (const p of perfilesEstudiantes ?? []) {
    const fechaInscripcion = fechaInscripcionPorId.get(p.id);
    hoja.addRow({
      nombre: p.nombre_completo,
      correo: correoPorId.get(p.id) ?? "—",
      inscripcion: fechaInscripcion
        ? new Date(fechaInscripcion).toLocaleDateString("es-MX")
        : "—",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const fecha = new Date().toISOString().slice(0, 10);
  const nombreArchivo = `estudiantes-${slugArchivo(curso.nombre)}-${fecha}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
