-- Permite al docente dueño del curso eliminar una sesión de asistencia
-- completa (y, por el on delete cascade ya existente en asistencias.sesion_id,
-- todos sus registros de presente/ausente/justificado). Antes de esta
-- migración ninguna de las dos tablas tenía policy de delete, así que el
-- borrado en cascada fallaría a mitad de camino: el cascade se ejecuta como
-- un delete normal del mismo rol que llama, y RLS lo evalúa igual sobre
-- asistencias, no solo sobre sesiones_asistencia.

create policy sesiones_asistencia_delete_docente on sesiones_asistencia
  for delete using (public.es_docente_del_curso(curso_id));

create policy asistencias_delete_docente on asistencias
  for delete using (public.es_docente_de_sesion(sesion_id));
