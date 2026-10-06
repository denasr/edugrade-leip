-- Permite que un examen (o cuestionario) admita más de un intento,
-- configurable por actividad desde el formulario de crear/editar examen
-- (ver formulario-crear-examen.tsx) — por decisión del docente, no una
-- regla global. Las tareas de archivo siguen en "una entrega por
-- actividad" (default 1, sin UI para cambiarlo): esta columna vive en
-- `actividades` para todas, pero solo el examen expone el control.
alter table actividades
  add column intentos_permitidos smallint not null default 1
    check (intentos_permitidos in (1, 2));

-- Cada intento es su propia fila en `entregas` (con su propia evaluación
-- 1:1, igual que antes) en vez de sobrescribir la anterior, para no perder
-- el historial de qué contestó en cada intento. `intento` numera esas
-- filas por estudiante+actividad; el unique de abajo reemplaza al que
-- existía sobre (actividad_id, estudiante_id) nada más, que asumía
-- siempre un máximo de una entrega.
alter table entregas add column intento smallint not null default 1;

alter table entregas drop constraint entregas_actividad_id_estudiante_id_key;
alter table entregas
  add constraint entregas_actividad_id_estudiante_id_intento_key
    unique (actividad_id, estudiante_id, intento);

-- Asigna el número de intento en el servidor (nunca lo manda el cliente,
-- así no se puede falsear) y es el único lugar que de verdad limita cuántos
-- intentos caben: la policy entregas_insert_propia (RLS) no sabe nada de
-- intentos_permitidos, solo de fecha/bloqueo/inscripción. Dispara antes del
-- insert para los dos flujos que escriben en `entregas`
-- (crearEntrega/confirmarArchivosEntrega de una tarea, presentarExamen de
-- un examen o cuestionario) sin que ninguno de los dos tenga que calcular
-- nada: ambos simplemente insertan y dejan que esto decida.
create or replace function public.asignar_intento_entrega()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intentos_permitidos smallint;
  v_intentos_usados int;
begin
  select intentos_permitidos into v_intentos_permitidos
  from actividades
  where id = new.actividad_id;

  select count(*) into v_intentos_usados
  from entregas
  where actividad_id = new.actividad_id and estudiante_id = new.estudiante_id;

  if v_intentos_usados >= v_intentos_permitidos then
    if v_intentos_permitidos = 1 then
      raise exception 'Ya entregaste esta actividad.';
    else
      raise exception 'Ya usaste tus % intentos para esta actividad.', v_intentos_permitidos;
    end if;
  end if;

  new.intento := v_intentos_usados + 1;
  return new;
end;
$$;

create trigger trg_entregas_asignar_intento
  before insert on entregas
  for each row execute function public.asignar_intento_entrega();
