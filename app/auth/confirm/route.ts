import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Ruta a la que apunta el enlace que Supabase manda por correo para
// restablecer contraseña (y, si algún día se reactiva "Confirm email" en el
// proyecto, también la confirmación de cuenta al registrarse).
//
// Confirmado en vivo contra este proyecto: el enlace entrega la sesión como
// fragmento de URL (#access_token=...&refresh_token=...), no como query
// param — un fragmento nunca llega al servidor, así que cuando no hay
// `code` ni `token_hash` aquí no significa que el enlace sea inválido, solo
// que el token viene en el fragmento. En ese caso no hay nada que este
// Route Handler pueda hacer: se deja pasar tal cual a `next`, que sí corre
// en el navegador y puede leerlo (ver formulario-nueva-contrasena.tsx). Las
// otras dos ramas (`code` para PKCE, `token_hash`+`type` para el formato de
// los templates de correo sin personalizar) se dejan por robustez, por si
// la configuración de Auth del proyecto cambia más adelante.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (code || (tokenHash && type)) {
    const supabase = await createClient();
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ type: type!, token_hash: tokenHash! });

    if (error) {
      return NextResponse.redirect(`${origin}/recuperar?error=enlace-invalido`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
