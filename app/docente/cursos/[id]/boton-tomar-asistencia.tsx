"use client";

import { useRouter } from "next/navigation";

// Calcula "hoy" con la fecha local del navegador (el docente), no la del
// servidor: si el server corre en UTC y el docente está en Zacatecas
// (UTC-6), calcularla del lado servidor registraría la fecha equivocada
// buena parte de la tarde/noche.
function fechaLocalHoy(): string {
  const hoy = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;
}

export default function BotonTomarAsistencia({ cursoId }: { cursoId: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push(`/docente/cursos/${cursoId}/asistencia/${fechaLocalHoy()}`)}
      className="btn-primary w-full max-w-sm"
    >
      Tomar asistencia de hoy
    </button>
  );
}
