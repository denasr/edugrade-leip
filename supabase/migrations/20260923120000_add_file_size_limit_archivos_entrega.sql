-- Respaldo a nivel de bucket para el límite de 10 MB por archivo que ya
-- aplicaba `entregarTarea` en el servidor. Se vuelve necesario ahora que la
-- subida de archivos de una entrega pasó a hacerse directo del navegador a
-- Supabase Storage (ver comentario en app/estudiante/cursos/[id]/actions.ts
-- y formulario-entrega.tsx): el archivo ya no pasa por ninguna Server
-- Action antes de llegar a Storage, así que la validación de tamaño en el
-- cliente (bypasseable) se queda como único límite si no hay uno también
-- aquí. `allowed_mime_types` ya cumplía este mismo rol para el tipo de
-- archivo; a este bucket le faltaba el equivalente para el tamaño.
update storage.buckets
set file_size_limit = 10485760 -- 10 MB, igual a TAMANO_MAXIMO_BYTES en la app
where id = 'archivos-entrega';
