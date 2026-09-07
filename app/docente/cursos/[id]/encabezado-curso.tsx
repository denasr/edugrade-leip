import Link from "next/link";

export default function EncabezadoCurso({
  curso,
}: {
  curso: { id: string; nombre: string; grupo: string; periodo: string; clave_acceso: string };
}) {
  return (
    <div className="w-full max-w-sm text-center lg:max-w-4xl">
      <Link href="/docente" className="link-muted">
        ← Mis cursos
      </Link>
      <h1 className="mt-2 font-title text-2xl text-verde-bosque">
        {curso.nombre}
      </h1>
      <p className="mt-1 text-sm text-ink/70">
        {curso.grupo} · {curso.periodo}
      </p>
      <span className="clave-acceso mt-2">{curso.clave_acceso}</span>
      <div>
        <Link
          href={`/docente/cursos/${curso.id}/calificaciones`}
          className="link-muted"
        >
          Ver libro de calificaciones →
        </Link>
      </div>
    </div>
  );
}
