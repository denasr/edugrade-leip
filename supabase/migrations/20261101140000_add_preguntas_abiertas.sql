-- Preguntas abiertas en exámenes y cuestionarios: el estudiante escribe su
-- respuesta y el docente la califica a mano. Un examen con al menos una
-- pregunta abierta ya no se califica solo al entregarse: queda PENDIENTE
-- (sin fila en evaluaciones) hasta que el docente asigna los puntos de
-- cada respuesta abierta. Las de opción múltiple se siguen calificando
-- solas — ver lib/calificar-examen.ts.
--
-- En una pregunta ABIERTA, `opciones` queda en '[]' y `correcta` en ''
-- (las columnas son not null y no aplican).
alter table preguntas_examen
  add column tipo text not null default 'OPCION_MULTIPLE'
    check (tipo in ('OPCION_MULTIPLE', 'ABIERTA'));

-- La respuesta escrita va en respuesta_seleccionada (texto, igual que la
-- opción elegida en una de opción múltiple). Aquí, los puntos que le dio
-- el docente; null = todavía sin calificar (y siempre null en opción
-- múltiple, que se califica comparando contra `correcta`).
alter table respuestas_examen
  add column puntos_otorgados numeric check (puntos_otorgados >= 0);

-- El estudiante necesita saber el tipo para mostrar un cuadro de texto en
-- vez de opciones. Misma vista que en 20260911120000 (sigue sin exponer
-- `correcta`), con `tipo` agregada al final: create or replace view solo
-- permite agregar columnas después de las existentes.
create or replace view public.preguntas_examen_estudiante as
select id, actividad_id, enunciado, opciones, puntos, orden, tipo
from preguntas_examen
where public.actividad_visible(actividad_id);
