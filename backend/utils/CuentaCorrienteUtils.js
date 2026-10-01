import MovimientoCuentaCorriente from '../modules/MovimientoCuentaCorriente/MovimientoCuentaCorrienteModel.js';
import { deCentavos, redondearMonto } from './DineroUtils.js';

const vacio = () => ({ totalDebitos: 0, totalCreditos: 0, saldo: 0 });

/**
 * El saldo nunca se persiste: siempre se deriva de los movimientos activos
 * (debitos - creditos), asi no puede desincronizarse del libro.
 */
const agregacionDeSaldos = (clienteIds) => {
  const filtro = { estado: 'activo' };
  if (clienteIds) {
    if (clienteIds.length === 0) return null;
    filtro.cliente = { $in: clienteIds };
  }
  return MovimientoCuentaCorriente.aggregate([
    { $match: filtro },
    {
      $group: {
        _id: '$cliente',
        debitos: { $sum: { $cond: [{ $eq: ['$tipo', 'debito'] }, '$monto', 0] } },
        creditos: { $sum: { $cond: [{ $eq: ['$tipo', 'credito'] }, '$monto', 0] } },
      },
    },
  ]);
};

const filaAResumen = (fila) => {
  const totalDebitos = deCentavos(fila.debitos);
  const totalCreditos = deCentavos(fila.creditos);
  return {
    totalDebitos,
    totalCreditos,
    saldo: redondearMonto(totalDebitos - totalCreditos),
  };
};

/** Saldo de un solo cliente. Siempre devuelve los tres campos, aunque no tenga movimientos. */
export const calcularSaldosDeCliente = async (clienteId) => {
  const filas = await agregacionDeSaldos([clienteId]);
  return filas && filas.length > 0 ? filaAResumen(filas[0]) : vacio();
};

/** Saldos de varios clientes en una sola consulta. Key: id del cliente como texto. */
export const calcularSaldosPorCliente = async (clienteIds = []) => {
  const mapa = new Map();
  const filas = await agregacionDeSaldos(clienteIds);
  for (const fila of filas || []) {
    mapa.set(String(fila._id), filaAResumen(fila));
  }
  return mapa;
};

/** Resumen en memoria de una lista de movimientos. Util para tests y para validar sin tocar la base. */
export const saldoDeMovimientos = (movimientos = []) => {
  const resumen = vacio();
  for (const movimiento of movimientos) {
    if (movimiento?.estado === 'anulado') continue;
    const monto = Number(movimiento?.monto) || 0;
    if (movimiento?.tipo === 'debito') {
      resumen.totalDebitos = redondearMonto(resumen.totalDebitos + monto);
    } else if (movimiento?.tipo === 'credito') {
      resumen.totalCreditos = redondearMonto(resumen.totalCreditos + monto);
    }
  }
  resumen.saldo = redondearMonto(resumen.totalDebitos - resumen.totalCreditos);
  return resumen;
};

/** Un saldo positivo es deuda del cliente; negativo, saldo a favor de la tienda. */
export const esSaldoDeudor = (saldo) => (Number(saldo) || 0) > 0;
