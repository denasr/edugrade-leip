import * as Sentry from "@sentry/nextjs";

// Solo captura de errores — sin Session Replay, sin Feedback widget, sin
// tracing de performance (tracesSampleRate: 0). El plan gratuito de Sentry
// mide replay/performance aparte de errores; activarlos sin que se pidan
// consumiría esa cuota más rápido para algo que no se necesitaba resolver.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
