-- Recursos del curso: material de consulta que el docente comparte con su
-- grupo, fuera de cualquier tarea o examen (lecturas, presentaciones,
-- imágenes, ligas a videos o páginas). Se organizan por unidades, y tanto
-- una unidad como un recurso suelto se pueden ocultar a los estudiantes
-- (p. ej. subir el material con anticipación y publicarlo en su momento).

create table unidades_recursos (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references cursos(id) on delete cascade,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 200),
  orden integer not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  -- Para la FK compuesta de recursos_curso: un recurso solo puede colgar de
  -- una unidad de su mismo curso.
  unique (id, curso_id)
);

create table recursos_curso (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references cursos(id) on delete cascade,
  unidad_id uuid not null,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 200),
  descripcion text check (descripcion is null or char_length(descripcion) <= 1000),
  tipo text not null check (tipo in ('ARCHIVO', 'ENLACE')),
  -- ENLACE
  url text check (url is null or url ~* '^https?://'),
  -- ARCHIVO (bucket recursos-curso, ruta {curso_id}/{uuid}/{nombre})
  nombre_archivo text,
  storage_path text unique,
  tamano_bytes bigint,
  orden integer not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (unidad_id, curso_id)
    references unidades_recursos (id, curso_id) on delete cascade,
  check (
    (tipo = 'ENLACE' and url is not null and storage_path is null)
    or (tipo = 'ARCHIVO' and storage_path is not null and nombre_archivo is not null and url is null)
  )
);

create index idx_unidades_recursos_curso on unidades_recursos (curso_id, orden);
create index idx_recursos_curso_unidad on recursos_curso (unidad_id, orden);
create index idx_recursos_curso_curso on recursos_curso (curso_id);

alter table unidades_recursos enable row level security;
alter table recursos_curso enable row level security;

-- El estudiante inscrito solo ve unidades visibles, y recursos visibles
-- dentro de una unidad visible. Ocultar la unidad oculta todo lo de adentro.
create policy unidades_recursos_select on unidades_recursos
  for select using (
    public.es_docente_del_curso(curso_id)
    or (visible and public.esta_inscrito_en_curso(curso_id))
  );

create policy unidades_recursos_insert_docente on unidades_recursos
  for insert with check (public.es_docente_del_curso(curso_id));

create policy unidades_recursos_update_docente on unidades_recursos
  for update using (public.es_docente_del_curso(curso_id))
  with check (public.es_docente_del_curso(curso_id));

create policy unidades_recursos_delete_docente on unidades_recursos
  for delete using (public.es_docente_del_curso(curso_id));

create policy recursos_curso_select on recursos_curso
  for select using (
    public.es_docente_del_curso(curso_id)
    or (
      visible
      and public.esta_inscrito_en_curso(curso_id)
      and exists (
        select 1 from public.unidades_recursos u
        where u.id = recursos_curso.unidad_id and u.visible
      )
    )
  );

create policy recursos_curso_insert_docente on recursos_curso
  for insert with check (public.es_docente_del_curso(curso_id));

create policy recursos_curso_update_docente on recursos_curso
  for update using (public.es_docente_del_curso(curso_id))
  with check (public.es_docente_del_curso(curso_id));

create policy recursos_curso_delete_docente on recursos_curso
  for delete using (public.es_docente_del_curso(curso_id));

-- Bucket aparte (no materiales-actividades): ahí cualquier inscrito puede
-- leer cualquier archivo de la carpeta del curso, y un recurso oculto no
-- estaría protegido de verdad. Aquí el estudiante solo puede leer un archivo
-- si su fila de recursos_curso le es visible (la subconsulta corre con su
-- propia RLS, la de arriba). 25 MB: las presentaciones pesan más que una
-- foto de tarea.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recursos-curso',
  'recursos-curso',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do nothing;

create policy storage_recursos_select on storage.objects
  for select using (
    bucket_id = 'recursos-curso'
    and (
      public.es_docente_del_curso((storage.foldername(name))[1]::uuid)
      or exists (
        select 1 from public.recursos_curso r
        where r.storage_path = objects.name
      )
    )
  );

create policy storage_recursos_insert on storage.objects
  for insert with check (
    bucket_id = 'recursos-curso'
    and public.es_docente_del_curso((storage.foldername(name))[1]::uuid)
  );

create policy storage_recursos_delete on storage.objects
  for delete using (
    bucket_id = 'recursos-curso'
    and public.es_docente_del_curso((storage.foldername(name))[1]::uuid)
  );
