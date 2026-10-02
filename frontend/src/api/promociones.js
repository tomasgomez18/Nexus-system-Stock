import api from './axios';

export const obtenerPromociones = () => api.get('/promociones');
export const obtenerPromocionesVigentes = () => api.get('/promociones/vigentes');
export const obtenerProductosPromocion = (id, params) => api.get(`/promociones/vigentes/${id}/productos`, { params });
export const crearPromocion = (data) => api.post('/promociones', data);
export const cancelarPromocion = (id) => api.patch(`/promociones/${id}/cancelar`);
export const eliminarPromocion = (id) => api.delete(`/promociones/${id}`);
