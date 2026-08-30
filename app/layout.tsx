import type { Metadata } from "next";
import { Source_Serif_4, Inter, Space_Mono } from "next/font/google";
import { ToastProvider } from "./toast-provider";
import "./globals.css";

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Virtual Grade",
  description: "Tareas y evaluaciones para grupos de LEIP — UPN Unidad 321 Zacatecas",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${sourceSerif.variable} ${inter.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-crema font-sans text-ink">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
