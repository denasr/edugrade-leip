-- Corrige un hueco en la migración inicial: respuestas_examen.pregunta_id no
-- tenía on delete cascade, así que borrar una actividad tipo EXAMEN con
-- respuestas ya presentadas fallaba (violación de FK) en vez de cascadear
-- como sí hacía el resto del esquema (ver "Al eliminar una actividad se
-- eliminan también sus entregas asociadas" en CLAUDE.md).

alter table respuestas_examen
  drop constraint respuestas_examen_pregunta_id_fkey;

alter table respuestas_examen
  add constraint respuestas_examen_pregunta_id_fkey
  foreign key (pregunta_id) references preguntas_examen(id) on delete cascade;
