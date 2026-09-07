import type { MetadataRoute } from "next";

// Con esto, Chrome/Edge (computadora y Android) ofrecen instalar la app, y
// en iOS aparece la opción "Agregar a inicio" en el share sheet de Safari
// (iOS no muestra un botón de instalar automático, pero sí usa este
// manifest + app/apple-icon.png para el ícono y el nombre una vez agregada).
// Sin service worker a propósito: esto la hace instalable, no funciona sin
// conexión — eso es un encargo aparte, más invasivo (estrategia de caché
// para una app que en su mayoría depende de datos en vivo de Supabase).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Virtual Grade",
    short_name: "Virtual Grade",
    description:
      "Tareas y evaluaciones para grupos de LEIP — UPN Unidad 321 Zacatecas",
    start_url: "/",
    display: "standalone",
    background_color: "#f4efde",
    theme_color: "#244a38",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
