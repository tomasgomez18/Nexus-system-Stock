import mongoose from 'mongoose';
import Cliente from './ClienteModel.js';
import MovimientoCuentaCorriente from '../MovimientoCuentaCorriente/MovimientoCuentaCorrienteModel.js';
import CuotaCuentaCorriente from '../CuotaCuentaCorriente/CuotaCuentaCorrienteModel.js';
import { schemaCrearCliente, schemaActualizarCliente } from './ClienteSchema.js';
import { calcularSaldosPorCliente, calcularSaldosDeCliente } from '../../utils/CuentaCorrienteUtils.js';
import { hoyEnUtc } from '../CuotaCuentaCorriente/CuotasService.js';

const escaparRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const encontrarDuplicado = (nombre, excluirId) => {
  const filter = { nombre: { $regex: `^${escaparRegex(nombre.trim())}$`, $options: 'i' } };
  if (excluirId) filter._id = { $ne: excluirId };
  return Cliente.findOne(filter);
};

const filtroCuotasVencidas = (clienteIds) => ({
  cliente: { $in: clienteIds },
  estado: { $in: ['pendiente', 'parcial'] },
  fechaVencimiento: { $lt: hoyEnUtc() },
});

/** Cuotas vencidas por cliente, para marcarlo en la lista. */
const cuotasVencidasPorCliente = async (clienteIds) => {
  if (!clienteIds || clienteIds.length === 0) return new Map();
  const filas = await CuotaCuentaCorriente.aggregate([
    { $match: filtroCuotasVencidas(clienteIds) },
    { $group: { _id: '$cliente', cantidad: { $sum: 1 } } },
  ]);
  return new Map(filas.map((fila) => [String(fila._id), fila.cantidad]));
};

const conSaldo = (cliente, resumen, cuotasVencidas = 0) => ({
  ...cliente.toObject(),
  totalDebitos: resumen.totalDebitos,
  totalCreditos: resumen.totalCreditos,
  saldo: resumen.saldo,
  cuotasVencidas,
});

export const obtenerClientes = async (req, res, next) => {
  try {
    const { buscar, limit = 50, offset = 0 } = req.query;
    const filter = {};

    if (buscar) {
      const seguro = escaparRegex(String(buscar).trim());
      if (seguro) {
        filter.$or = [
          { nombre: { $regex: seguro, $options: 'i' } },
          { documento: { $regex: seguro, $options: 'i' } },
        ];
      }
    }

    const limite = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const salto = Math.max(Number(offset) || 0, 0);

    const clientes = await Cliente.find(filter).sort({ nombre: 1 }).skip(salto).limit(limite);
    const ids = clientes.map((cliente) => cliente._id);
    const [saldos, vencidas] = await Promise.all([
      calcularSaldosPorCliente(ids),
      cuotasVencidasPorCliente(ids),
    ]);
    const resultado = clientes.map((cliente) => conSaldo(
      cliente,
      saldos.get(String(cliente._id)) || { totalDebitos: 0, totalCreditos: 0, saldo: 0 },
      vencidas.get(String(cliente._id)) || 0
    ));

    res.json(resultado);
  } catch (error) {
    next(error);
  }
};

export const obtenerCliente = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Cliente inválido' });
    }
    const cliente = await Cliente.findById(req.params.id);
    if (!cliente) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }
    const resumen = await calcularSaldosDeCliente(cliente._id);
    const cuotasVencidas = await CuotaCuentaCorriente.countDocuments(filtroCuotasVencidas([cliente._id]));
    res.json(conSaldo(cliente, resumen, cuotasVencidas));
  } catch (error) {
    next(error);
  }
};

export const crearCliente = async (req, res, next) => {
  try {
    const data = schemaCrearCliente.parse(req.body);
    const duplicado = await encontrarDuplicado(data.nombre);
    if (duplicado) {
      return res.status(409).json({ message: `Ya existe un cliente llamado "${data.nombre}"` });
    }
    const customer = await Cliente.create(data);
    res.status(201).json(conSaldo(customer, { totalDebitos: 0, totalCreditos: 0, saldo: 0 }));
  } catch (error) {
    next(error);
  }
};

export const actualizarCliente = async (req, res, next) => {
  try {
    const data = schemaActualizarCliente.parse(req.body);
    if (data.nombre) {
      const duplicado = await encontrarDuplicado(data.nombre, req.params.id);
      if (duplicado) {
        return res.status(409).json({ message: `Ya existe un cliente llamado "${data.nombre}"` });
      }
    }
    const customer = await Cliente.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    });
    if (!customer) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }
    const resumen = await calcularSaldosDeCliente(customer._id);
    res.json(conSaldo(customer, resumen));
  } catch (error) {
    next(error);
  }
};

/** El libro contable no se borra nunca: si tiene movimientos, el cliente queda marcado como inactivo. */
export const eliminarCliente = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Cliente inválido' });
    }
    const customer = await Cliente.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }
    const movimientos = await MovimientoCuentaCorriente.countDocuments({ cliente: customer._id });
    if (movimientos > 0) {
      return res.status(409).json({
        message: 'No se puede eliminar, el cliente tiene movimientos en su cuenta corriente',
      });
    }
    await customer.deleteOne();
    res.json({ message: 'Cliente eliminado correctamente' });
  } catch (error) {
    next(error);
  }
};
