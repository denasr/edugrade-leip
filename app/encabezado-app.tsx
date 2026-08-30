import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import BotonCerrarSesion from "./boton-cerrar-sesion";

export default async function EncabezadoApp() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre_completo")
    .eq("id", user.id)
    .single();

  return (
    <header className="flex w-full items-center justify-between border-b border-verde-bosque/15 bg-superficie px-4 py-3">
      <span className="flex items-center gap-2">
        <Image
          src="/virtualgrade-icono.png"
          alt=""
          width={384}
          height={384}
          className="h-6 w-6"
          priority
        />
        <Image
          src="/virtualgrade-wordmark.png"
          alt="Virtual Grade"
          width={530}
          height={80}
          className="h-4 w-auto"
          priority
        />
      </span>
      <div className="flex items-center gap-4">
        <span className="hidden text-sm text-ink/70 sm:inline">
          {perfil?.nombre_completo}
        </span>
        <BotonCerrarSesion />
      </div>
    </header>
  );
}
