-- Límite de tiempo en exámenes y cuestionarios (opcional, en minutos).
-- null = sin límite, como hasta ahora.
alter table actividades
  add column limite_minutos smallint
    check (limite_minutos is null or limite_minutos between 1 and 600);

-- Un intento en curso de un examen con límite de tiempo: cuándo empezó,
-- cuándo vence (inicio + límite, o el cierre del examen si llega antes) y
-- el avance que el estudiante va guardando mientras contesta (borrador:
-- { pregunta_id: respuesta }). Si se le cierra la página y no regresa, al
-- vencer se entrega con ese borrador (lib/intentos-examen.ts) — nadie pierde
-- lo que ya respondió. finalizado_at marca que el intento ya se cerró (se
-- entregó a tiempo o se entregó solo al vencer); no se usa entrega_id para
-- eso porque, si el docente borra la entrega para que el estudiante vuelva
-- a presentar, el intento viejo no debe "revivir" y entregarse otra vez.
create table intentos_examen (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references actividades(id) on delete cascade,
  estudiante_id uuid not null references auth.users(id),
  intento smallint not null,
  iniciado_at timestamptz not null default now(),
  vence_at timestamptz not null,
  borrador jsonb not null default '{}'::jsonb,
  finalizado_at timestamptz,
  entrega_id uuid references entregas(id) on delete set null,
  unique (actividad_id, estudiante_id, intento)
);

create index idx_intentos_examen_estudiante_id on intentos_examen (estudiante_id);
create index idx_intentos_examen_entrega_id on intentos_examen (entrega_id);

-- Solo lectura: el estudiante ve los suyos y el docente los de sus
-- actividades. Crear, guardar avance y cerrar un intento pasa siempre por
-- Server Actions que verifican con RLS y escriben con la secret key (mismo
-- patrón que "Lecturas protegidas server-side" en CLAUDE.md), para que
-- nadie pueda, por ejemplo, mover su propia hora de vencimiento.
alter table intentos_examen enable row level security;

create policy intentos_examen_select on intentos_examen
  for select using (
    estudiante_id = auth.uid() or public.es_docente_de_actividad(actividad_id)
  );
