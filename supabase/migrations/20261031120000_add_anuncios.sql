-- Tablón de anuncios por curso: avisos generales del docente a su grupo
-- ("mañana no hay clase", "cambió la fecha del examen", enlace de la
-- videollamada) que antes se mandaban por WhatsApp/Telegram. Solo de ida:
-- los estudiantes leen, no comentan.
create table anuncios (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references cursos(id) on delete cascade,
  autor_id uuid not null references auth.users(id),
  contenido text not null check (char_length(btrim(contenido)) between 1 and 4000),
  -- Los fijados se muestran primero, sin importar su fecha.
  fijado boolean not null default false,
  created_at timestamptz not null default now(),
  -- Solo lo escribe la app al editar el texto (no un trigger de updated_at):
  -- fijar/desfijar no debe marcar el anuncio como "editado".
  editado_at timestamptz
);

create index idx_anuncios_curso_id on anuncios (curso_id, created_at desc);
create index idx_anuncios_autor_id on anuncios (autor_id);

alter table anuncios enable row level security;

create policy anuncios_select on anuncios
  for select using (
    public.es_docente_del_curso(curso_id)
    or public.esta_inscrito_en_curso(curso_id)
  );

create policy anuncios_insert_docente on anuncios
  for insert with check (
    public.es_docente_del_curso(curso_id) and autor_id = auth.uid()
  );

create policy anuncios_update_docente on anuncios
  for update using (public.es_docente_del_curso(curso_id))
  with check (public.es_docente_del_curso(curso_id));

create policy anuncios_delete_docente on anuncios
  for delete using (public.es_docente_del_curso(curso_id));
