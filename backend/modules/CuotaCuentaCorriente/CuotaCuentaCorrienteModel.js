import mongoose from 'mongoose';
import { campoCentavosPositivo } from '../../utils/DineroUtils.js';

export const ESTADOS_CUOTA = ['pendiente', 'parcial', 'pagada', 'cancelada'];
export const MAX_CUOTAS = 24;

const cuotaSchema = new mongoose.Schema(
  {
    cliente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cliente',
      required: true,
      index: true,
    },
    clienteNombre: {
      type: String,
      trim: true,
      default: '',
    },
    venta: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Venta',
      required: true,
    },
    ticketNumero: {
      type: String,
      trim: true,
      default: '',
    },
    numero: {
      type: Number,
      required: true,
      min: 1,
    },
    totalCuotas: {
      type: Number,
      required: true,
      min: 1,
    },
    /** Valor de la cuota (capital + interés de financiación repartido), en centavos. */
    monto: {
      ...campoCentavosPositivo,
      required: true,
    },
    /** Porcentaje de interés de financiación aplicado a la venta (snapshot). */
    interesPorcentaje: {
      type: Number,
      default: 0,
      min: 0,
    },
    /** Porcentaje mensual de mora que se aplica a la cuota vencida (snapshot). */
    tasaMoraMensual: {
      type: Number,
      default: 0,
      min: 0,
    },
    fechaVencimiento: {
      type: Date,
      required: true,
    },
    /** Total imputado a esta cuota (mora primero, luego capital), en centavos. */
    pagado: {
      ...campoCentavosPositivo,
      default: 0,
    },
    /** Mora acumulada por atraso, en centavos. */
    moraAcumulada: {
      ...campoCentavosPositivo,
      default: 0,
    },
    /** Hasta qué fecha se cobró mora: controla que no se cobre dos veces el mismo mes. */
    moraAplicadaHasta: {
      type: Date,
      default: null,
    },
    estado: {
      type: String,
      enum: ESTADOS_CUOTA,
      default: 'pendiente',
    },
    avisoPrevioEn: {
      type: Date,
      default: null,
    },
    avisoVencimientoEn: {
      type: Date,
      default: null,
    },
    canceladaPor: {
      type: String,
      trim: true,
      default: '',
    },
    motivoCancelacion: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: { createdAt: 'fechaCreacion', updatedAt: 'fechaActualizacion' }, toJSON: { getters: true } }
);

cuotaSchema.index({ cliente: 1, fechaVencimiento: 1 });
cuotaSchema.index({ estado: 1, fechaVencimiento: 1 });
cuotaSchema.index({ venta: 1 });
cuotaSchema.index({ fechaVencimiento: 1 });

export default mongoose.model('CuotaCuentaCorriente', cuotaSchema, 'cuotasCuentaCorriente');
