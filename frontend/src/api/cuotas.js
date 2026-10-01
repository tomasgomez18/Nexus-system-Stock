import api from './axios';

export const obtenerCuotasCliente = (clienteId, params) =>
  api.get(`/clientes/${clienteId}/cuotas`, { params });
export const obtenerResumenCuotas = () => api.get('/cuotas/resumen');
export const revisarCuotas = () => api.post('/cuotas/revisar');
export const obtenerAjustesCuenta = () => api.get('/ajustes-cuenta-corriente');
export const actualizarAjustesCuenta = (data) => api.put('/ajustes-cuenta-corriente', data);
