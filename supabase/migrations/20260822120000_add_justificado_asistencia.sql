-- Agrega 'justificado' como tercer valor válido de asistencias.estado, sobre
-- el sistema de asistencia que ya existe. No se crea ninguna tabla nueva.
-- El nombre del CHECK constraint original no se fija a mano: se busca por su
-- definición (contiene 'presente' y 'ausente') en vez de asumir el nombre
-- autogenerado, para no fallar si Postgres lo llamó distinto.

do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'asistencias'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%presente%'
    and pg_get_constraintdef(oid) like '%ausente%';

  if v_constraint_name is not null then
    execute format('alter table asistencias drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table asistencias
  add constraint asistencias_estado_check
  check (estado in ('presente', 'ausente', 'justificado'));
