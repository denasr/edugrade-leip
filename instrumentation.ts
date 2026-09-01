import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captura automática de excepciones sin manejar durante el render de un
// Server Component/Route Handler — cubre lo mismo que error.tsx/
// global-error.tsx atrapan visualmente, pero del lado de Sentry.
export const onRequestError = Sentry.captureRequestError;
