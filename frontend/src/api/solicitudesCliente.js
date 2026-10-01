import api from './axios';

export const obtenerSolicitudesCliente = (params) => api.get('/solicitudesCliente', { params });
export const contarSolicitudesPendientes = () => api.get('/solicitudesCliente/pendientes/count');
export const crearSolicitudCliente = (datos) => api.post('/solicitudesCliente', { datos });
export const aprobarSolicitudCliente = (id) => api.patch(`/solicitudesCliente/${id}/aprobar`);
export const rechazarSolicitudCliente = (id, motivo) => api.patch(`/solicitudesCliente/${id}/rechazar`, { motivo });
