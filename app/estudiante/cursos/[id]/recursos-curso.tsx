import ItemRecurso from "@/lib/item-recurso";
import type { UnidadConRecursos } from "@/lib/recursos";

// Recursos del curso para el estudiante, agrupados por unidad. Llegan ya
// filtrados por RLS (solo unidades y recursos visibles). Cada unidad es un
// <details> plegable para que un semestre de material no empuje todo lo
// demás hacia abajo; la última unidad (la más reciente) viene abierta.
export default function RecursosCurso({ unidades }: { unidades: UnidadConRecursos[] }) {
  const conRecursos = unidades.filter((u) => u.recursos.length > 0);
  if (conRecursos.length === 0) return null;

  return (
    <section className="w-full max-w-sm">
      <h2 className="font-title text-xl text-verde-bosque">Recursos</h2>

      <div className="mt-4 flex flex-col gap-3">
        {conRecursos.map((unidad, i) => (
          <details key={unidad.id} open={i === conRecursos.length - 1} className="card p-4">
            <summary className="cursor-pointer font-medium text-verde-bosque">
              {unidad.titulo}{" "}
              <span className="text-xs font-normal text-ink/70">({unidad.recursos.length})</span>
            </summary>
            <ul className="mt-3 flex flex-col gap-3">
              {unidad.recursos.map((recurso) => (
                <li key={recurso.id}>
                  <ItemRecurso recurso={recurso} />
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
