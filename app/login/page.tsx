"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !data.user) {
      setCargando(false);
      setError(
        signInError?.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : (signInError?.message ?? "No se pudo iniciar sesión.")
      );
      return;
    }

    const { data: perfil } = await supabase
      .from("perfiles")
      .select("rol")
      .eq("id", data.user.id)
      .single();

    router.refresh();
    router.push(perfil?.rol === "DOCENTE" ? "/docente" : "/estudiante");
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <form onSubmit={handleSubmit} className="card w-full max-w-sm p-6">
        <h1 className="font-title text-2xl text-verde-bosque">
          Iniciar sesión
        </h1>

        <div className="mt-6 flex flex-col gap-4">
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

          <label className="flex flex-col gap-1 text-sm text-ink/80">
            Contraseña
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
          </label>

          {error && <p className="text-sm text-terracota">{error}</p>}

          <button
            type="submit"
            disabled={cargando}
            className="btn-primary mt-2"
          >
            {cargando ? "Entrando…" : "Iniciar sesión"}
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-ink/70">
          ¿No tienes cuenta?{" "}
          <Link href="/registro" className="text-verde-bosque hover:underline">
            Regístrate
          </Link>
        </p>
      </form>
    </main>
  );
}
