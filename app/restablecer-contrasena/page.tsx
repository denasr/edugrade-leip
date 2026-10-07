import FormularioNuevaContrasena from "./formulario-nueva-contrasena";

// Sin verificación de sesión aquí: el enlace de recuperación de Supabase
// para este proyecto entrega la sesión como fragmento de URL
// (#access_token=...), que nunca llega al servidor — solo el cliente puede
// leerlo y decidir si el enlace es válido. Ver el comentario en
// formulario-nueva-contrasena.tsx.
export default function RestablecerContrasenaPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <FormularioNuevaContrasena />
    </main>
  );
}
