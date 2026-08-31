"use client";

import { useEffect } from "react";

// Red de seguridad adicional: error.tsx no cubre errores del propio layout
// raíz (app/layout.tsx) — para eso hace falta global-error.tsx. En la
// práctica casi nunca se dispara (el layout raíz no hace fetch de datos),
// pero es la única forma de no caer en la pantalla genérica de Next.js/
// Vercel si algo ahí llegara a fallar. Next.js exige que global-error
// defina su propio <html>/<body> (reemplaza el layout raíz por completo) y
// documenta explícitamente que NO hereda los estilos globales de la app,
// así que no puede depender de las clases de Tailwind — todo va inline.
export default function GlobalError({
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
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f4efde",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          padding: "16px",
        }}
      >
        <div
          style={{
            maxWidth: "384px",
            width: "100%",
            textAlign: "center",
            backgroundColor: "#ffffff",
            border: "1px solid rgba(31, 59, 46, 0.15)",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <h1 style={{ color: "#244a38", fontSize: "1.5rem", margin: 0 }}>
            Algo salió mal
          </h1>
          <p
            style={{
              color: "rgba(42, 42, 36, 0.7)",
              fontSize: "0.875rem",
              marginTop: "8px",
            }}
          >
            Intenta de nuevo. Si el problema sigue, avísale a tu docente.
          </p>
          <button
            onClick={() => retry()}
            style={{
              marginTop: "24px",
              minHeight: "44px",
              backgroundColor: "#244a38",
              color: "#f4efde",
              border: "none",
              borderRadius: "999px",
              padding: "10px 20px",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Intentar de nuevo
          </button>
        </div>
      </body>
    </html>
  );
}
