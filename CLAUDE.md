# CLAUDE.md — EduGrade LEIP

## Qué es esto
Plataforma de tareas y evaluaciones para grupos de LEIP (UPN Unidad 321 Zacatecas).
Sustituye el flujo actual de foto + WhatsApp/Telegram por una app con autenticación real,
entrega de archivos y calificación manual del docente.

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

## Roles
- **DOCENTE**: crea grupos (con clave de acceso), publica actividades (tarea o examen),
  puede adjuntar material de apoyo a una actividad, revisa entregas y califica.
- **ESTUDIANTE**: se inscribe a un grupo con su clave de acceso, entrega tareas (archivo +
  comentario opcional) o responde exámenes de opción múltiple.

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

## Esquema de base de datos (referencia para la primera migración)

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
  ponderacion numeric not null default 10,
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
  pregunta_id uuid not null references preguntas_examen(id),
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
```

## Permisos esperados (para las políticas RLS)
- Un docente solo ve y modifica sus propios cursos, las actividades de esos cursos, el
  material que adjunta, y las entregas/evaluaciones de sus estudiantes.
- Un estudiante solo ve los cursos en los que está inscrito, las actividades de esos
  cursos, el material adjunto de esas actividades, y **únicamente sus propias** entregas,
  archivos y evaluaciones — nunca las de otro estudiante.
- La inscripción a un curso se hace por clave de acceso (no se expone la lista completa de
  claves de acceso a estudiantes fuera del curso).

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
