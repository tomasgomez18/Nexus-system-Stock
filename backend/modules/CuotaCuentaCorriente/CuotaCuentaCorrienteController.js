import mongoose from 'mongoose';
import CuotaCuentaCorriente, { ESTADOS_CUOTA } from './CuotaCuentaCorrienteModel.js';
import Cliente from '../Cliente/ClienteModel.js';
import { obtenerAjustes } from '../AjustesCuentaCorriente/AjustesCuentaCorrienteService.js';
import { revisarCuotas, saldoPendienteDeCuota, esCuotaVencida, hoyEnUtc } from './CuotasService.js';
import { deCentavos } from '../../utils/DineroUtils.js';

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

export const obtenerCuotasDeCliente = async (req, res, next) => {
  try {
    const { clienteId } = req.params;
    await buscarCliente(clienteId);
    const { estado } = req.query;

    const filtro = { cliente: clienteId };
    if (estado) {
      const estados = String(estado).split(',').map((e) => e.trim()).filter(Boolean);
      if (estados.some((e) => !ESTADOS_CUOTA.includes(e))) {
        return res.status(400).json({ message: 'Estado de cuota inválido' });
      }
      filtro.estado = { $in: estados };
    }

    const cuotas = await CuotaCuentaCorriente.find(filtro).sort({ fechaVencimiento: 1, numero: 1 });
    res.json(
      cuotas.map((cuota) => ({
        ...cuota.toJSON(),
        saldoPendiente: saldoPendienteDeCuota(cuota),
        vencida: esCuotaVencida(cuota),
      }))
    );
  } catch (error) {
    next(error);
  }
};

export const obtenerResumenCuotas = async (req, res, next) => {
  try {
    const ajustes = await obtenerAjustes();
    const hoy = hoyEnUtc();
    const dias = Math.max(Number(ajustes.diasAvisoVencimiento) || 0, 0);
    const limite = new Date(hoy.getTime() + dias * 86400000);

    const [vencidas, porVencer, pendientes, agregado] = await Promise.all([
      CuotaCuentaCorriente.countDocuments({
        estado: { $in: ['pendiente', 'parcial'] },
        fechaVencimiento: { $lt: hoy },
      }),
      CuotaCuentaCorriente.countDocuments({
        estado: { $in: ['pendiente', 'parcial'] },
        fechaVencimiento: { $gte: hoy, $lte: limite },
      }),
      CuotaCuentaCorriente.countDocuments({ estado: { $in: ['pendiente', 'parcial'] } }),
      CuotaCuentaCorriente.aggregate([
        { $match: { estado: { $in: ['pendiente', 'parcial'] } } },
        {
          $group: {
            _id: null,
            total: { $sum: { $subtract: [{ $add: ['$monto', '$moraAcumulada'] }, '$pagado'] } },
          },
        },
      ]),
    ]);

    res.json({
      vencidas,
      porVencer,
      pendientes,
      totalPendiente: deCentavos(agregado[0]?.total || 0),
    });
  } catch (error) {
    next(error);
  }
};

export const revisarAhora = async (req, res, next) => {
  try {
    const resultado = await revisarCuotas();
    res.json(resultado);
  } catch (error) {
    next(error);
  }
};
