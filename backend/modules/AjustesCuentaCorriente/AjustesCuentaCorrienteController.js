import { schemaActualizarAjustes } from './AjustesCuentaCorrienteSchema.js';
import { obtenerAjustes, actualizarAjustes } from './AjustesCuentaCorrienteService.js';

export const obtener = async (req, res, next) => {
  try {
    const ajustes = await obtenerAjustes();
    res.json(ajustes);
  } catch (error) {
    next(error);
  }
};

export const actualizar = async (req, res, next) => {
  try {
    const data = schemaActualizarAjustes.parse(req.body);
    const ajustes = await actualizarAjustes(data, req.usuario);
    res.json(ajustes);
  } catch (error) {
    next(error);
  }
};
