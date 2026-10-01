import api from './axios';

export const obtenerClientes = (params) => api.get('/clientes', { params });
export const obtenerCliente = (id) => api.get(`/clientes/${id}`);
export const crearCliente = (data) => api.post('/clientes', data);
export const actualizarCliente = (id, data) => api.put(`/clientes/${id}`, data);
export const eliminarCliente = (id) => api.delete(`/clientes/${id}`);

export const obtenerMovimientosCuenta = (clienteId, params) =>
  api.get(`/clientes/${clienteId}/movimientos`, { params });
export const crearMovimientoCuenta = (clienteId, data) =>
  api.post(`/clientes/${clienteId}/movimientos`, data);
export const actualizarMovimientoCuenta = (clienteId, movimientoId, data) =>
  api.put(`/clientes/${clienteId}/movimientos/${movimientoId}`, data);
export const anularMovimientoCuenta = (clienteId, movimientoId, motivo) =>
  api.patch(`/clientes/${clienteId}/movimientos/${movimientoId}/anular`, { motivo });
export const obtenerSaldoCliente = (clienteId) => api.get(`/clientes/${clienteId}/saldo`);
