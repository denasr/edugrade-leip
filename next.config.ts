import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  /* config options here */
};

// Sin authToken: no se generó un SENTRY_AUTH_TOKEN (eso requiere el wizard
// interactivo o generarlo a mano en el dashboard de Sentry), así que no se
// suben source maps todavía — los stack traces en Sentry se ven minificados
// hasta que se agregue ese token. La captura de errores en sí no depende de
// esto, ya funciona sin source maps.
export default withSentryConfig(nextConfig, {
  org: "denasr",
  project: "virtual-grade",
  silent: !process.env.CI,
});
