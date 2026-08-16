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
      <span className="font-title text-lg text-verde-bosque">
        EduGrade LEIP
      </span>
      <div className="flex items-center gap-4">
        <span className="text-sm text-ink/70">{perfil?.nombre_completo}</span>
        <BotonCerrarSesion />
      </div>
    </header>
  );
}
