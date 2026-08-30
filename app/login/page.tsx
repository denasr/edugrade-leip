"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
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
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16">
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-3">
          <Image
            src="/virtualgrade-icono.png"
            alt=""
            width={384}
            height={384}
            className="h-14 w-14"
            priority
          />
          <Image
            src="/virtualgrade-wordmark.png"
            alt="Virtual Grade"
            width={530}
            height={80}
            className="h-9 w-auto"
            priority
          />
        </div>
        <Image
          src="/virtualgrade-eslogan.png"
          alt="Evalúa · Sigue · Logra"
          width={530}
          height={28}
          className="h-3 w-auto"
          priority
        />
      </div>

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
