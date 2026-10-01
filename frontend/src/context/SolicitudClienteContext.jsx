import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SolicitudClienteContext } from './solicitudContexto';
import { contarSolicitudesPendientes } from '../api/solicitudesCliente';
import { useAutenticacion } from './autenticacionContexto';

const POLL_MS = 30000;

/** Cantidad de altas de cliente esperando revision del admin. Solo el admin consulta. */
export const SolicitudClienteProvider = ({ children }) => {
  const { usuario } = useAutenticacion();
  const esAdmin = usuario?.rol === 'admin';
  const [pendientesCount, setPendientesCount] = useState(0);
  const checkSeqRef = useRef(0);

  const check = useCallback(async () => {
    if (esAdmin !== true) {
      setPendientesCount(0);
      return;
    }
    const seq = ++checkSeqRef.current;
    try {
      const res = await contarSolicitudesPendientes();
      if (seq !== checkSeqRef.current) return;
      const total = Number(res.data?.total);
      setPendientesCount(Number.isFinite(total) && total > 0 ? total : 0);
    } catch {
      /* silencioso: si falla la consulta, no interrumpimos */
    }
  }, [esAdmin]);

  useEffect(() => {
    if (!usuario) return;
    check();
    const interval = setInterval(check, POLL_MS);
    return () => clearInterval(interval);
  }, [check, usuario]);

  // Al volver a la pestaña se consulta de nuevo: la app suele quedar abierta en el mostrador.
  useEffect(() => {
    if (!usuario) return undefined;
    const alVolver = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [check, usuario]);

  const value = useMemo(
    () => ({ pendientesCount, refresh: check }),
    [pendientesCount, check]
  );

  return (
    <SolicitudClienteContext.Provider value={value}>
      {children}
    </SolicitudClienteContext.Provider>
  );
};
