import { createContext, useContext } from 'react';

export const SolicitudClienteContext = createContext(null);

export const useSolicitudesCliente = () => {
  const ctx = useContext(SolicitudClienteContext);
  if (!ctx) throw new Error('useSolicitudesCliente debe usarse dentro de <SolicitudClienteProvider>');
  return ctx;
};
