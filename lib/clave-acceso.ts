// Clave de acceso de 6 caracteres para un curso (al crearlo, al duplicarlo o
// al renovarla). Sin 0/O ni 1/I/L, para que no se confundan al copiarla a mano.
export function generarClaveAcceso() {
  const alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let clave = "";
  for (let i = 0; i < 6; i++) {
    clave += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  }
  return clave;
}
