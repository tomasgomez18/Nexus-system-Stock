import mongoose from 'mongoose';
import MovimientoCuentaCorriente, {
  TIPOS_MOVIMIENTO,
  ORIGENES_MOVIMIENTO,
  FORMAS_PAGO,
} from './MovimientoCuentaCorrienteModel.js';
import Cliente from '../Cliente/ClienteModel.js';
import {
  schemaCrearMovimiento,
  schemaActualizarMovimiento,
  schemaAnularMovimiento,
  validarCoherenciaTipoOrigen,
} from './MovimientoCuentaCorrienteSchema.js';
import { calcularSaldosDeCliente } from '../../utils/CuentaCorrienteUtils.js';
import { parsearFecha, fechaHoyCliente } from '../../utils/FechasUtils.js';
import { aCentavos, deCentavos } from '../../utils/DineroUtils.js';
import { recalcularImputacionesCliente } from '../CuotaCuentaCorriente/CuotasService.js';

const escaparRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const formatearMonto = (valor) =>
  `$${Number(valor || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Un pago no puede superar la deuda ni registrarse si el cliente está libre de deuda. */
const validarPagoContraDeuda = (monto, deudaCentavos) => {
  if (deudaCentavos <= 0) {
    const error = new Error('El cliente no tiene deuda pendiente. No se puede registrar un cobro');
    error.statusCode = 400;
    throw error;
  }
  if (aCentavos(monto) > deudaCentavos) {
    const error = new Error(
      `El pago (${formatearMonto(monto)}) supera la deuda pendiente (${formatearMonto(deCentavos(deudaCentavos))})`
    );
    error.statusCode = 400;
    throw error;
  }
};

/** Un credito de pago o devolucion puede cubrir cuotas pendientes: hay que reimputarlas. */
const afectaCuotas = (movimiento) =>
  movimiento?.tipo === 'credito' && ['pago', 'devolucion'].includes(movimiento.origen);

/** 'fecha' es fecha de calendario, asi que se guarda y se filtra en UTC, sin corrimiento de zona. */
const hoyEnUtc = () => {
  const { y, m, d } = fechaHoyCliente(0);
  return new Date(Date.UTC(y, m - 1, d));
};

/** 'fecha' es fecha de calendario, asi que el rango va en UTC sin corrimiento de zona. */
const rangoDeFechas = (desde, hasta) => {
  if (!desde && !hasta) return null;
  const desdeParseada = desde ? parsearFecha(desde) : null;
  const hastaParseada = hasta ? parsearFecha(hasta) : null;
  if ((desde && !desdeParseada) || (hasta && !hastaParseada)) {
    const error = new Error('Fecha inválida');
    error.statusCode = 400;
    throw error;
  }
  return {
    $gte: desdeParseada || new Date(0),
    $lt: hastaParseada ? new Date(hastaParseada.getTime() + 86400000) : new Date(8640000000000000),
  };
};

const buscarCliente = async (clienteId) => {
  if (!mongoose.Types.ObjectId.isValid(clienteId)) {
    const error = new Error('Cliente inválido');
    error.statusCode = 400;
    throw error;
  }
  const cliente = await Cliente.findById(clienteId);
  if (!cliente) {
    const error = new Error('Cliente no encontrado');
    error.statusCode = 404;
    throw error;
  }
  return cliente;
};

const obtenerMovimiento = async (clienteId, movimientoId) => {
  if (!mongoose.Types.ObjectId.isValid(movimientoId)) {
    const error = new Error('Movimiento inválido');
    error.statusCode = 400;
    throw error;
  }
  const movimiento = await MovimientoCuentaCorriente.findOne({ _id: movimientoId, cliente: clienteId });
  if (!movimiento) {
    const error = new Error('Movimiento no encontrado');
    error.statusCode = 404;
    throw error;
  }
  return movimiento;
};

const exigirActivo = (movimiento) => {
  if (movimiento.estado === 'anulado') {
    const error = new Error('El movimiento está anulado, no se puede modificar');
    error.statusCode = 409;
    throw error;
  }
};

export const obtenerMovimientos = async (req, res, next) => {
  try {
    const { clienteId } = req.params;
    const { tipo, origen, estado, formaPago, desde, hasta, buscar, limit = 100, offset = 0 } = req.query;
    await buscarCliente(clienteId);

    const filter = { cliente: clienteId };

    if (tipo) {
      if (!TIPOS_MOVIMIENTO.includes(tipo)) {
        return res.status(400).json({ message: 'Tipo de movimiento inválido' });
      }
      filter.tipo = tipo;
    }
    if (origen) {
      if (!ORIGENES_MOVIMIENTO.includes(origen)) {
        return res.status(400).json({ message: 'Origen de movimiento inválido' });
      }
      filter.origen = origen;
    }
    if (estado) {
      if (!['activo', 'anulado'].includes(estado)) {
        return res.status(400).json({ message: 'Estado de movimiento inválido' });
      }
      filter.estado = estado;
    }
    if (formaPago) {
      if (!FORMAS_PAGO.includes(formaPago)) {
        return res.status(400).json({ message: 'Forma de pago inválida' });
      }
      filter.formaPago = formaPago;
    }
    if (desde || hasta) {
      filter.fecha = rangoDeFechas(desde, hasta);
    }
    if (buscar) {
      const seguro = escaparRegex(String(buscar).trim());
      if (seguro) {
        filter.$or = [
          { referencia: { $regex: seguro, $options: 'i' } },
          { nota: { $regex: seguro, $options: 'i' } },
          { registradoPor: { $regex: seguro, $options: 'i' } },
        ];
      }
    }

    const limite = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const salto = Math.max(Number(offset) || 0, 0);

    const movimientos = await MovimientoCuentaCorriente.find(filter)
      .sort({ fecha: -1, fechaCreacion: -1 })
      .skip(salto)
      .limit(limite);

    res.json(movimientos);
  } catch (error) {
    next(error);
  }
};

export const crearMovimiento = async (req, res, next) => {
  try {
    const clienteId = req.params.clienteId || req.body?.cliente;
    const data = schemaCrearMovimiento.parse(req.body);
    const cliente = await buscarCliente(clienteId);

    if (data.origen === 'pago') {
      const { saldo } = await calcularSaldosDeCliente(cliente._id);
      validarPagoContraDeuda(data.monto, aCentavos(saldo));
    }

    const movement = await MovimientoCuentaCorriente.create({
      cliente: cliente._id,
      clienteNombre: cliente.nombre,
      tipo: data.tipo,
      origen: data.origen,
      monto: data.monto,
      formaPago: data.formaPago,
      fecha: parsearFecha(data.fecha) || hoyEnUtc(),
      referencia: data.referencia,
      nota: data.nota,
      estado: 'activo',
      registradoPor: req.usuario?.nombre || '',
    });

    let imputaciones = [];
    if (afectaCuotas(movement)) {
      imputaciones = await recalcularImputacionesCliente(null, cliente._id);
    }

    res.status(201).json({ ...movement.toJSON(), imputaciones });
  } catch (error) {
    next(error);
  }
};

export const actualizarMovimiento = async (req, res, next) => {
  try {
    await buscarCliente(req.params.clienteId);
    const data = schemaActualizarMovimiento.parse(req.body);
    const movimiento = await obtenerMovimiento(req.params.clienteId, req.params.movimientoId);
    exigirActivo(movimiento);

    const cambios = {};
    if (data.tipo !== undefined) cambios.tipo = data.tipo;
    if (data.origen !== undefined) cambios.origen = data.origen;
    if (data.monto !== undefined) cambios.monto = data.monto;
    if (data.formaPago !== undefined) cambios.formaPago = data.formaPago;
    if (data.fecha !== undefined) cambios.fecha = parsearFecha(data.fecha);
    if (data.referencia !== undefined) cambios.referencia = data.referencia;
    if (data.nota !== undefined) cambios.nota = data.nota;

    // La edición puede mandar solo tipo u origen: se valida la combinación final.
    const incoherencia = validarCoherenciaTipoOrigen(
      cambios.tipo ?? movimiento.tipo,
      cambios.origen ?? movimiento.origen
    );
    if (incoherencia) {
      const error = new Error(incoherencia);
      error.statusCode = 400;
      throw error;
    }

    // Si se corrige el monto de un pago, no puede superar la deuda sin ese pago.
    if (movimiento.tipo === 'credito' && movimiento.origen === 'pago' && cambios.monto !== undefined) {
      const { saldo } = await calcularSaldosDeCliente(movimiento.cliente);
      const deudaSinEstePago = aCentavos(saldo) + aCentavos(movimiento.monto);
      validarPagoContraDeuda(cambios.monto, deudaSinEstePago);
    }

    const actualizado = await MovimientoCuentaCorriente.findByIdAndUpdate(movimiento._id, cambios, {
      new: true,
      runValidators: true,
    });

    let imputaciones = [];
    if (afectaCuotas(movimiento) || afectaCuotas(actualizado)) {
      imputaciones = await recalcularImputacionesCliente(null, movimiento.cliente);
    }

    res.json({ ...actualizado.toJSON(), imputaciones });
  } catch (error) {
    next(error);
  }
};

/** Nunca se borra: la anulacion queda registrada con motivo, responsable y momento. */
export const anularMovimiento = async (req, res, next) => {
  try {
    await buscarCliente(req.params.clienteId);
    const data = schemaAnularMovimiento.parse(req.body);
    const movimiento = await obtenerMovimiento(req.params.clienteId, req.params.movimientoId);
    exigirActivo(movimiento);

    const anulado = await MovimientoCuentaCorriente.findByIdAndUpdate(
      movimiento._id,
      {
        estado: 'anulado',
        anuladoPor: req.usuario?.nombre || '',
        anuladoEn: new Date(),
        motivoAnulacion: data.motivo,
      },
      { new: true, runValidators: true }
    );

    if (afectaCuotas(movimiento)) {
      await recalcularImputacionesCliente(null, movimiento.cliente);
    }

    res.json(anulado);
  } catch (error) {
    next(error);
  }
};

export const obtenerSaldo = async (req, res, next) => {
  try {
    const cliente = await buscarCliente(req.params.clienteId);
    const resumen = await calcularSaldosDeCliente(cliente._id);
    res.json({ cliente: cliente._id, clienteNombre: cliente.nombre, ...resumen });
  } catch (error) {
    next(error);
  }
};
