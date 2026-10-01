import mongoose from 'mongoose';
import { campoCentavosPositivo } from '../../utils/DineroUtils.js';

export const TIPOS_MOVIMIENTO = ['debito', 'credito'];
export const ORIGENES_MOVIMIENTO = ['factura', 'pago', 'ajuste', 'devolucion', 'venta', 'interes', 'mora'];
export const ORIGENES_SISTEMA = ['interes', 'mora'];
export const FORMAS_PAGO = ['efectivo', 'transferencia', 'tarjeta', 'ninguno'];

const movementSchema = new mongoose.Schema(
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
    tipo: {
      type: String,
      enum: TIPOS_MOVIMIENTO,
      required: true,
    },
    origen: {
      type: String,
      enum: ORIGENES_MOVIMIENTO,
      required: true,
      default: 'ajuste',
    },
    monto: {
      ...campoCentavosPositivo,
      required: true,
    },
    formaPago: {
      type: String,
      enum: FORMAS_PAGO,
      required: true,
      default: 'ninguno',
    },
    fecha: {
      type: Date,
      required: true,
      default: Date.now,
    },
    referencia: {
      type: String,
      trim: true,
      default: '',
    },
    nota: {
      type: String,
      trim: true,
      default: '',
    },
    estado: {
      type: String,
      enum: ['activo', 'anulado'],
      required: true,
      default: 'activo',
    },
    anuladoPor: {
      type: String,
      trim: true,
      default: '',
    },
    anuladoEn: {
      type: Date,
    },
    motivoAnulacion: {
      type: String,
      trim: true,
      default: '',
    },
    origenVenta: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Venta',
    },
    origenDevolucion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Devolucion',
    },
    origenCuota: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CuotaCuentaCorriente',
    },
    registradoPor: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: { createdAt: 'fechaCreacion', updatedAt: 'fechaActualizacion' }, toJSON: { getters: true } }
);

movementSchema.index({ cliente: 1, fecha: -1 });
movementSchema.index({ fecha: -1 });
movementSchema.index({ tipo: 1, fecha: -1 });
movementSchema.index({ estado: 1 });
movementSchema.index({ origenVenta: 1 });
movementSchema.index({ origenDevolucion: 1 });
movementSchema.index({ origenCuota: 1 });

export default mongoose.model('MovimientoCuentaCorriente', movementSchema, 'movimientosCuentaCorriente');
