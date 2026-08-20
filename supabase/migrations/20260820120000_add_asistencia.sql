-- Asistencia: una sesión por día de clase tomado en un curso, con el estado
-- de cada estudiante inscrito para esa sesión. La lectura para el estudiante
-- y el cálculo de porcentajes quedan para encargos posteriores; aquí solo
-- el docente dueño del curso puede crear sesiones y leer/escribir asistencias.

create table sesiones_asistencia (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references cursos(id) on delete cascade,
  fecha date not null,
  creado_por uuid not null references auth.users(id),
  created_at timestamptz default now(),
  unique (curso_id, fecha)
);

create table asistencias (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references sesiones_asistencia(id) on delete cascade,
  estudiante_id uuid not null references auth.users(id),
  estado text not null default 'presente' check (estado in ('presente', 'ausente')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (sesion_id, estudiante_id)
);

create index idx_sesiones_asistencia_curso_id on sesiones_asistencia(curso_id);
create index idx_asistencias_sesion_id on asistencias(sesion_id);
create index idx_asistencias_estudiante_id on asistencias(estudiante_id);

create or replace function public.actualizar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_asistencias_updated_at
  before update on asistencias
  for each row execute function public.actualizar_updated_at();

-- Helper para las políticas, mismo patrón que es_docente_del_curso() etc.
create or replace function public.es_docente_de_sesion(p_sesion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from sesiones_asistencia s
    join cursos c on c.id = s.curso_id
    where s.id = p_sesion_id and c.docente_id = auth.uid()
  );
$$;

grant execute on function public.es_docente_de_sesion(uuid) to authenticated;

alter table sesiones_asistencia enable row level security;
alter table asistencias enable row level security;

create policy sesiones_asistencia_select_docente on sesiones_asistencia
  for select using (public.es_docente_del_curso(curso_id));

create policy sesiones_asistencia_insert_docente on sesiones_asistencia
  for insert with check (
    public.es_docente_del_curso(curso_id) and creado_por = auth.uid()
  );

create policy asistencias_select_docente on asistencias
  for select using (public.es_docente_de_sesion(sesion_id));

create policy asistencias_insert_docente on asistencias
  for insert with check (public.es_docente_de_sesion(sesion_id));

create policy asistencias_update_docente on asistencias
  for update using (public.es_docente_de_sesion(sesion_id))
  with check (public.es_docente_de_sesion(sesion_id));
