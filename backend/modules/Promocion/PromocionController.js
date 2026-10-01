import mongoose from 'mongoose';
import Promocion from './PromocionModel.js';
import { schemaCrearPromocion } from './PromocionSchema.js';
import { verificarSuperposicion } from './PromocionService.js';
import { estadoDePromocion } from '../../utils/PreciosUtils.js';

const serializarPromocion = (promo, ahora = new Date()) => ({
  ...promo.toJSON(),
  estado: estadoDePromocion(promo, ahora),
  cantidadProductos: promo.todos ? null : (promo.productos || []).length,
});

export const obtenerPromociones = async (req, res, next) => {
  try {
    const promociones = await Promocion.find().sort({ desde: -1 }).limit(200);
    res.json(promociones.map((promo) => serializarPromocion(promo)));
  } catch (error) {
    next(error);
  }
};

export const crearPromocion = async (req, res, next) => {
  try {
    const data = schemaCrearPromocion.parse(req.body);
    const desde = new Date(data.desde);
    const hasta = new Date(data.hasta);

    await verificarSuperposicion({
      desde,
      hasta,
      todos: data.todos,
      productos: data.productos,
    });

    const promo = await Promocion.create({
      nombre: data.nombre,
      tipo: data.tipo,
      valor: data.valor,
      desde,
      hasta,
      todos: data.todos,
      productos: data.todos ? [] : data.productos,
      activa: true,
      creadoPor: req.usuario?.nombre || '',
    });

    res.status(201).json(serializarPromocion(promo));
  } catch (error) {
    next(error);
  }
};

export const cancelarPromocion = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Promoción inválida' });
    }
    const promo = await Promocion.findByIdAndUpdate(
      req.params.id,
      { $set: { activa: false } },
      { new: true }
    );
    if (!promo) {
      return res.status(404).json({ message: 'Promoción no encontrada' });
    }
    res.json(serializarPromocion(promo));
  } catch (error) {
    next(error);
  }
};

export const eliminarPromocion = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Promoción inválida' });
    }
    const promo = await Promocion.findByIdAndDelete(req.params.id);
    if (!promo) {
      return res.status(404).json({ message: 'Promoción no encontrada' });
    }
    res.json({ message: 'Promoción eliminada correctamente' });
  } catch (error) {
    next(error);
  }
};
