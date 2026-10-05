import { useState, useEffect } from 'react';
import { obtenerClientes } from '../../api/clientes';
import { useApi } from '../../hooks/useApi';
import IosModal from '../ui/IosModal';
import IosSearch from '../ui/IosSearch';
import LoadingSpinner from '../common/LoadingSpinner';
import { IconUsers } from '../ui/icons';
import { formatMoney } from '../../utils/format';

const saldoBadge = (saldo) => {
  const n = Number(saldo) || 0;
  if (n > 0) return { label: `Debe ${formatMoney(n)}`, cls: 'text-ios-red bg-ios-red/10' };
  if (n < 0) return { label: `A favor ${formatMoney(Math.abs(n))}`, cls: 'text-ios-green bg-ios-green/10' };
  return { label: 'Sin saldo', cls: 'text-ios-tertiary bg-ios-surface2' };
};

const SelectorCliente = ({ open, onClose, onSelect, seleccionado }) => {
  const [buscar, setBuscar] = useState('');
  const [buscarDebounced, setBuscarDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setBuscarDebounced(buscar.trim()), 300);
    return () => clearTimeout(timer);
  }, [buscar]);

  const clientesApi = useApi(
    async () => {
      const res = await obtenerClientes({ buscar: buscarDebounced || undefined, limit: 100 });
      return Array.isArray(res.data) ? res.data : [];
    },
    { auto: false, mensajeError: 'Error al cargar clientes' }
  );
  const { run: cargarClientes, loading, error } = clientesApi;
  const clientes = clientesApi.data || [];

  useEffect(() => {
    if (open) cargarClientes();
  }, [open, buscarDebounced, cargarClientes]);

  return (
    <IosModal open={open} onClose={onClose} title="Elegir cliente" maxWidth="max-w-md" showClose>
      <IosSearch value={buscar} onChange={setBuscar} placeholder="Buscar por nombre o documento" autoFocus className="mb-3" />

      {loading && clientes.length === 0 && (
        <div className="flex justify-center py-10">
          <LoadingSpinner size="h-7 w-7" />
        </div>
      )}
      {error && <p className="text-center text-sm text-ios-red py-6">{error}</p>}
      {!loading && !error && clientes.length === 0 && (
        <div className="text-center py-10">
          <IconUsers className="w-7 h-7 mx-auto text-ios-tertiary mb-2" strokeWidth={1.5} />
          <p className="text-sm text-ios-tertiary">
            {buscarDebounced ? 'No hay clientes con esa búsqueda' : 'Todavía no hay clientes cargados'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {clientes.map((cliente) => {
          const badge = saldoBadge(cliente.saldo);
          const activo = String(cliente._id) === String(seleccionado?._id);
          return (
            <button
              key={cliente._id}
              type="button"
              onClick={() => {
                onSelect(cliente);
                onClose();
              }}
              className={`w-full flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors ${
                activo ? 'border-ios-tint/60 bg-ios-tint/20 dark:border-ios-tint/50 dark:bg-ios-tint/10' : 'border-ios-separator/30 bg-ios-surface hover:bg-ios-hover/[0.05]'
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ios-label truncate">{cliente.nombre}</p>
                {cliente.documento && <p className="text-[11px] text-ios-tertiary">Doc. {cliente.documento}</p>}
              </div>
              <span className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-ios-pill tabular-nums ${badge.cls}`}>
                {badge.label}
              </span>
            </button>
          );
        })}
      </div>
    </IosModal>
  );
};

export default SelectorCliente;
