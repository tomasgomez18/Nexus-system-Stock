import MovimientoCuentaCorriente from './MovimientoCuentaCorrienteModel.js';
import { prorratearPagos } from '../../utils/VentasUtils.js';
import { fechaHoyCliente } from '../../utils/FechasUtils.js';
import { redondearMonto } from '../../utils/DineroUtils.js';

export const METODO_CUENTA_CORRIENTE = 'cuentaCorriente';

const hoyEnUtc = () => {
  const { y, m, d } = fechaHoyCliente(0);
  return new Date(Date.UTC(y, m - 1, d));
};

/** Parte de un pago que se cargo a la cuenta corriente del cliente. */
export const montoEnCuentaCorriente = (pagos = []) =>
  redondearMonto(
    (pagos || [])
      .filter((pago) => pago?.metodo === METODO_CUENTA_CORRIENTE)
      .reduce((suma, pago) => suma + (Number(pago.monto) || 0), 0)
  );

/**
 * Parte de un monto devuelto que corresponde a la cuenta corriente.
 * Devolver un ticket cargado a cuenta no mueve efectivo: la deuda del cliente baja.
 */
export const montoDevueltoEnCuentaCorriente = (pagosOriginales = [], montoDevuelto) => {
  if (!pagosOriginales || pagosOriginales.length === 0) return 0;
  return montoEnCuentaCorriente(prorratearPagos(pagosOriginales, montoDevuelto));
};

const crearMovimiento = (session, datos) => MovimientoCuentaCorriente.create([{ ...datos, fecha: hoyEnUtc() }], { session });

/** Una venta cargada a cuenta corriente genera un debito por el monto(no efectivo) de la operacion. */
export const registrarDebitoDeVenta = async (session, { cliente, clienteNombre, monto, venta, usuario, nota = '', devolucion }) => {
  if (!(Number(monto) > 0)) return null;
  const [movimiento] = await crearMovimiento(session, {
    cliente: cliente._id || cliente,
    clienteNombre: clienteNombre ?? cliente.nombre ?? '',
    tipo: 'debito',
    origen: 'factura',
    monto,
    formaPago: 'ninguno',
    referencia: venta?.ticketNumero || '',
    nota,
    estado: 'activo',
    origenVenta: venta?._id,
    origenDevolucion: devolucion?._id,
    registradoPor: usuario?.nombre || '',
  });
  return movimiento;
};

/** Interés de financiación por vender en cuotas: es un debito más, con su propio origen. */
export const registrarInteresDeFinanciacion = async (
  session,
  { cliente, clienteNombre, monto, porcentaje, venta, usuario, devolucion }
) => {
  if (!(Number(monto) > 0)) return null;
  const [movimiento] = await crearMovimiento(session, {
    cliente: cliente._id || cliente,
    clienteNombre: clienteNombre ?? cliente.nombre ?? '',
    tipo: 'debito',
    origen: 'interes',
    monto,
    formaPago: 'ninguno',
    referencia: venta?.ticketNumero || '',
    nota: `Interés de financiación ${porcentaje}%`,
    estado: 'activo',
    origenVenta: venta?._id,
    origenDevolucion: devolucion?._id,
    registradoPor: usuario?.nombre || '',
  });
  return movimiento;
};

/** Devolver un ticket pagado a cuenta corriente deja la deuda a favor del cliente. */
export const registrarCreditoDeDevolucion = async (
  session,
  { cliente, clienteNombre, monto, venta, devolucion, usuario, nota = '' }
) => {
  if (!(Number(monto) > 0)) return null;
  const [movimiento] = await crearMovimiento(session, {
    cliente: cliente._id || cliente,
    clienteNombre: clienteNombre ?? cliente.nombre ?? '',
    tipo: 'credito',
    origen: 'devolucion',
    monto,
    formaPago: 'ninguno',
    referencia: venta?.ticketNumero || '',
    nota,
    estado: 'activo',
    origenVenta: venta?._id,
    origenDevolucion: devolucion?._id,
    registradoPor: usuario?.nombre || '',
  });
  return movimiento;
};

/**
 * Al anular una devolucion se anulan sus movimientos de cuenta corriente: el libro nunca borra.
 * Cubre tanto el credito por la devolucion como el debito de la venta de un canje.
 */
export const anularMovimientosDeDevolucion = async (session, devolucionId, usuario) => {
  if (!devolucionId) return 0;
  const resultado = await MovimientoCuentaCorriente.updateMany(
    { origenDevolucion: devolucionId, estado: 'activo' },
    {
      $set: {
        estado: 'anulado',
        anuladoPor: usuario?.nombre || '',
        anuladoEn: new Date(),
        motivoAnulacion: 'Se anuló la devolución que generó este movimiento',
      },
    },
    { session }
  );
  return resultado.modifiedCount || 0;
};

/**
 * Cobros en efectivo de cuentas corrientes dentro de una ventana de caja.
 * El efectivo entra a la gaveta cuando el cliente paga, no cuando compra.
 */
export const cobrosDeCuentaCorriente = async (desde, hasta, session = null) => {
  const filtro = {
    estado: 'activo',
    tipo: 'credito',
    origen: 'pago',
    fechaCreacion: { $gte: desde, $lt: hasta },
  };
  const query = MovimientoCuentaCorriente.find(filtro).select('monto formaPago');
  if (session) query.session(session);
  const cobros = await query;

  const total = redondearMonto(cobros.reduce((suma, cobro) => suma + (Number(cobro.monto) || 0), 0));
  const efectivo = redondearMonto(
    cobros
      .filter((cobro) => cobro.formaPago === 'efectivo')
      .reduce((suma, cobro) => suma + (Number(cobro.monto) || 0), 0)
  );
  return { total, efectivo };
};
