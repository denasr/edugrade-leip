"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
        <div className="card w-full max-w-sm p-6 text-center">
          <h1 className="font-title text-2xl text-verde-bosque">
            Revisa tu correo
          </h1>
          <p className="mt-2 text-sm text-ink/70">
            Enviamos un enlace de confirmación a {resultado.correo}. Confírmalo
            para poder iniciar sesión.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <form onSubmit={handleSubmit} className="card w-full max-w-sm p-6">
        <h1 className="font-title text-2xl text-verde-bosque">
          Crear cuenta
        </h1>

        <div className="mt-6 flex flex-col gap-4">
          <fieldset className="flex gap-4">
            <legend className="mb-1 text-sm font-medium text-ink/80">
              Rol
            </legend>
            {(["ESTUDIANTE", "DOCENTE"] as const).map((opcion) => (
              <label
                key={opcion}
                className="flex items-center gap-2 text-sm text-ink/80"
              >
                <input
                  type="radio"
                  name="rol"
                  value={opcion}
                  checked={rol === opcion}
                  onChange={() => setRol(opcion)}
                  className="accent-verde-bosque"
                />
                {opcion === "ESTUDIANTE" ? "Estudiante" : "Docente"}
              </label>
            ))}
          </fieldset>

          <label className="flex flex-col gap-1 text-sm text-ink/80">
            Nombre completo
            <input
              type="text"
              required
              value={nombreCompleto}
              onChange={(e) => setNombreCompleto(e.target.value)}
              className="input"
            />
          </label>

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
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
          </label>

          {error && <p className="text-sm text-terracota">{error}</p>}

          <button type="submit" disabled={cargando} className="btn-primary mt-2">
            {cargando ? "Creando cuenta…" : "Crear cuenta"}
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-ink/60">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-verde-bosque hover:underline">
            Inicia sesión
          </Link>
        </p>
      </form>
    </main>
  );
}
