"use client";

import { useEffect } from "react";

// Red de seguridad para cualquier excepción sin capturar en un Server
// Component bajo el layout raíz (páginas, layouts anidados). Sin este
// archivo, cualquier error así muestra la pantalla genérica de Next.js/
// Vercel con un digest técnico — nada útil para un estudiante o docente.
// `retry` (no `reset`) es la prop de recuperación en esta versión de
// Next.js (16.3+); reintenta re-renderizar el segmento que falló.
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="card w-full max-w-sm p-6 text-center">
        <h1 className="font-title text-2xl text-verde-bosque">
          Algo salió mal
        </h1>
        <p className="mt-2 text-sm text-ink/70">
          Intenta de nuevo. Si el problema sigue, avísale a tu docente.
        </p>
        <button onClick={() => retry()} className="btn-primary mt-6">
          Intentar de nuevo
        </button>
      </div>
    </main>
  );
}
