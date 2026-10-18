-- Cierra el registro abierto como docente.
--
-- Antes, handle_new_user asignaba el rol que viniera en
-- raw_user_meta_data ->> 'rol', y /registro dejaba elegir "Docente" a
-- cualquiera. Ocultar esa opción del formulario no bastaba: signUp() se
-- llama directo contra Supabase desde el navegador, así que cualquiera
-- podía mandar rol = 'DOCENTE' sin pasar por el formulario.
--
-- Ahora el rol ya no depende de lo que mande el cliente: es DOCENTE solo si
-- el correo está en docentes_autorizados, y ESTUDIANTE en cualquier otro
-- caso. El rol sigue fijo desde el alta (trg_perfiles_prevenir_cambio_rol),
-- así que esta lista solo importa al momento de crear la cuenta: agregar o
-- quitar un correo no cambia el rol de cuentas que ya existen.
--
-- Ojo: "Confirm email" está desactivado en este proyecto, así que nadie
-- comprueba que quien se registra sea dueño del correo. Un correo de la
-- lista que todavía no tiene cuenta lo podría registrar otra persona antes
-- que su dueño. Por eso conviene agregar el correo de un docente nuevo
-- justo antes de que se registre, no con anticipación.

create table public.docentes_autorizados (
  correo text primary key check (correo = lower(trim(correo))),
  created_at timestamptz not null default now()
);

-- Sin ninguna policy, a propósito (mismo criterio que preguntas_examen):
-- nadie la lee ni la escribe desde la app; se administra desde el editor
-- SQL de Supabase o con la secret key. handle_new_user es security definer,
-- así que puede consultarla igual.
alter table public.docentes_autorizados enable row level security;

insert into public.docentes_autorizados (correo) values
  ('cabrygledem@gmail.com'),
  ('mardonesyursua@gmail.com');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, rol, nombre_completo)
  values (
    new.id,
    case
      when exists (
        select 1 from public.docentes_autorizados d
        where d.correo = lower(trim(new.email))
      )
        then 'DOCENTE'
      else 'ESTUDIANTE'
    end,
    coalesce(new.raw_user_meta_data ->> 'nombre_completo', '')
  );
  return new;
end;
$$;
