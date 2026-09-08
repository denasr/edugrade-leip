import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default de Next.js: 1 MB para el cuerpo de una Server Action —
      // cualquier Server Action que reciba archivos (entregarTarea,
      // crearActividad, editarActividad, crearExamen) lo rebasa con casi
      // cualquier foto real de celular, antes de que el código de la
      // acción llegue a correr (Next la rechaza en su propio parser, con
      // un 413 que este proyecto termina mostrando como "Algo salió mal").
      // 35mb da margen sobre el tope de 30 MB combinados que ya valida
      // entregarTarea, más el overhead de multipart/form-data.
      bodySizeLimit: "35mb",
    },
  },
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
