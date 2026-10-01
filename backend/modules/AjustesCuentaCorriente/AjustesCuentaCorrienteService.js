import AjustesCuentaCorriente, { AJUSTES_POR_DEFECTO } from './AjustesCuentaCorrienteModel.js';

/** Los ajustes son un documento unico: si no existe, se crea con los valores por defecto. */
export const obtenerAjustes = async () => {
  const ajustes = await AjustesCuentaCorriente.findOneAndUpdate(
    {},
    { $setOnInsert: { ...AJUSTES_POR_DEFECTO } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return ajustes;
};

export const actualizarAjustes = async (data, usuario) => {
  const ajustes = await AjustesCuentaCorriente.findOneAndUpdate(
    {},
    { $set: { ...data, actualizadoPor: usuario?.nombre || '' } },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );
  return ajustes;
};
