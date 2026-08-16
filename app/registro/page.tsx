"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Rol = "DOCENTE" | "ESTUDIANTE";
type Resultado = { tipo: "REVISAR_CORREO"; correo: string };

export default function RegistroPage() {
  const router = useRouter();
  const [rol, setRol] = useState<Rol>("ESTUDIANTE");
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { rol, nombre_completo: nombreCompleto },
      },
    });

    if (signUpError) {
      setCargando(false);
      setError(signUpError.message);
      return;
    }

    // Con "Confirm email" desactivado, signUp() devuelve sesión activa de
    // inmediato: este es el caso principal. Si se reactiva la confirmación
    // por correo, data.session viene null y hay que avisarle al usuario.
    // router.refresh() sincroniza las cookies de sesión que dejó el cliente
    // de Supabase antes de navegar, para que /docente o /estudiante (Server
    // Components) ya vean al usuario autenticado.
    if (data.session) {
      router.refresh();
      router.push(rol === "DOCENTE" ? "/docente" : "/estudiante");
      return;
    }

    setCargando(false);
    setResultado({ tipo: "REVISAR_CORREO", correo: email });
  }

  if (resultado?.tipo === "REVISAR_CORREO") {
    return (
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Revisa tu correo
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Enviamos un enlace de confirmación a {resultado.correo}. Confírmalo
            para poder iniciar sesión.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-zinc-200 p-6 dark:border-zinc-800"
      >
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Crear cuenta
        </h1>

        <div className="mt-6 flex flex-col gap-4">
          <fieldset className="flex gap-4">
            <legend className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Rol
            </legend>
            {(["ESTUDIANTE", "DOCENTE"] as const).map((opcion) => (
              <label
                key={opcion}
                className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
              >
                <input
                  type="radio"
                  name="rol"
                  value={opcion}
                  checked={rol === opcion}
                  onChange={() => setRol(opcion)}
                />
                {opcion === "ESTUDIANTE" ? "Estudiante" : "Docente"}
              </label>
            ))}
          </fieldset>

          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Nombre completo
            <input
              type="text"
              required
              value={nombreCompleto}
              onChange={(e) => setNombreCompleto(e.target.value)}
              className="rounded border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Correo electrónico
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Contraseña
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="mt-2 rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {cargando ? "Creando cuenta…" : "Crear cuenta"}
          </button>
        </div>
      </form>
    </main>
  );
}
