// Muestra texto libre (un anuncio) con los enlaces http(s) clicables — los
// docentes pegan ligas de Meet/Zoom/Drive. Se arma con elementos de React,
// nunca con HTML crudo, así que el texto no puede inyectar nada.
const URL = /(https?:\/\/[^\s<>"]+)/g;
// Puntuación que casi siempre cierra la oración, no la URL: "ver https://x.com."
const PUNTUACION_FINAL = /[.,;:!?)\]]+$/;

export default function TextoConEnlaces({ texto }: { texto: string }) {
  const partes = texto.split(URL);
  return (
    <>
      {partes.map((parte, i) => {
        if (i % 2 === 0) return parte;
        const sobrante = parte.match(PUNTUACION_FINAL)?.[0] ?? "";
        const url = sobrante ? parte.slice(0, -sobrante.length) : parte;
        return (
          <span key={i}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all font-medium text-verde-bosque underline"
            >
              {url}
            </a>
            {sobrante}
          </span>
        );
      })}
    </>
  );
}
