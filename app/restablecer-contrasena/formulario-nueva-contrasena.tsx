"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type EstadoSesion = "verificando" | "valida" | "invalida";

export default function FormularioNuevaContrasena() {
  const router = useRouter();
  const [estadoSesion, setEstadoSesion] = useState<EstadoSesion>("verificando");
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El enlace de recuperación de Supabase para este proyecto entrega la
  // sesión como fragmento de URL (#access_token=...&refresh_token=...),
  // no como query param — un fragmento nunca llega al servidor (ni a
  // /auth/confirm ni a este mismo Server Component), así que la única
  // forma de establecer la sesión es leerlo aquí, en el navegador, antes de
  // decidir si mostrar el formulario o el aviso de enlace inválido.
  useEffect(() => {
    async function verificarSesion() {
      const supabase = createClient();
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (accessToken && refreshToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        // Limpia el fragmento de la barra de direcciones: ya cumplió su
        // función (establecer la sesión) y no debe quedar un token
        // reutilizable visible en el historial del navegador.
        window.history.replaceState(null, "", window.location.pathname);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      setEstadoSesion(user ? "valida" : "invalida");
    }

    verificarSesion();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmacion) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setCargando(true);
    const supabase = createClient();
    const { data, error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError || !data.user) {
      setCargando(false);
      setError(updateError?.message ?? "No se pudo cambiar la contraseña.");
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

  if (estadoSesion === "verificando") {
    return (
      <div className="card w-full max-w-sm p-6 text-center">
        <p className="text-sm text-ink/70">Verificando enlace…</p>
      </div>
    );
  }

  if (estadoSesion === "invalida") {
    return (
      <div className="card w-full max-w-sm p-6 text-center">
        <h1 className="font-title text-2xl text-verde-bosque">
          Enlace inválido
        </h1>
        <p className="mt-2 text-sm text-ink/70">
          Este enlace venció o ya se usó.
        </p>
        <p className="mt-6 text-sm text-ink/70">
          <Link href="/recuperar" className="text-verde-bosque hover:underline">
            Pedir uno nuevo
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card w-full max-w-sm p-6">
      <h1 className="font-title text-2xl text-verde-bosque">
        Nueva contraseña
      </h1>
      <p className="mt-2 text-sm text-ink/70">
        Escribe tu nueva contraseña para esta cuenta.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Contraseña nueva
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink/80">
          Confirmar contraseña
          <input
            type="password"
            required
            minLength={6}
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            className="input"
          />
        </label>

        {error && <p className="text-sm text-terracota">{error}</p>}

        <button type="submit" disabled={cargando} className="btn-primary mt-2">
          {cargando ? "Guardando…" : "Guardar contraseña"}
        </button>
      </div>
    </form>
  );
}
