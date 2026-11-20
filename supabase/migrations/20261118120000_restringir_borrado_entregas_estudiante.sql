-- Un estudiante podía borrar, con su propia sesión y fuera de la app, los
-- archivos que ya había entregado (en Storage y en archivos_entrega),
-- incluso después de que la tarea cerrara o se calificara: el docente
-- perdía la evidencia, o el estudiante reemplazaba su entrega sin pasar por
-- "Eliminar entrega" del docente.
--
-- La app solo necesita que el estudiante borre archivos que todavía NO
-- forman parte de una entrega confirmada: limpieza de una subida fallida
-- (formulario-entrega.tsx, cancelarEntrega, confirmarArchivosEntrega) o de
-- una entrega a medias que se reutiliza (crearEntrega). Nunca borra filas
-- de archivos_entrega con la sesión del estudiante.

drop policy if exists archivos_entrega_delete_propio on archivos_entrega;

drop policy if exists storage_entregas_delete on storage.objects;

create policy storage_entregas_delete on storage.objects
  for delete using (
    bucket_id = 'archivos-entrega'
    and public.es_dueno_de_entrega((storage.foldername(name))[1]::uuid)
    and not exists (
      select 1 from public.archivos_entrega f
      where f.storage_path = objects.name
    )
  );
