-- Agrega HEIC/HEIF a los tipos permitidos de ambos buckets de archivos.
-- Aplicado en producción directamente vía admin.storage.updateBucket()
-- (la API de Storage, no SQL crudo) al construir el soporte de HEIC del
-- lado de la app — este archivo documenta ese cambio en el historial de
-- migraciones, igual que el resto del esquema.
--
-- La validación de tipo de archivo vive en dos lugares independientes: la
-- lista TIPOS_PERMITIDOS de cada Server Action (entregarTarea,
-- crearActividad/editarActividad) y esta lista de storage.buckets. Antes
-- de este cambio solo se había actualizado la primera — el bucket seguía
-- rechazando HEIC con "InvalidMimeType" aunque la app ya lo permitiera.
-- Un archivo rechazado aquí dispara el camino de "deshacer" la entrega en
-- entregarTarea, que a su vez destapó el bug corregido en la migración
-- de este mismo commit (ver comentario en entregarTarea): la entrega
-- podía quedar huérfana porque el estudiante nunca tuvo permiso de
-- borrar su propia fila en `entregas`.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif'
]
where id in ('archivos-entrega', 'materiales-actividades');
