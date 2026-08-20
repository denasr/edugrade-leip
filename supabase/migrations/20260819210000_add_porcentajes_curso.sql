-- Ponderación por categoría a nivel curso (exámenes/tareas/asistencia), en
-- vez de una ponderación por actividad individual. El cálculo de la
-- calificación final combinando estos tres porcentajes es un encargo aparte;
-- esta migración solo agrega dónde se guardan.
--
-- actividades.ponderacion queda sin usar por decisión explícita (no se
-- elimina): ya tiene default, así que dejar de enviarla desde la app no
-- rompe el not null, y ya existen actividades reales con valores ahí que
-- no queremos perder sin necesidad.

alter table cursos
  add column porcentaje_examenes integer not null default 50,
  add column porcentaje_tareas integer not null default 40,
  add column porcentaje_asistencia integer not null default 10;

alter table cursos
  add constraint cursos_porcentajes_suman_100
  check (porcentaje_examenes + porcentaje_tareas + porcentaje_asistencia = 100);
