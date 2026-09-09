// Respaldo manual de la base de datos — complemento a lo que incluya el
// plan de Supabase, no un reemplazo. No trae point-in-time recovery ni
// nada automático: es una fotografía completa de cada tabla en un momento
// dado, para tener algo local si algún día hiciera falta reconstruir datos.
//
// Uso: node scripts/respaldar-base-datos.mjs
// (necesita .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY,
// igual que el resto de la app)
//
// Guarda un JSON por tabla en backups/<fecha>/ — esa carpeta está en
// .gitignore a propósito: son datos reales de estudiantes (nombres,
// respuestas, calificaciones), no deben terminar en el historial de git.
//
// Solo respalda las filas de la base de datos, NO los archivos físicos en
// Storage (materiales-actividades, archivos-entrega) — cada fila de
// archivos_entrega/materiales_actividad sí queda guardada, con su
// storage_path, pero el archivo en sí no se descarga aquí. Si se necesita
// respaldar también los archivos, es un script aparte (más grande: hay que
// bajar cada objeto de Storage, no solo leer filas de Postgres).

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raizProyecto = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function cargarEnv() {
  const contenido = readFileSync(path.join(raizProyecto, ".env.local"), "utf8");
  return Object.fromEntries(
    contenido
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

// Todas las tablas propias del esquema (ver CLAUDE.md) — deliberadamente
// no incluye preguntas_examen con su columna `correcta` por separado de
// las demás: es la misma tabla que cualquier otra, se respalda igual.
const TABLAS = [
  "perfiles",
  "cursos",
  "inscripciones",
  "actividades",
  "materiales_actividad",
  "preguntas_examen",
  "entregas",
  "archivos_entrega",
  "respuestas_examen",
  "evaluaciones",
  "sesiones_asistencia",
  "asistencias",
];

async function main() {
  const env = cargarEnv();
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const marcaTiempo = new Date().toISOString().replace(/:/g, "-").slice(0, 19);
  const carpetaDestino = path.join(raizProyecto, "backups", marcaTiempo);
  mkdirSync(carpetaDestino, { recursive: true });

  const resumen = {};
  for (const tabla of TABLAS) {
    const { data, error } = await admin.from(tabla).select("*");
    if (error) {
      console.error(`❌ ${tabla}: ${error.message}`);
      resumen[tabla] = { error: error.message };
      continue;
    }
    writeFileSync(
      path.join(carpetaDestino, `${tabla}.json`),
      JSON.stringify(data, null, 2)
    );
    resumen[tabla] = { filas: data.length };
    console.log(`✅ ${tabla}: ${data.length} filas`);
  }

  writeFileSync(
    path.join(carpetaDestino, "_resumen.json"),
    JSON.stringify({ fecha: new Date().toISOString(), tablas: resumen }, null, 2)
  );

  console.log(`\nRespaldo guardado en: ${carpetaDestino}`);
}

main().catch((err) => {
  console.error("Error inesperado en el respaldo:", err);
  process.exit(1);
});
