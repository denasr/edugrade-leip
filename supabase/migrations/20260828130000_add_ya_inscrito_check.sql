-- inscribirse_a_curso() usaba "on conflict ... do nothing" cuando el
-- estudiante ya estaba inscrito: no fallaba ni avisaba, simplemente no hacía
-- nada y devolvía éxito, dejando al formulario sin ningún mensaje que
-- mostrar. Ahora verifica la inscripción existente antes del insert y avisa
-- con el mismo mecanismo que ya usa "Clave de acceso inválida".

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
