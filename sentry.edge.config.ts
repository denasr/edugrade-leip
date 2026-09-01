import * as Sentry from "@sentry/nextjs";

// Cubre proxy.ts (corre en el runtime Edge) — sin esto, cualquier excepción
// ahí quedaría fuera de Sentry aunque server/cliente sí estén cubiertos.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
});
