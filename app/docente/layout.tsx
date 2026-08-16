import type { ReactNode } from "react";
import EncabezadoApp from "../encabezado-app";

export default function DocenteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <EncabezadoApp />
      {children}
    </>
  );
}
