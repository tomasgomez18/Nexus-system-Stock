import mongoose from 'mongoose';
import { TIPOS_PROMOCION } from '../../utils/PreciosUtils.js';

const promocionSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      trim: true,
      default: '',
    },
    tipo: {
      type: String,
      enum: TIPOS_PROMOCION,
      required: true,
    },
    /** Porcentaje (1-100) o monto fijo en pesos, según el tipo. */
    valor: {
      type: Number,
      required: true,
      min: 0,
    },
    desde: {
      type: Date,
      required: true,
    },
    hasta: {
      type: Date,
      required: true,
    },
    /** Aplica a todos los productos (incluidos los que se carguen después). */
    todos: {
      type: Boolean,
      default: false,
    },
    productos: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Producto' }],
      default: [],
    },
    /** Se pone en false al cancelar la promoción antes de su vencimiento. */
    activa: {
      type: Boolean,
      default: true,
    },
    creadoPor: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: { createdAt: 'fechaCreacion', updatedAt: 'fechaActualizacion' }, toJSON: { getters: true } }
);

promocionSchema.index({ activa: 1, desde: 1, hasta: 1 });
promocionSchema.index({ productos: 1 });

export default mongoose.model('Promocion', promocionSchema, 'promociones');
