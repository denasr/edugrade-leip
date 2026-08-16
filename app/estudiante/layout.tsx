import type { ReactNode } from "react";
import EncabezadoApp from "../encabezado-app";

export default function EstudianteLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <EncabezadoApp />
      {children}
    </>
  );
}
