import FormularioRecuperar from "./formulario-recuperar";

export default async function RecuperarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <FormularioRecuperar enlaceInvalido={error === "enlace-invalido"} />
    </main>
  );
}
