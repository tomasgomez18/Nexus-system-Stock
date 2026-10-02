import { IconChevronRight } from '../ui/icons';
import { calcularPagina, rangoPaginas } from '../../utils/paginacion';

const OPCIONES = [10, 25, 50, 100];

const botonBase =
  'ios-btn-press inline-flex items-center justify-center rounded-ios-pill text-sm font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none';

const Paginacion = ({ pagina, porPagina, total, onPagina, onPorPagina, deshabilitado = false, className = '' }) => {
  if (Number(total) <= 0) return null;

  const { totalPaginas, paginaSegura, desde, hasta, total: totalNum } = calcularPagina(total, porPagina, pagina);
  const paginas = rangoPaginas(paginaSegura, totalPaginas);

  const ir = (n) => {
    const destino = Math.min(Math.max(n, 1), totalPaginas);
    if (!deshabilitado && destino !== paginaSegura) onPagina(destino);
  };

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-ios-tertiary">
          Mostrando{' '}
          <span className="text-ios-secondary font-semibold tabular-nums">
            {desde}–{hasta}
          </span>{' '}
          de <span className="text-ios-secondary font-semibold tabular-nums">{totalNum}</span>
        </p>
        <label className="flex items-center gap-2 text-xs text-ios-tertiary">
          Por página
          <select
            value={porPagina}
            onChange={(e) => onPorPagina(Number(e.target.value))}
            disabled={deshabilitado}
            className="px-2.5 py-1.5 bg-ios-surface2 rounded-ios-control text-ios-label text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-ios-tint/40 disabled:opacity-40"
            aria-label="Registros por página"
          >
            {OPCIONES.map((n) => (
              <option key={n} value={n} className="bg-ios-surface2">
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-1.5 ml-auto">
        <button
          type="button"
          onClick={() => ir(paginaSegura - 1)}
          disabled={deshabilitado || paginaSegura <= 1}
          className={`${botonBase} w-9 h-9 bg-ios-surface2 text-ios-secondary hover:bg-ios-surface3`}
          aria-label="Página anterior"
        >
          <IconChevronRight className="w-4 h-4 rotate-180" />
        </button>

        <div className="hidden sm:flex items-center gap-1.5">
          {paginas.map((p, i) =>
            p === '…' ? (
              <span key={`elipsis-${i}`} className="px-1.5 text-ios-tertiary text-sm select-none">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => ir(p)}
                disabled={deshabilitado}
                aria-current={p === paginaSegura ? 'page' : undefined}
                className={`${botonBase} min-w-[36px] h-9 px-2 ${
                  p === paginaSegura ? 'bg-ios-tint text-white' : 'bg-ios-surface2 text-ios-secondary hover:bg-ios-surface3'
                }`}
              >
                {p}
              </button>
            )
          )}
        </div>

        <span className="sm:hidden text-xs text-ios-secondary font-semibold tabular-nums whitespace-nowrap">
          {paginaSegura} / {totalPaginas}
        </span>

        <button
          type="button"
          onClick={() => ir(paginaSegura + 1)}
          disabled={deshabilitado || paginaSegura >= totalPaginas}
          className={`${botonBase} w-9 h-9 bg-ios-surface2 text-ios-secondary hover:bg-ios-surface3`}
          aria-label="Página siguiente"
        >
          <IconChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default Paginacion;
