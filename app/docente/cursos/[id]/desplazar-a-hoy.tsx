"use client";

import { useEffect, useRef, type ReactNode } from "react";

// En celular la línea del semestre es más ancha que la pantalla y se
// desplaza de lado. Al cargar, la recorre para que "Hoy" quede a la vista
// (en vez de mostrar agosto, que ya pasó).
export default function DesplazarAHoy({
  posicionHoy,
  children,
}: {
  posicionHoy: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = (el.scrollWidth * posicionHoy) / 100 - el.clientWidth * 0.7;
  }, [posicionHoy]);

  return (
    <div ref={ref} className="-mx-1 overflow-x-auto px-1 pb-1">
      {children}
    </div>
  );
}
