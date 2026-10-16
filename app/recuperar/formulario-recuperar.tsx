"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@supabase/supabase-js";

// Cliente aparte, con flujo "implicit", solo para pedir el enlace. El
// cliente normal del navegador (@supabase/ssr, ver lib/supabase/client.ts)
// usa PKCE: el enlace del correo llega como ?code=... y canjearlo exige un
// code_verifier que quedó guardado en una cookie del navegador donde se
// pidió. Si el estudiante pedía el enlace en un dispositivo y lo abría en
// otro — o desde la app de Gmail, que abre su propio navegador — el canje
// fallaba y veía "El enlace venció o ya se usó". Con "implicit" el enlace
// trae la sesión en el fragmento (#access_token=...), que funciona en
// cualquier navegador y es justo el formato que ya lee
// formulario-nueva-contrasena.tsx.
function createClienteRecuperacion() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}

export default function FormularioRecuperar({
  enlaceInvalido,
}: {
  enlaceInvalido: boolean;
}) {
  const [email, setEmail] = useState("");
  const [cargando, setCargando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setCargando(true);

    setError(null);
    const supabase = createClienteRecuperacion();
    // "Ese correo no existe" nunca se muestra (permitiría averiguar qué
    // correos están registrados) — Supabase de todos modos responde éxito
    // para un correo sin cuenta. Pero antes también se tragaba cualquier
    // otro error y se mostraba "Revisa tu correo" aunque no se hubiera
    // enviado nada: el límite de envíos por hora de Supabase dejaba al
    // estudiante esperando un correo que nunca iba a llegar. Esos errores
    // no revelan nada de la cuenta, así que sí se muestran.
    const { error: errorEnvio } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${window.location.origin}/auth/confirm?next=/restablecer-contrasena`,
      }
    );

    if (errorEnvio) {
      Sentry.captureException(errorEnvio, { tags: { flujo: "recuperar-contrasena" } });
      setCargando(false);
      setError(
        errorEnvio.status === 429
          ? "Se pidieron demasiados enlaces en poco tiempo. Espera unos minutos e intenta de nuevo."
          : "No se pudo enviar el enlace. Intenta de nuevo en un momento."
      );
      return;
    }

    setCargando(false);
    setEnviado(true);
  }

  if (enviado) {
    return (
      <div className="card w-full max-w-sm p-6 text-center">
        <h1 className="font-title text-2xl text-verde-bosque">
          Revisa tu correo
        </h1>
        <p className="mt-2 text-sm text-ink/70">
          Si {email} tiene una cuenta, te enviamos un enlace para restablecer
          tu contraseña.
        </p>
        <p className="mt-6 text-sm text-ink/70">
          <Link href="/login" className="text-verde-bosque hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card w-full max-w-sm p-6">
      <h1 className="font-title text-2xl text-verde-bosque">
        Recuperar contraseña
      </h1>
      <p className="mt-2 text-sm text-ink/70">
        Escribe tu correo y te mandamos un enlace para poner una contraseña
        nueva.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {enlaceInvalido && (
          <p className="text-sm text-terracota">
            El enlace venció o ya se usó. Pide uno nuevo.
          </p>
        )}

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Correo electrónico
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </label>

        {error && <p className="text-sm text-terracota">{error}</p>}

        <button type="submit" disabled={cargando} className="btn-primary mt-2">
          {cargando ? "Enviando…" : "Enviar enlace"}
        </button>
      </div>

      <p className="mt-6 text-center text-sm text-ink/70">
        <Link href="/login" className="text-verde-bosque hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </form>
  );
}
