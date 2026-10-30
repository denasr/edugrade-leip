-- Endurecimiento menor señalado por los asesores de Supabase (30-oct-2026).
-- No cambia ningún comportamiento ni datos.

-- 1. search_path fijo en las 4 funciones que no lo tenían (lint
--    function_search_path_mutable). Sin esto, la función resuelve los nombres
--    de tabla sin esquema según el search_path de quien la llama. Las otras
--    funciones del proyecto ya lo fijaban desde su migración original.
alter function public.prevenir_cambio_rol() set search_path = public;
alter function public.actualizar_updated_at() set search_path = public;
alter function public.eliminar_estudiante_de_curso_datos(uuid, uuid) set search_path = public;
alter function public.eliminar_estudiante_de_curso_final(uuid, uuid) set search_path = public;

-- 2. Índices para las dos llaves foráneas que no tenían (lint
--    unindexed_foreign_keys).
--    respuestas_examen.pregunta_id: al editar las preguntas de un examen ya
--    presentado se borran las preguntas viejas, y el `on delete cascade`
--    busca sus respuestas por esta columna. El índice único existente es
--    (entrega_id, pregunta_id), que no sirve para buscar solo por pregunta.
create index if not exists idx_respuestas_examen_pregunta_id
  on public.respuestas_examen (pregunta_id);

--    sesiones_asistencia.creado_por: Postgres la revisa al borrar una cuenta
--    de auth.users.
create index if not exists idx_sesiones_asistencia_creado_por
  on public.sesiones_asistencia (creado_por);
