import api from './axios';

export const obtenerPromociones = () => api.get('/promociones');
export const crearPromocion = (data) => api.post('/promociones', data);
export const cancelarPromocion = (id) => api.patch(`/promociones/${id}/cancelar`);
export const eliminarPromocion = (id) => api.delete(`/promociones/${id}`);
