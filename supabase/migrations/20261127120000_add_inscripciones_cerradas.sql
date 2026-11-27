-- Cerrar y reabrir las inscripciones de un curso. Complementa "Cambiar clave
-- de acceso": cambiar la clave reemplaza la llave; cerrar inscripciones
-- cierra la puerta aunque alguien tenga la clave vigente. No toca
-- inscripciones existentes ni nada más del curso: el docente lo sigue usando
-- igual. false = abiertas (todos los cursos existentes quedan así).
alter table cursos
  add column inscripciones_cerradas boolean not null default false;

-- Misma función que en 20261101120000_add_archivar_curso.sql (que a su vez
-- parte de 20260828130000_add_ya_inscrito_check.sql), con un chequeo más.
-- El chequeo de inscripciones cerradas va después de "Ya estás inscrito" a
-- propósito: a quien ya está inscrito y vuelve a teclear la clave le sirve
-- más ese mensaje que "están cerradas", que lo haría pensar que lo sacaron.
create or replace function public.inscribirse_a_curso(p_clave_acceso text)
returns cursos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso cursos%rowtype;
  v_rol text;
  v_ya_inscrito boolean;
begin
  select rol into v_rol from perfiles where id = auth.uid();
  if v_rol is distinct from 'ESTUDIANTE' then
    raise exception 'Solo un estudiante puede inscribirse a un curso';
  end if;

  select * into v_curso from cursos where clave_acceso = p_clave_acceso;
  if not found then
    raise exception 'Clave de acceso inválida';
  end if;

  if v_curso.archivado_at is not null then
    raise exception 'Este curso ya terminó y no admite inscripciones';
  end if;

  select exists(
    select 1 from inscripciones
    where curso_id = v_curso.id and estudiante_id = auth.uid()
  ) into v_ya_inscrito;

  if v_ya_inscrito then
    raise exception 'Ya estás inscrito en este curso';
  end if;

  if v_curso.inscripciones_cerradas then
    raise exception 'Las inscripciones de este curso están cerradas';
  end if;

  insert into inscripciones (curso_id, estudiante_id)
  values (v_curso.id, auth.uid());

  return v_curso;
end;
$$;

-- create or replace conserva los permisos, pero se repiten por claridad
-- (mismos que en la migración inicial).
revoke all on function public.inscribirse_a_curso(text) from public;
grant execute on function public.inscribirse_a_curso(text) to authenticated;
