-- Archivar un curso al terminar el semestre: sale de la lista principal del
-- docente (pasa a "Cursos archivados") pero sigue completo y editable. Es
-- solo organización del docente — no borra ni oculta nada para nadie más
-- (al terminar el curso el docente elimina a sus estudiantes aparte).
-- null = activo; la fecha queda como registro de cuándo se archivó.
alter table cursos add column archivado_at timestamptz;

-- Lo único que sí cambia: un curso archivado ya no admite inscripciones
-- nuevas con su clave de acceso. Misma función que en
-- 20260828130000_add_ya_inscrito_check.sql, con un chequeo más.
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

  insert into inscripciones (curso_id, estudiante_id)
  values (v_curso.id, auth.uid());

  return v_curso;
end;
$$;
