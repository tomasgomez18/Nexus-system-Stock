import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    documento: {
      type: String,
      trim: true,
      default: '',
    },
    telefono: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    direccion: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: { createdAt: 'fechaCreacion', updatedAt: 'fechaActualizacion' } }
);

clientSchema.index({ documento: 1 });

export default mongoose.model('Cliente', clientSchema, 'clientes');
