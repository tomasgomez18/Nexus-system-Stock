import { useCallback, useEffect, useRef, useState } from 'react';
import { obtenerPromocionesVigentes, obtenerProductosPromocion } from '../../api/promociones';
import { formatearRestante } from '../../utils/cuentaRegresiva';
import { formatMoney } from '../../utils/format';
import { IconChevronDown, IconClock } from '../ui/icons';
import LoadingSpinner from '../common/LoadingSpinner';

const etiquetaDescuento = (promo) =>
  promo.tipo === 'porcentaje' ? `-${promo.valor}%` : `-${formatMoney(promo.valor)}`;

const alcance = (promo) =>
  promo.todos
    ? 'Todos los productos'
    : `${promo.cantidadProductos} producto${promo.cantidadProductos === 1 ? '' : 's'}`;

const AvisoPromociones = ({ onExpirar, className = '' }) => {
  const [promos, setPromos] = useState([]);
  const [desfase, setDesfase] = useState(0);
  const [tick, setTick] = useState(0);
  const [abierta, setAbierta] = useState(null);
  const [detalles, setDetalles] = useState({});
  const onExpirarRef = useRef(onExpirar);
  onExpirarRef.current = onExpirar;

  const cargar = useCallback(async () => {
    try {
      const res = await obtenerPromocionesVigentes();
      const lista = Array.isArray(res.data?.promociones) ? res.data.promociones : [];
      const serverNow = res.data?.ahora ? new Date(res.data.ahora).getTime() : Date.now();
      setDesfase(serverNow - Date.now());
      setPromos(lista);
    } catch {
      /* el banner nunca debe romper la pantalla */
    }
  }, []);

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 60000);
    const alActualizar = () => cargar();
    const alVolver = () => {
      if (document.visibilityState === 'visible') cargar();
    };
    window.addEventListener('promosActualizadas', alActualizar);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener('promosActualizadas', alActualizar);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [cargar]);

  useEffect(() => {
    const intervalo = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(intervalo);
  }, []);

  const ahora = Date.now() + desfase;

  useEffect(() => {
    const limite = Date.now() + desfase;
    const vencidas = promos.filter((p) => new Date(p.hasta).getTime() <= limite);
    if (vencidas.length === 0) return;
    const ids = new Set(vencidas.map((p) => String(p._id)));
    setPromos((prev) => prev.filter((p) => !ids.has(String(p._id))));
    setAbierta((prev) => (prev && ids.has(prev) ? null : prev));
    onExpirarRef.current?.();
  }, [tick, promos, desfase]);

  const alternar = async (promo) => {
    const id = String(promo._id);
    if (abierta === id) {
      setAbierta(null);
      return;
    }
    setAbierta(id);
    if (detalles[id]) return;

    setDetalles((prev) => ({ ...prev, [id]: { loading: true, error: '', productos: [], total: 0, vigente: true } }));
    try {
      const res = await obtenerProductosPromocion(id, { limit: 1000 });
      setDetalles((prev) => ({
        ...prev,
        [id]: {
          loading: false,
          error: '',
          productos: Array.isArray(res.data?.productos) ? res.data.productos : [],
          total: Number(res.data?.total) || 0,
          vigente: res.data?.vigente !== false,
        },
      }));
    } catch {
      setDetalles((prev) => ({
        ...prev,
        [id]: { loading: false, error: 'No se pudieron cargar los productos', productos: [], total: 0, vigente: true },
      }));
    }
  };

  if (promos.length === 0) return null;

  const ordenadas = [...promos].sort((a, b) => new Date(a.hasta).getTime() - new Date(b.hasta).getTime());

  return (
    <div className={`space-y-2 ${className}`}>
      {ordenadas.map((promo) => {
        const id = String(promo._id);
        const detalle = detalles[id];
        const expandida = abierta === id;
        const puedeVer = !promo.todos && promo.cantidadProductos > 0;
        const inicio = new Date(promo.desde).getTime();
        const fin = new Date(promo.hasta).getTime();
        const activa = inicio <= ahora;
        const restante = activa ? fin - ahora : inicio - ahora;
        return (
          <div key={promo._id} className="rounded-2xl border border-ios-orange/30 bg-ios-orange/10 overflow-hidden">
            <div className="px-3.5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-1.5 min-w-0 text-ios-orange font-bold text-sm">
                <IconClock className="w-4 h-4 shrink-0" />
                <span className="truncate">{promo.nombre || 'Promoción'}</span>
              </span>
              <span className="text-sm font-bold text-ios-orange tabular-nums">{etiquetaDescuento(promo)}</span>
              <span className="text-[11px] text-ios-secondary">{alcance(promo)}</span>
              {puedeVer && (
                <button
                  type="button"
                  onClick={() => alternar(promo)}
                  aria-expanded={expandida}
                  className="ios-btn-press inline-flex items-center gap-1 text-[11px] font-semibold text-ios-orange hover:underline"
                >
                  <IconChevronDown
                    className={`w-3 h-3 transition-transform ${expandida ? 'rotate-180' : ''}`}
                    strokeWidth={2.4}
                  />
                  {expandida ? 'Ocultar productos' : 'Ver productos'}
                </button>
              )}
              <span className="ml-auto text-[11px] font-semibold text-ios-label tabular-nums whitespace-nowrap">
                {activa ? 'Termina en ' : 'Empieza en '}
                {formatearRestante(restante)}
              </span>
            </div>

            {expandida && (
              <div className="border-t border-ios-orange/20 bg-ios-surface/40 max-h-72 overflow-y-auto">
                {detalle?.loading ? (
                  <div className="py-4 flex justify-center">
                    <LoadingSpinner size="h-5 w-5" />
                  </div>
                ) : detalle?.error ? (
                  <p className="px-3.5 py-3 text-[11px] text-ios-red">{detalle.error}</p>
                ) : detalle?.productos?.length ? (
                  <>
                    <div className="divide-y divide-ios-orange/10">
                      {detalle.productos.map((p) => (
                        <div key={p._id} className="px-3.5 py-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-ios-label truncate">{p.nombre}</p>
                            <p className="text-[11px] text-ios-tertiary">
                              Stock {p.cantidad}
                              {p.categoria ? ` · ${p.categoria}` : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            {detalle.vigente ? (
                              <>
                                <span className="block text-[11px] text-ios-tertiary line-through">
                                  {formatMoney(p.precio)}
                                </span>
                                <span className="text-[13px] font-bold text-ios-orange">{formatMoney(p.precioOferta)}</span>
                              </>
                            ) : (
                              <>
                                <span className="block text-[13px] font-semibold text-ios-secondary">
                                  {formatMoney(p.precio)}
                                </span>
                                <span className="text-[11px] text-ios-orange">
                                  Con descuento: {formatMoney(p.precioOferta)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {detalle.total > detalle.productos.length && (
                      <p className="px-3.5 py-2 text-[11px] text-ios-tertiary border-t border-ios-orange/10">
                        Mostrando {detalle.productos.length} de {detalle.total} productos.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="px-3.5 py-3 text-[11px] text-ios-tertiary">No tiene productos cargados.</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AvisoPromociones;
