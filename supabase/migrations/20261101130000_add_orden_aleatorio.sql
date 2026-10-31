-- Por examen o cuestionario: si está activo, cada estudiante ve las
-- preguntas y las opciones en un orden distinto (y fijo para él — ver
-- lib/preguntas-examen.ts). Solo cambia cómo se muestran: las respuestas se
-- guardan por pregunta_id y por el texto de la opción, así que la
-- calificación no depende del orden.
alter table actividades
  add column orden_aleatorio boolean not null default false;
