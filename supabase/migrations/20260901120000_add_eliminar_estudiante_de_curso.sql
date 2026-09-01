-- Permite al docente eliminar por completo a un estudiante de un curso
-- (caso de inscripción por error, no baja normal): su inscripción, todas
-- sus entregas del curso, respuestas de examen, evaluaciones y los
-- registros de sus archivos entregados. No toca perfiles ni auth.users.
--
-- Igual que con sesiones_asistencia/asistencias (migración 20260828120000):
-- antes de esta migración ninguna de estas tablas tenía policy de delete
-- para el docente (entregas, respuestas_examen, evaluaciones no tenían
-- ninguna para nadie; archivos_entrega solo para el estudiante dueño). Sin
-- esto, el borrado en cascada fallaría a mitad de camino.

create policy entregas_delete_docente on entregas
  for delete using (public.es_docente_de_actividad(actividad_id));

create policy archivos_entrega_delete_docente on archivos_entrega
  for delete using (public.es_docente_de_entrega(entrega_id));

create policy respuestas_examen_delete_docente on respuestas_examen
  for delete using (public.es_docente_de_entrega(entrega_id));

create policy evaluaciones_delete_docente on evaluaciones
  for delete using (public.es_docente_de_entrega(entrega_id));

create policy storage_entregas_delete_docente on storage.objects
  for delete using (
    bucket_id = 'archivos-entrega'
    and public.es_docente_de_entrega((storage.foldername(name))[1]::uuid)
  );

-- Partido en DOS funciones (dos transacciones atómicas) en vez de una sola,
-- con el borrado de Storage corriendo entre ambas desde la Server Action.
-- Motivo: storage_entregas_delete_docente (arriba) valida
-- es_docente_de_entrega(entrega_id), que necesita que la fila de `entregas`
-- siga existiendo para resolver quién es el docente dueño. Si las 5 tablas
-- se borraran en una sola función y el storage.remove() corriera después
-- (como debe, para no borrar archivos antes de confirmar que el resto del
-- borrado va a tener éxito), la fila `entregas` ya estaría borrada para
-- cuando corre storage.remove() — la policy dejaría de matchear cualquier
-- fila, y el delete "tendría éxito" sin borrar nada (DELETE con 0 filas
-- afectadas por RLS no es un error en Postgres). Confirmado así en vivo.
--
-- Con el borrado partido en dos fases, la fila `entregas` sigue viva
-- durante el storage.remove() (todavía no llegó la fase 2), así que la
-- policy de Storage sigue siendo válida.
--
-- Igual que antes, ninguna de las dos es `security definer`: corren con
-- los privilegios de quien llama, cada delete de adentro sigue evaluando
-- las mismas policies RLS de arriba.

-- Fase 1: evaluaciones, respuestas_examen, archivos_entrega (registros).
-- La fila de `entregas` NO se toca todavía.
create or replace function public.eliminar_estudiante_de_curso_datos(
  p_curso_id uuid,
  p_estudiante_id uuid
)
returns void
language plpgsql
as $$
begin
  if not public.es_docente_del_curso(p_curso_id) then
    raise exception 'No tienes permiso sobre este curso';
  end if;

  delete from evaluaciones
  where entrega_id in (
    select e.id from entregas e
    join actividades a on a.id = e.actividad_id
    where a.curso_id = p_curso_id and e.estudiante_id = p_estudiante_id
  );

  delete from respuestas_examen
  where entrega_id in (
    select e.id from entregas e
    join actividades a on a.id = e.actividad_id
    where a.curso_id = p_curso_id and e.estudiante_id = p_estudiante_id
  );

  delete from archivos_entrega
  where entrega_id in (
    select e.id from entregas e
    join actividades a on a.id = e.actividad_id
    where a.curso_id = p_curso_id and e.estudiante_id = p_estudiante_id
  );
end;
$$;

-- Fase 2: entregas, inscripciones. Se llama después de que la Server
-- Action ya intentó borrar los archivos físicos de Storage.
create or replace function public.eliminar_estudiante_de_curso_final(
  p_curso_id uuid,
  p_estudiante_id uuid
)
returns void
language plpgsql
as $$
begin
  if not public.es_docente_del_curso(p_curso_id) then
    raise exception 'No tienes permiso sobre este curso';
  end if;

  delete from entregas
  where estudiante_id = p_estudiante_id
    and actividad_id in (select id from actividades where curso_id = p_curso_id);

  delete from inscripciones
  where curso_id = p_curso_id and estudiante_id = p_estudiante_id;
end;
$$;

grant execute on function
  public.eliminar_estudiante_de_curso_datos(uuid, uuid),
  public.eliminar_estudiante_de_curso_final(uuid, uuid)
to authenticated;
