-- Permite al docente preparar una tarea/examen/cuestionario sin que los
-- estudiantes lo vean todavía, y publicarlo con un clic cuando esté listo.
-- Independiente de fecha_apertura/fecha_cierre (que siguen controlando solo
-- la ventana de entrega, no si la actividad se ve o no) y de
-- bloqueado_manual (que bloquea entregas de algo que sigue siendo visible).
-- Default true para que ninguna actividad ya creada se oculte de golpe.
alter table actividades
  add column visible_estudiantes boolean not null default true;

-- actividad_admite_entregas ya bloqueaba a nivel de base de datos (no solo
-- en la interfaz) según bloqueado_manual y las fechas — se agrega el mismo
-- nivel de protección real para "oculta", en vez de dejarlo como un filtro
-- solo cosmético en las páginas.
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
      and a.visible_estudiantes = true
      and a.bloqueado_manual = false
      and (a.fecha_apertura is null or a.fecha_apertura <= now())
      and a.fecha_cierre >= now()
  );
$$;

-- Nueva función, junto a esta_inscrito_en_actividad (que solo confirma
-- inscripción, sin importar visibilidad — se usa en otros lugares donde eso
-- es justo lo que hace falta, como la propia entrega ya presentada por el
-- estudiante). Esta combina ambos: inscrito Y la actividad no está oculta.
create or replace function public.actividad_visible(p_actividad_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from actividades a
    where a.id = p_actividad_id
      and a.visible_estudiantes = true
      and public.esta_inscrito_en_actividad(p_actividad_id)
  );
$$;

-- La vista de preguntas para el estudiante (sin `correcta`) es la lectura
-- más sensible que hay que cerrar para que "oculta" signifique oculta de
-- verdad: sin este cambio, un cuestionario/examen oculto seguía siendo
-- legible a través de esta vista por cualquier estudiante inscrito que
-- conociera (o adivinara) su id.
create or replace view public.preguntas_examen_estudiante as
select id, actividad_id, enunciado, opciones, puntos, orden
from preguntas_examen
where public.actividad_visible(actividad_id);

grant select on public.preguntas_examen_estudiante to authenticated;

-- Mismo motivo para el material adjunto de una tarea: mientras está oculta,
-- tampoco debe poder descargarse el archivo por más que se conozca la ruta.
drop policy if exists materiales_select on materiales_actividad;
create policy materiales_select on materiales_actividad
  for select using (
    public.es_docente_de_actividad(actividad_id)
    or public.actividad_visible(actividad_id)
  );
