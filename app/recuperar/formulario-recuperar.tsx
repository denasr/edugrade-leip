"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function FormularioRecuperar({
  enlaceInvalido,
}: {
  enlaceInvalido: boolean;
}) {
  const [email, setEmail] = useState("");
  const [cargando, setCargando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setCargando(true);

    const supabase = createClient();
    // El error de resetPasswordForEmail nunca se le muestra al usuario: si
    // se revelara "ese correo no existe" alguien podría usar este formulario
    // para averiguar qué correos están registrados. Se muestra el mismo
    // mensaje de éxito exista o no la cuenta, y se ignora el error de red
    // aquí a propósito — cualquier problema real (SMTP mal configurado,
    // etc.) solo lo puede diagnosticar el docente revisando los logs de
    // Supabase, no algo que el formulario pueda explicarle al estudiante.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/restablecer-contrasena`,
    });

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
