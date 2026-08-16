-- EduGrade LEIP — migración inicial
-- Esquema, RLS, trigger de alta de usuario, RPC de inscripción y buckets de Storage.
-- Ver CLAUDE.md, secciones "Esquema de base de datos" y "Permisos esperados".

create extension if not exists pgcrypto;

-- =========================================================================
-- 1. TABLAS
-- =========================================================================

create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('DOCENTE','ESTUDIANTE')),
  nombre_completo text not null,
  created_at timestamptz default now()
);

create table cursos (
  id uuid primary key default gen_random_uuid(),
  docente_id uuid not null references auth.users(id),
  nombre text not null,
  grupo text not null,
  periodo text not null,
  clave_acceso text not null unique,
  created_at timestamptz default now()
);

create table inscripciones (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references cursos(id) on delete cascade,
  estudiante_id uuid not null references auth.users(id),
  created_at timestamptz default now(),
  unique (curso_id, estudiante_id)
);

create table actividades (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references cursos(id) on delete cascade,
  titulo text not null,
  tipo text not null check (tipo in ('TAREA','EXAMEN')),
  instrucciones text,
  fecha_apertura timestamptz,
  fecha_cierre timestamptz not null,
  ponderacion numeric not null default 10,
  bloqueado_manual boolean not null default false,
  created_at timestamptz default now()
);

create table materiales_actividad (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references actividades(id) on delete cascade,
  nombre_archivo text not null,
  storage_path text not null,
  tamano_bytes bigint,
  created_at timestamptz default now()
);

create table preguntas_examen (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references actividades(id) on delete cascade,
  enunciado text not null,
  opciones jsonb not null,
  correcta text not null,
  puntos numeric not null default 5,
  orden int not null default 0
);

create table entregas (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references actividades(id) on delete cascade,
  estudiante_id uuid not null references auth.users(id),
  comentario_estudiante text,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE','CALIFICADO')),
  created_at timestamptz default now(),
  unique (actividad_id, estudiante_id)
);

create table archivos_entrega (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references entregas(id) on delete cascade,
  nombre_archivo text not null,
  storage_path text not null,
  tamano_bytes bigint,
  created_at timestamptz default now()
);

create table respuestas_examen (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references entregas(id) on delete cascade,
  pregunta_id uuid not null references preguntas_examen(id),
  respuesta_seleccionada text,
  unique (entrega_id, pregunta_id)
);

create table evaluaciones (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null unique references entregas(id) on delete cascade,
  calificacion_final numeric not null check (calificacion_final >= 0 and calificacion_final <= 10),
  comentarios text,
  origen text not null check (origen in ('MANUAL','AUTO_EXAMEN')),
  created_at timestamptz default now()
);

-- Índices de apoyo para las políticas RLS (todas resuelven por FK).
create index idx_cursos_docente_id on cursos(docente_id);
create index idx_inscripciones_estudiante_id on inscripciones(estudiante_id);
create index idx_actividades_curso_id on actividades(curso_id);
create index idx_materiales_actividad_actividad_id on materiales_actividad(actividad_id);
create index idx_preguntas_examen_actividad_id on preguntas_examen(actividad_id);
create index idx_entregas_actividad_id on entregas(actividad_id);
create index idx_entregas_estudiante_id on entregas(estudiante_id);
create index idx_archivos_entrega_entrega_id on archivos_entrega(entrega_id);
create index idx_respuestas_examen_entrega_id on respuestas_examen(entrega_id);

-- =========================================================================
-- 2. FUNCIONES AUXILIARES (SECURITY DEFINER, usadas dentro de las políticas)
-- =========================================================================

create or replace function public.es_docente_del_curso(p_curso_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from cursos c
    where c.id = p_curso_id and c.docente_id = auth.uid()
  );
$$;

create or replace function public.esta_inscrito_en_curso(p_curso_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from inscripciones i
    where i.curso_id = p_curso_id and i.estudiante_id = auth.uid()
  );
$$;

create or replace function public.es_docente_de_actividad(p_actividad_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from actividades a
    join cursos c on c.id = a.curso_id
    where a.id = p_actividad_id and c.docente_id = auth.uid()
  );
$$;

create or replace function public.esta_inscrito_en_actividad(p_actividad_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from actividades a
    where a.id = p_actividad_id and public.esta_inscrito_en_curso(a.curso_id)
  );
$$;

create or replace function public.actividad_admite_entregas(p_actividad_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from actividades a
    where a.id = p_actividad_id
      and a.bloqueado_manual = false
      and (a.fecha_apertura is null or a.fecha_apertura <= now())
      and a.fecha_cierre >= now()
  );
$$;

create or replace function public.es_dueno_de_entrega(p_entrega_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from entregas e
    where e.id = p_entrega_id and e.estudiante_id = auth.uid()
  );
$$;

create or replace function public.es_docente_de_entrega(p_entrega_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from entregas e
    join actividades a on a.id = e.actividad_id
    join cursos c on c.id = a.curso_id
    where e.id = p_entrega_id and c.docente_id = auth.uid()
  );
$$;

grant execute on function
  public.es_docente_del_curso(uuid),
  public.esta_inscrito_en_curso(uuid),
  public.es_docente_de_actividad(uuid),
  public.esta_inscrito_en_actividad(uuid),
  public.actividad_admite_entregas(uuid),
  public.es_dueno_de_entrega(uuid),
  public.es_docente_de_entrega(uuid)
to authenticated;

-- =========================================================================
-- 3. RLS
-- =========================================================================

alter table perfiles enable row level security;
alter table cursos enable row level security;
alter table inscripciones enable row level security;
alter table actividades enable row level security;
alter table materiales_actividad enable row level security;
alter table preguntas_examen enable row level security;
alter table entregas enable row level security;
alter table archivos_entrega enable row level security;
alter table respuestas_examen enable row level security;
alter table evaluaciones enable row level security;

-- perfiles: cada quien ve su propio perfil; el docente ve el de sus
-- estudiantes inscritos, y el estudiante ve el de su(s) docente(s).
create policy perfiles_select_propio on perfiles
  for select using (id = auth.uid());

create policy perfiles_select_docente_ve_estudiantes on perfiles
  for select using (
    exists (
      select 1 from inscripciones i
      join cursos c on c.id = i.curso_id
      where i.estudiante_id = perfiles.id and c.docente_id = auth.uid()
    )
  );

create policy perfiles_select_estudiante_ve_docente on perfiles
  for select using (
    exists (
      select 1 from cursos c
      join inscripciones i on i.curso_id = c.id
      where c.docente_id = perfiles.id and i.estudiante_id = auth.uid()
    )
  );

create policy perfiles_update_propio on perfiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- el rol se fija en el alta (trigger); nadie puede cambiarlo después.
create or replace function public.prevenir_cambio_rol()
returns trigger
language plpgsql
as $$
begin
  if new.rol <> old.rol then
    raise exception 'No se puede modificar el rol de un perfil existente';
  end if;
  return new;
end;
$$;

create trigger trg_perfiles_prevenir_cambio_rol
  before update on perfiles
  for each row execute function public.prevenir_cambio_rol();

-- cursos: el docente ve/modifica los suyos; el estudiante ve los que cursa.
create policy cursos_select_docente on cursos
  for select using (docente_id = auth.uid());

create policy cursos_select_inscrito on cursos
  for select using (public.esta_inscrito_en_curso(id));

create policy cursos_insert_docente on cursos
  for insert with check (
    docente_id = auth.uid()
    and exists (select 1 from perfiles p where p.id = auth.uid() and p.rol = 'DOCENTE')
  );

create policy cursos_update_docente on cursos
  for update using (docente_id = auth.uid()) with check (docente_id = auth.uid());

create policy cursos_delete_docente on cursos
  for delete using (docente_id = auth.uid());

-- inscripciones: se leen/borran por el propio estudiante o el docente del
-- curso; el alta se hace únicamente vía la función inscribirse_a_curso()
-- (evita exponer clave_acceso de cursos ajenos a través de un insert directo).
create policy inscripciones_select on inscripciones
  for select using (
    estudiante_id = auth.uid() or public.es_docente_del_curso(curso_id)
  );

create policy inscripciones_delete on inscripciones
  for delete using (
    estudiante_id = auth.uid() or public.es_docente_del_curso(curso_id)
  );

-- actividades: visibles/editables por el docente del curso; visibles por
-- estudiantes inscritos.
create policy actividades_select on actividades
  for select using (
    public.es_docente_del_curso(curso_id) or public.esta_inscrito_en_curso(curso_id)
  );

create policy actividades_insert_docente on actividades
  for insert with check (public.es_docente_del_curso(curso_id));

create policy actividades_update_docente on actividades
  for update using (public.es_docente_del_curso(curso_id))
  with check (public.es_docente_del_curso(curso_id));

create policy actividades_delete_docente on actividades
  for delete using (public.es_docente_del_curso(curso_id));

-- materiales_actividad: mismo patrón que actividades.
create policy materiales_select on materiales_actividad
  for select using (
    public.es_docente_de_actividad(actividad_id)
    or public.esta_inscrito_en_actividad(actividad_id)
  );

create policy materiales_insert_docente on materiales_actividad
  for insert with check (public.es_docente_de_actividad(actividad_id));

create policy materiales_delete_docente on materiales_actividad
  for delete using (public.es_docente_de_actividad(actividad_id));

-- preguntas_examen: sin policies. Con RLS habilitado y ningún policy, la
-- tabla queda inaccesible para 'anon'/'authenticated' (autoría del examen y
-- calificación se hacen server-side con SUPABASE_SECRET_KEY, que ignora
-- RLS). Los estudiantes responden el examen a través de la vista
-- preguntas_examen_estudiante (sin la columna `correcta`), definida abajo.

-- Vista sin `correcta` para que el estudiante conteste el examen. Al no
-- fijar security_invoker, se ejecuta con los permisos del dueño de la vista
-- (igual que la tabla, sin policies para 'authenticated'), así que el
-- filtro de inscripción va explícito en el WHERE.
create view public.preguntas_examen_estudiante as
select id, actividad_id, enunciado, opciones, puntos, orden
from preguntas_examen
where public.esta_inscrito_en_actividad(actividad_id);

grant select on public.preguntas_examen_estudiante to authenticated;

-- entregas: cada estudiante ve/crea/edita solo la suya; el docente de la
-- actividad ve todas. El insert/update exige que la actividad siga
-- admitiendo entregas (dentro de fecha y sin bloqueo manual).
create policy entregas_select on entregas
  for select using (
    estudiante_id = auth.uid() or public.es_docente_de_actividad(actividad_id)
  );

create policy entregas_insert_propia on entregas
  for insert with check (
    estudiante_id = auth.uid()
    and public.esta_inscrito_en_actividad(actividad_id)
    and public.actividad_admite_entregas(actividad_id)
  );

create policy entregas_update_propia on entregas
  for update using (estudiante_id = auth.uid() and estado = 'PENDIENTE')
  with check (estudiante_id = auth.uid() and public.actividad_admite_entregas(actividad_id));

-- archivos_entrega: solo el dueño de la entrega y el docente correspondiente.
create policy archivos_entrega_select on archivos_entrega
  for select using (
    public.es_dueno_de_entrega(entrega_id) or public.es_docente_de_entrega(entrega_id)
  );

create policy archivos_entrega_insert_propio on archivos_entrega
  for insert with check (public.es_dueno_de_entrega(entrega_id));

create policy archivos_entrega_delete_propio on archivos_entrega
  for delete using (public.es_dueno_de_entrega(entrega_id));

-- respuestas_examen: solo el dueño de la entrega (al responder) y el
-- docente correspondiente (al revisar).
create policy respuestas_select on respuestas_examen
  for select using (
    public.es_dueno_de_entrega(entrega_id) or public.es_docente_de_entrega(entrega_id)
  );

create policy respuestas_insert_propio on respuestas_examen
  for insert with check (public.es_dueno_de_entrega(entrega_id));

-- evaluaciones: el estudiante dueño de la entrega solo lee; solo el
-- docente correspondiente califica (inserta/edita). La calificación
-- AUTO_EXAMEN la escribe el backend con la service key, que ignora RLS.
create policy evaluaciones_select on evaluaciones
  for select using (
    public.es_dueno_de_entrega(entrega_id) or public.es_docente_de_entrega(entrega_id)
  );

create policy evaluaciones_insert_docente on evaluaciones
  for insert with check (public.es_docente_de_entrega(entrega_id));

create policy evaluaciones_update_docente on evaluaciones
  for update using (public.es_docente_de_entrega(entrega_id))
  with check (public.es_docente_de_entrega(entrega_id));

-- al registrar/editar una evaluación, la entrega pasa a CALIFICADO.
create or replace function public.actualizar_estado_entrega()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update entregas set estado = 'CALIFICADO' where id = new.entrega_id;
  return new;
end;
$$;

create trigger trg_evaluaciones_actualizar_estado
  after insert or update on evaluaciones
  for each row execute function public.actualizar_estado_entrega();

-- =========================================================================
-- 4. ALTA DE USUARIO → PERFILES
-- =========================================================================

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
      when new.raw_user_meta_data ->> 'rol' in ('DOCENTE','ESTUDIANTE')
        then new.raw_user_meta_data ->> 'rol'
      else 'ESTUDIANTE'
    end,
    coalesce(new.raw_user_meta_data ->> 'nombre_completo', '')
  );
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- 5. INSCRIPCIÓN POR CLAVE DE ACCESO
-- No hay policy de INSERT directa sobre inscripciones: un estudiante nunca
-- puede hacer SELECT sobre cursos ajenos para "adivinar" claves, y esta
-- función (SECURITY DEFINER) es el único camino para inscribirse.
-- =========================================================================

create or replace function public.inscribirse_a_curso(p_clave_acceso text)
returns cursos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curso cursos%rowtype;
  v_rol text;
begin
  select rol into v_rol from perfiles where id = auth.uid();
  if v_rol is distinct from 'ESTUDIANTE' then
    raise exception 'Solo un estudiante puede inscribirse a un curso';
  end if;

  select * into v_curso from cursos where clave_acceso = p_clave_acceso;
  if not found then
    raise exception 'Clave de acceso inválida';
  end if;

  insert into inscripciones (curso_id, estudiante_id)
  values (v_curso.id, auth.uid())
  on conflict (curso_id, estudiante_id) do nothing;

  return v_curso;
end;
$$;

revoke all on function public.inscribirse_a_curso(text) from public;
grant execute on function public.inscribirse_a_curso(text) to authenticated;

-- =========================================================================
-- 6. STORAGE
-- Convención de rutas (la fija el cliente al subir):
--   materiales-actividades: {curso_id}/{actividad_id}/{nombre_archivo}
--   archivos-entrega:       {entrega_id}/{nombre_archivo}
-- =========================================================================

insert into storage.buckets (id, name, public, allowed_mime_types)
values
  ('materiales-actividades', 'materiales-actividades', false, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png'
  ]),
  ('archivos-entrega', 'archivos-entrega', false, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png'
  ])
on conflict (id) do nothing;

-- materiales-actividades: lectura para el docente dueño y estudiantes
-- inscritos en el curso; escritura solo para el docente.
create policy storage_materiales_select on storage.objects
  for select using (
    bucket_id = 'materiales-actividades'
    and (
      public.es_docente_del_curso((storage.foldername(name))[1]::uuid)
      or public.esta_inscrito_en_curso((storage.foldername(name))[1]::uuid)
    )
  );

create policy storage_materiales_insert on storage.objects
  for insert with check (
    bucket_id = 'materiales-actividades'
    and public.es_docente_del_curso((storage.foldername(name))[1]::uuid)
  );

create policy storage_materiales_delete on storage.objects
  for delete using (
    bucket_id = 'materiales-actividades'
    and public.es_docente_del_curso((storage.foldername(name))[1]::uuid)
  );

-- archivos-entrega: privado, solo el estudiante dueño (lectura/escritura)
-- y el docente del curso (solo lectura).
create policy storage_entregas_select on storage.objects
  for select using (
    bucket_id = 'archivos-entrega'
    and (
      public.es_dueno_de_entrega((storage.foldername(name))[1]::uuid)
      or public.es_docente_de_entrega((storage.foldername(name))[1]::uuid)
    )
  );

create policy storage_entregas_insert on storage.objects
  for insert with check (
    bucket_id = 'archivos-entrega'
    and public.es_dueno_de_entrega((storage.foldername(name))[1]::uuid)
  );

create policy storage_entregas_delete on storage.objects
  for delete using (
    bucket_id = 'archivos-entrega'
    and public.es_dueno_de_entrega((storage.foldername(name))[1]::uuid)
  );
