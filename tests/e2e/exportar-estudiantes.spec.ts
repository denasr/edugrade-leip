import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import {
  crearCuenta,
  borrarCuenta,
  crearCurso,
  borrarCurso,
  inscribir,
  iniciarSesion,
  type CuentaPrueba,
} from "./helpers/cuentas-prueba";

test.describe("Exportar lista de estudiantes a Excel", () => {
  let docente: CuentaPrueba;
  let estudianteA: CuentaPrueba;
  let estudianteB: CuentaPrueba;
  let cursoId: string;

  test.beforeAll(async () => {
    docente = await crearCuenta("DOCENTE", "export-est-doc");
    estudianteA = await crearCuenta("ESTUDIANTE", "export-est-a");
    estudianteB = await crearCuenta("ESTUDIANTE", "export-est-b");
    cursoId = await crearCurso(docente.id);
    await inscribir(cursoId, estudianteA.id);
    await inscribir(cursoId, estudianteB.id);
  });

  test.afterAll(async () => {
    await borrarCurso(cursoId);
    await borrarCuenta(docente.id);
    await borrarCuenta(estudianteA.id);
    await borrarCuenta(estudianteB.id);
  });

  test("el botón descarga un .xlsx real con nombre, correo y fecha de inscripción de cada inscrito", async ({
    page,
  }) => {
    await iniciarSesion(page, docente.email, docente.password);
    await page.goto(`/docente/cursos/${cursoId}/estudiantes`);
    await expect(page.getByText(estudianteA.email)).toBeVisible();
    await expect(page.getByText(estudianteB.email)).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Exportar a Excel" }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(
      /^estudiantes-curso-de-prueba-e2e-\d{4}-\d{2}-\d{2}\.xlsx$/
    );

    const rutaDescarga = await download.path();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(rutaDescarga!);
    const hoja = workbook.getWorksheet("Estudiantes");
    if (!hoja) throw new Error('No se encontró la hoja "Estudiantes" en el archivo descargado.');

    expect(hoja.getRow(1).getCell(1).text).toBe("Nombre completo");
    expect(hoja.getRow(1).getCell(2).text).toBe("Correo");
    expect(hoja.getRow(1).getCell(3).text).toBe("Fecha de inscripción");

    const correos = [2, 3].map((fila) => hoja.getRow(fila).getCell(2).text);
    expect(correos).toContain(estudianteA.email);
    expect(correos).toContain(estudianteB.email);

    // La fecha de inscripción no debe quedar en blanco ni como "—" (el
    // placeholder que usa la celda cuando no hay dato): ambos estudiantes
    // sí tienen inscripción real.
    const fechas = [2, 3].map((fila) => hoja.getRow(fila).getCell(3).text);
    for (const fecha of fechas) {
      expect(fecha).not.toBe("");
      expect(fecha).not.toBe("—");
    }
  });
});
