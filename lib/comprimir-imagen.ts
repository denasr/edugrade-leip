// Reduce las fotos en el navegador antes de subirlas. El 88 % del espacio de
// Storage eran fotos de celular de ~2.5 MB (auditoría del 17-nov-2026), y el
// plan gratuito de Supabase tiene 1 GB: a ese ritmo se llenaba en enero.
// Una foto de cuaderno a 2000 px de lado mayor y calidad 0.82 se sigue
// leyendo bien y pesa 300-500 KB.
//
// Nunca bloquea una entrega: ante cualquier problema (navegador sin
// createImageBitmap, imagen que no se puede decodificar, resultado más
// pesado que el original) se sube el archivo tal cual.

const LADO_MAXIMO = 2000;
const CALIDAD_JPEG = 0.82;
// Por debajo de esto no vale la pena tocarla.
const UMBRAL_BYTES = 600 * 1024;

function extension(nombre: string): string {
  return nombre.split(".").pop()?.toLowerCase() ?? "";
}

async function aBlobJpeg(lienzo: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => lienzo.toBlob((b) => resolve(b), "image/jpeg", CALIDAD_JPEG));
}

export async function comprimirImagen(archivo: File): Promise<File> {
  const ext = extension(archivo.name);
  // JPG siempre que pase el umbral. PNG solo si es pesado: casi siempre es
  // una captura de pantalla ligera, y pasarla a JPEG le quitaría nitidez al
  // texto; uno pesado suele ser una foto guardada como PNG. HEIC no: solo
  // Safari lo decodifica.
  const esJpeg = ext === "jpg" || ext === "jpeg";
  const esPngPesado = ext === "png" && archivo.size > 1.5 * 1024 * 1024;
  if ((!esJpeg && !esPngPesado) || archivo.size < UMBRAL_BYTES) return archivo;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return archivo;

  try {
    // "from-image" respeta la orientación EXIF: sin esto, una foto vertical
    // de celular podía quedar acostada.
    const imagen = await createImageBitmap(archivo, { imageOrientation: "from-image" });
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
    const ancho = Math.round(imagen.width * escala);
    const alto = Math.round(imagen.height * escala);

    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return archivo;
    // Fondo blanco: un PNG con transparencia pasado a JPEG quedaría negro.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(imagen, 0, 0, ancho, alto);
    imagen.close();

    const blob = await aBlobJpeg(lienzo);
    if (!blob || blob.size >= archivo.size) return archivo;

    const nombre = esJpeg ? archivo.name : archivo.name.replace(/\.png$/i, ".jpg");
    return new File([blob], nombre, { type: "image/jpeg", lastModified: archivo.lastModified });
  } catch (err) {
    console.warn("No se pudo reducir la imagen; se sube la original:", err);
    return archivo;
  }
}
