import Promocion from './PromocionModel.js';
import Producto from '../Producto/ProductoModel.js';

/** Promociones vigentes ahora: activas y dentro del rango de fechas. */
export const promocionesVigentes = (ahora = new Date(), session = null) =>
  Promocion.find({ activa: true, desde: { $lte: ahora }, hasta: { $gte: ahora } }).session(session);

const promocionesSolapadas = (desde, hasta, session = null) =>
  Promocion.find({ activa: true, desde: { $lt: hasta }, hasta: { $gt: desde } }).session(session);

const formatearRango = (promo) => {
  const opciones = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  const desde = new Date(promo.desde).toLocaleString('es-AR', opciones);
  const hasta = new Date(promo.hasta).toLocaleString('es-AR', opciones);
  return `${desde} al ${hasta}`;
};

const nombresDeProductos = async (ids) => {
  if (!ids || ids.length === 0) return [];
  const productos = await Producto.find({ _id: { $in: ids } }).select('nombre');
  return productos.map((p) => p.nombre);
};

const listarNombres = (nombres) => {
  const visibles = nombres.slice(0, 3).join(', ');
  return nombres.length > 3 ? `${visibles} y ${nombres.length - 3} más` : visibles;
};

/**
 * No se permiten promociones superpuestas en el tiempo sobre los mismos productos.
 * Sí se permiten promociones secuenciales (una empieza cuando la otra termina).
 */
export const verificarSuperposicion = async ({ desde, hasta, todos, productos }, session = null) => {
  const candidatas = await promocionesSolapadas(desde, hasta, session);
  if (candidatas.length === 0) return;

  const idsNuevos = (productos || []).map(String);

  for (const promo of candidatas) {
    const nombre = promo.nombre ? `"${promo.nombre}"` : `del ${formatearRango(promo)}`;

    if (todos) {
      const error = new Error(
        `No se puede aplicar a todos los productos: se superpone con la promoción ${nombre}. Cancelala o esperá a que termine.`
      );
      error.statusCode = 409;
      throw error;
    }

    if (promo.todos) {
      const nombres = await nombresDeProductos(idsNuevos);
      const error = new Error(
        `Estos productos ya están en una promoción vigente (${nombre}): ${listarNombres(nombres)}.`
      );
      error.statusCode = 409;
      throw error;
    }

    const chocan = (promo.productos || []).map(String).filter((id) => idsNuevos.includes(id));
    if (chocan.length > 0) {
      const nombres = await nombresDeProductos(chocan);
      const error = new Error(
        `Estos productos ya están en una promoción vigente (${nombre}): ${listarNombres(nombres)}.`
      );
      error.statusCode = 409;
      throw error;
    }
  }
};
