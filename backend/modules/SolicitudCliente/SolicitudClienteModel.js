import mongoose from 'mongoose';

export const ESTADOS_SOLICITUD = ['pendiente', 'aprobada', 'rechazada'];

const datosSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    documento: { type: String, trim: true, default: '' },
    telefono: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    direccion: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const requestSchema = new mongoose.Schema(
  {
    datos: {
      type: datosSchema,
      required: true,
    },
    estado: {
      type: String,
      enum: ESTADOS_SOLICITUD,
      required: true,
      default: 'pendiente',
    },
    solicitante: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
      index: true,
    },
    solicitanteNombre: {
      type: String,
      trim: true,
      default: '',
    },
    revisadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
    },
    revisadoPorNombre: {
      type: String,
      trim: true,
      default: '',
    },
    revisadoEn: {
      type: Date,
    },
    motivo: {
      type: String,
      trim: true,
      default: '',
    },
    cliente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cliente',
    },
  },
  { timestamps: { createdAt: 'fechaCreacion', updatedAt: 'fechaActualizacion' } }
);

requestSchema.index({ estado: 1, fechaCreacion: -1 });
requestSchema.index({ solicitante: 1, estado: 1 });

export default mongoose.model('SolicitudCliente', requestSchema, 'solicitudesCliente');
