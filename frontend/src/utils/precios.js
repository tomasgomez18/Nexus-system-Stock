import { formatMoney } from './format';

/** El producto tiene una promoción vigente con precio menor al normal. */
export const tieneOferta = (producto) =>
  Boolean(producto?.oferta && Number(producto.oferta.precioOferta) < Number(producto.precio));

/** Precio que se cobra hoy: el de oferta si hay promoción vigente, si no el normal. */
export const precioVigente = (producto) =>
  tieneOferta(producto) ? Number(producto.oferta.precioOferta) : Number(producto?.precio) || 0;

/** Texto corto de la oferta para badges: "-20%" o "-$1.500,00". */
export const etiquetaOferta = (oferta) => {
  if (!oferta) return '';
  return oferta.tipo === 'porcentaje' ? `-${oferta.valor}%` : `-${formatMoney(oferta.valor)}`;
};
