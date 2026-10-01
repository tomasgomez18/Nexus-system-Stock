import { z } from 'zod';

const porcentaje = (campo) =>
  z
    .number(`${campo} debe ser un número`)
    .finite(`${campo} debe ser un número`)
    .min(0, `${campo} no puede ser negativo`)
    .max(1000, `${campo} es demasiado alto`);

export const schemaActualizarAjustes = z.object({
  interesFinanciacionPorcentaje: porcentaje('El interés de financiación'),
  tasaMoraMensualPorcentaje: porcentaje('La tasa de mora mensual'),
  diasAvisoVencimiento: z
    .number('Los días de aviso deben ser un número')
    .int('Los días de aviso deben ser un número entero')
    .min(0, 'Los días de aviso no pueden ser negativos')
    .max(60, 'Los días de aviso son demasiados'),
});
