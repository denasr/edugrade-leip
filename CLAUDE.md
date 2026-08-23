# CLAUDE.md — EduGrade LEIP

## Qué es esto
Plataforma de tareas, exámenes y asistencia para grupos de LEIP (UPN Unidad 321 Zacatecas).
Sustituye el flujo actual de foto + WhatsApp/Telegram por una app con autenticación real,
entrega de archivos, calificación (manual para tareas, automática para exámenes), registro
de asistencia por sesión, y una calificación final por estudiante que combina las tres
categorías según la ponderación que define cada docente en su curso.

Este proyecto es **independiente**. No debe tocar, reutilizar ni referenciar los repos o
proyectos de Supabase de `aula-virtual-dena` ni `miniapp-academica` (backend/frontend). Si
alguna tarea requiere código o configuración de esos proyectos, pregúntame primero.

## Stack
- Next.js (App Router) + TypeScript + TailwindCSS
- Supabase: Postgres con RLS, Supabase Auth, Supabase Storage
- Despliegue en Vercel

## Decisiones de arquitectura (y por qué)
Este proyecto viene de un prototipo probado como artifact de Claude (React + almacenamiento
en el navegador). Al construir la versión real, estas son las diferencias deliberadas:

- **Autenticación real para ambos roles.** El prototipo usaba un PIN fijo ("1234") para el
  docente y contraseñas en texto plano para estudiantes — válido para probar el flujo, no
  para producción. Aquí ambos roles se autentican con Supabase Auth (email + contraseña).
- **Archivos en Supabase Storage, no en la base de datos.** El prototipo guardaba los
  archivos como base64 con un tope artificial de 3 MB. Aquí los archivos van a buckets de
  Storage; la base de datos solo guarda la ruta.
- **Esquema relacional normalizado.** El prototipo guardaba alumnos y preguntas como arrays
  embebidos en un solo JSON. Aquí van en tablas propias con relaciones foráneas (ver abajo).
- **Sin calificación automática por IA para tareas.** El docente califica manualmente cada
  tarea. El examen de opción múltiple sí se autocalifica, pero con lógica determinista
  (conteo de puntos), sin llamar a ningún modelo.
- **Sin código de actividad ni rúbrica de evaluación.** Decisión explícita tras probar el
  prototipo: las actividades se identifican por título, y la calificación es una nota
  (0-10) más retroalimentación libre, sin desglose por criterios.
- **Lecturas protegidas server-side con la secret key, no con RLS nueva.** Dos casos: la
  columna `correcta` de `preguntas_examen` (esa tabla no tiene ninguna policy — es
  inaccesible salvo con la secret key), y la asistencia de un estudiante en
  `/estudiante/cursos/[id]` (esas tablas solo tienen policy de lectura para el docente). En
  ambos casos el patrón es el mismo: verificar con el cliente normal (RLS) que quien pide
  el dato tiene derecho a verlo, y **solo después** usar `lib/supabase/admin.ts` para leer
  nada más lo puntual — nunca la tabla cruda, nunca datos de otro usuario. Si hace falta
  este patrón en un caso nuevo, seguirlo en vez de agregar una policy de lectura amplia.
- **`actividades.ponderacion` quedó en el esquema pero sin usar.** La ponderación se movió a
  nivel curso (ver "Calificación final" abajo); dentro de cada categoría (tareas, exámenes)
  todas las actividades cuentan igual entre sí (promedio simple). La columna no se eliminó
  a propósito — ya tiene `default 10` y hay actividades reales con valores ahí — pero
  ningún formulario la muestra ni la escribe. No reactivarla sin decisión explícita.

## Roles
- **DOCENTE**: crea cursos (con clave de acceso) y define ahí la ponderación de tareas,
  exámenes y asistencia; publica actividades (tarea o examen) y puede editarlas después
  (incluso con entregas ya recibidas); adjunta material de apoyo; revisa entregas y
  califica tareas; toma asistencia por sesión (una por día).
- **ESTUDIANTE**: se inscribe a un curso con su clave de acceso, entrega tareas (archivo +
  comentario opcional) o responde exámenes de opción múltiple (autocalificados), y ve su
  calificación final combinada del curso.

## Reglas de negocio confirmadas en el prototipo
- Una actividad tiene `fecha_apertura` (opcional) y `fecha_cierre` (obligatoria). Fuera de
  ese rango, o si el docente la bloquea manualmente, no admite entregas.
- Al eliminar una actividad se eliminan también sus entregas asociadas y sus archivos en
  Storage (materiales y entregas).
- Formatos de archivo permitidos, tanto para material de apoyo como para entregas: PDF,
  DOCX, JPG, PNG.
- El examen de opción múltiple se autocalifica al momento de la entrega. Las tareas quedan
  en estado `PENDIENTE` hasta que el docente asigna calificación (0-10) y retroalimentación.
- Un estudiante solo puede entregar una vez por actividad (edítese si se requiere reenvío).

## Funcionalidad agregada durante el desarrollo (no venía del prototipo)
- **Edición de tareas y exámenes.** El docente puede editar título, instrucciones, fechas,
  material (reemplazar o quitar) y, en un examen, las preguntas — se permite aunque ya
  haya entregas. Al editar un examen, las preguntas solo se reemplazan si de verdad
  cambiaron (se comparan contra las actuales); si no cambiaron, no se tocan, para no
  arrastrar en cascada las `respuestas_examen` ya presentadas solo por guardar un cambio
  no relacionado (p. ej. la fecha de cierre). Si el examen ya tiene respuestas y sí se
  edita, se le avisa al docente antes de guardar, pero no se bloquea.
- **`/login` separado de `/registro`.** El prototipo y las primeras versiones solo tenían
  alta de cuenta; se agregó inicio de sesión normal (`signInWithPassword`) con el mismo
  redirect por rol.
- **Asistencia por sesión.** `sesiones_asistencia` (una fila por día de clase tomado en un
  curso, `unique(curso_id, fecha)` para que no se dupliquen) y `asistencias` (una fila por
  estudiante inscrito por sesión, `presente`/`ausente`/`justificado`, por default
  `presente`). Solo el docente dueño del curso puede tomarla; la lectura para el estudiante
  no pasa por RLS — ver el patrón de secret key arriba. `justificado` se agregó después
  (migración `20260822120000`) y se excluye por completo del % de asistencia: no cuenta ni
  como presente ni como ausente, ni en el numerador ni en el denominador (ver siguiente
  punto). El resumen por sesión que ve el docente muestra los tres conteos por separado.
- **Ponderación configurable por curso y calificación final combinada.** Cada curso tiene
  `porcentaje_tareas` + `porcentaje_examenes` + `porcentaje_asistencia`, editables por el
  docente pero deben sumar 100 (`CHECK` en base de datos además de la validación en la
  app). La calificación final de un estudiante combina: promedio simple de tareas
  calificadas, promedio simple de exámenes calificados, y % de asistencia. El % de
  asistencia es `presentes / (presentes + ausentes)` *desde que ese estudiante se
  inscribió* (no desde el inicio del curso) — los registros `justificado` no suman a
  ninguno de los dos lados de esa división. Si `presentes + ausentes = 0` (sin registros
  todavía, o el estudiante solo tiene justificados), no hay dato para esa categoría: se
  excluye del cálculo y su peso se reparte proporcionalmente entre las que sí tienen —
  nunca cuenta como 0 — y se le indica al estudiante que es una calificación parcial. Ver
  `lib/calificacion-final.ts` (`calcularPorcentajeAsistencia`, `calcularCalificacionFinal`).
  Por ahora esto solo se muestra al estudiante; un tablero para que el docente vea la
  calificación de todo su grupo de un vistazo es trabajo futuro, no implementado.
- **Sistema de diseño visual.** Paleta propia en `app/globals.css` vía `@theme` de
  Tailwind v4: `crema` (fondo), `verde-bosque` (primario, botones y encabezados),
  `terracota` (acentos y acciones destructivas), más colores de estado (`abierta`,
  `cerrada`, `pendiente`, `calificado`). Tipografías vía `next/font/google`: Source Serif 4
  para títulos (`font-title`), Inter para el resto, Space Mono para claves de acceso. Sin
  variantes `dark:` — un solo tema, por decisión explícita. Clases compartidas
  (`.card`, `.btn-primary`, `.btn-accent`, `.input`, `.badge-*`, `.toast`, etc.) en el mismo
  `globals.css`, para no repetir utilidades sueltas en cada archivo.

## Esquema de base de datos (estado actual)
Foto combinada de todo lo aplicado hasta ahora, no una sola migración — ver
`supabase/migrations/` para el historial exacto de cada cambio.

```sql
create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('DOCENTE','ESTUDIANTE')),
  nombre_completo text not null,
  created_at timestamptz default now()
);

create table cursos (
  id uuid primary key default gen_random_uuid(),
  docente_id uuid not null references auth.users(id),
  nombre text not null,
  grupo text not null,
  periodo text not null,
  clave_acceso text not null unique,
  -- deben sumar 100 (CHECK); ver "Calificación final combinada" arriba
  porcentaje_tareas integer not null default 40,
  porcentaje_examenes integer not null default 50,
  porcentaje_asistencia integer not null default 10,
  created_at timestamptz default now()
);

create table inscripciones (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references cursos(id) on delete cascade,
  estudiante_id uuid not null references auth.users(id),
  created_at timestamptz default now(),
  unique (curso_id, estudiante_id)
);

create table actividades (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references cursos(id) on delete cascade,
  titulo text not null,
  tipo text not null check (tipo in ('TAREA','EXAMEN')),
  instrucciones text,
  fecha_apertura timestamptz,
  fecha_cierre timestamptz not null,
  ponderacion numeric not null default 10, -- sin usar, ver nota arriba
  bloqueado_manual boolean not null default false,
  created_at timestamptz default now()
);

create table materiales_actividad (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references actividades(id) on delete cascade,
  nombre_archivo text not null,
  storage_path text not null,
  tamano_bytes bigint,
  created_at timestamptz default now()
);

create table preguntas_examen (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references actividades(id) on delete cascade,
  enunciado text not null,
  opciones jsonb not null,
  correcta text not null,
  puntos numeric not null default 5,
  orden int not null default 0
);

create table entregas (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references actividades(id) on delete cascade,
  estudiante_id uuid not null references auth.users(id),
  comentario_estudiante text,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE','CALIFICADO')),
  created_at timestamptz default now(),
  unique (actividad_id, estudiante_id)
);

create table archivos_entrega (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references entregas(id) on delete cascade,
  nombre_archivo text not null,
  storage_path text not null,
  tamano_bytes bigint,
  created_at timestamptz default now()
);

create table respuestas_examen (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references entregas(id) on delete cascade,
  -- on delete cascade agregado después (migración 20260816190000): sin esto,
  -- editar las preguntas de un examen ya presentado fallaba por violar la FK
  pregunta_id uuid not null references preguntas_examen(id) on delete cascade,
  respuesta_seleccionada text,
  unique (entrega_id, pregunta_id)
);

create table evaluaciones (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null unique references entregas(id) on delete cascade,
  calificacion_final numeric not null check (calificacion_final >= 0 and calificacion_final <= 10),
  comentarios text,
  origen text not null check (origen in ('MANUAL','AUTO_EXAMEN')),
  created_at timestamptz default now()
);

-- Agregadas en 20260820120000_add_asistencia.sql
create table sesiones_asistencia (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references cursos(id) on delete cascade,
  fecha date not null,
  creado_por uuid not null references auth.users(id),
  created_at timestamptz default now(),
  unique (curso_id, fecha)
);

create table asistencias (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references sesiones_asistencia(id) on delete cascade,
  estudiante_id uuid not null references auth.users(id),
  -- 'justificado' agregado en 20260822120000; se excluye del % de asistencia
  estado text not null default 'presente' check (estado in ('presente', 'ausente', 'justificado')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(), -- trigger la mantiene al día
  unique (sesion_id, estudiante_id)
);
```

## Permisos esperados (para las políticas RLS)
- Un docente solo ve y modifica sus propios cursos, las actividades de esos cursos, el
  material que adjunta, y las entregas/evaluaciones de sus estudiantes.
- Un estudiante solo ve los cursos en los que está inscrito, las actividades de esos
  cursos, el material adjunto de esas actividades, y **únicamente sus propias** entregas,
  archivos y evaluaciones — nunca las de otro estudiante.
- La inscripción a un curso se hace por clave de acceso (no se expone la lista completa de
  claves de acceso a estudiantes fuera del curso).
- `sesiones_asistencia` y `asistencias`: solo el docente dueño del curso tiene policy de
  lectura/escritura. El estudiante no tiene policy de lectura sobre estas tablas — su propia
  asistencia se calcula server-side con la secret key (ver "Lecturas protegidas" arriba), a
  propósito en vez de agregar una policy nueva.
- `preguntas_examen` sigue sin ninguna policy (inaccesible salvo secret key); la vista
  `preguntas_examen_estudiante` (sin la columna `correcta`) es lo único que un estudiante
  puede leer directamente para responder un examen.

## Variables de entorno
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # reemplaza a la antigua "anon key"; segura para el cliente
SUPABASE_SECRET_KEY=                    # reemplaza a la antigua "service_role key"; solo servidor, nunca en el cliente
```
Nota: Supabase renovó su sistema de llaves (publishable/secret en vez de anon/service_role).
Ambos sistemas coexisten, pero este proyecto usa el nuevo desde el inicio.

## Convenciones
- Español en textos de interfaz y nombres de tablas/columnas; inglés en nombres de
  variables/funciones de TypeScript si así se prefiere en el resto del código.
- Despliegue en Vercel; revisar `vercel.json` si se agregan rutas de API con configuración
  especial (tamaño de payload para subida de archivos, etc.).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
